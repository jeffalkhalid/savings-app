# Boussole — Engagements récurrents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le pilotage « catégories fixes » par des **engagements récurrents** par charge : détectés depuis l'historique, confirmés/édités, avec montant attendu, statut du mois et dérive ; barre Cockpit reframée + section dédiée.

**Architecture:** modules purs `recurring-detect` (détection) + `recurring-match` (rapprochement/totaux) + table `recurring_charges` + API/hook + `EngagementsBar`/`EngagementsModal` ; bascule du Cockpit puis retrait de l'ancienne UI fixe.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement** ; RLS `auth.uid() = user_id`.
- Calibrage : fenêtre 6 mois ; récurrent si `monthsSeen ≥ 3` ; `expected` = médiane des totaux mensuels ; rapprochement par `normalizePayee(description)` ; dérive `±15 %`.
- Modules purs sans I/O ni `Date.now` (le mois est passé en argument).
- Séquencement : ajouter le neuf + basculer le Cockpit **avant** de retirer l'ancienne UI (`FixedVariableBar`, `FixedCategoriesModal`), pour garder `tsc` clean.
- Modales motif `BudgetsModal` ; texte sur emerald `text-[#FBF3EC]`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `recurring_charges`

**Files:** Create `supabase/2026-06-27-recurring-charges.sql`

- [ ] **Step 1: Create the file**

```sql
-- Engagements récurrents (Boussole). À exécuter dans Supabase SQL editor.
create table if not exists public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  label text not null,
  expected_amount numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, payee_key)
);
alter table public.recurring_charges enable row level security;
create policy "recurring_charges_per_user" on public.recurring_charges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-27-recurring-charges.sql
git commit -m "feat(engagements): SQL migration — recurring_charges + RLS"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `recurring-detect.ts` (TDD)

**Files:** Create `lib/cockpit/recurring-detect.ts`, `lib/cockpit/recurring-detect.test.ts`

**Interfaces:**
- Consumes: `Txn` from `./types`.
- Produces: `normalizePayee(s)`; `RecurringCandidate`; `detectRecurring(allTxns, monthISO)`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/recurring-detect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePayee, detectRecurring } from "./recurring-detect";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: Math.random().toString(),
  date: "2026-06-05",
  amount: -50,
  description: "X",
  type: "expense",
  ...over,
});

describe("normalizePayee", () => {
  it("lowercases, strips accents, digits and punctuation", () => {
    expect(normalizePayee("NETFLIX 12/05 #4821")).toBe("netflix");
    expect(normalizePayee("Éléctricité EDF")).toBe("electricite edf");
  });
});

describe("detectRecurring", () => {
  const month = "2026-06";
  it("flags a payee seen in >=3 months with the median amount", () => {
    const txns: Txn[] = [
      t({ date: "2026-04-03", amount: -800, description: "LOYER AVRIL" }),
      t({ date: "2026-05-03", amount: -800, description: "LOYER MAI" }),
      t({ date: "2026-06-03", amount: -820, description: "LOYER JUIN" }),
      t({ date: "2026-06-10", amount: -30, description: "BOULANGERIE" }),
    ];
    const out = detectRecurring(txns, month);
    const loyer = out.find((c) => c.payeeKey === "loyer");
    expect(loyer).toBeTruthy();
    expect(loyer!.monthsSeen).toBe(3);
    expect(loyer!.expected).toBe(800); // median of 800,800,820
  });
  it("ignores a payee seen in fewer than 3 months", () => {
    const txns: Txn[] = [
      t({ date: "2026-05-03", amount: -20, description: "CAFE" }),
      t({ date: "2026-06-03", amount: -20, description: "CAFE" }),
    ];
    expect(detectRecurring(txns, month).find((c) => c.payeeKey === "cafe")).toBeUndefined();
  });
  it("excludes months outside the 6-month window", () => {
    const txns: Txn[] = [
      t({ date: "2025-01-03", amount: -800, description: "LOYER" }),
      t({ date: "2025-02-03", amount: -800, description: "LOYER" }),
      t({ date: "2025-03-03", amount: -800, description: "LOYER" }),
    ];
    expect(detectRecurring(txns, month)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- recurring-detect` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/recurring-detect.ts`:

```ts
import type { Txn } from "./types";

export function normalizePayee(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RecurringCandidate = {
  payeeKey: string;
  label: string;
  expected: number;
  monthsSeen: number;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function windowMonths(monthISO: string, n: number): Set<string> {
  const [y, m] = monthISO.split("-").map(Number);
  const set = new Set<string>();
  for (let i = 0; i < n; i++) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    set.add(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return set;
}

export function detectRecurring(
  allTxns: Txn[],
  monthISO: string
): RecurringCandidate[] {
  const months = windowMonths(monthISO, 6);
  const groups = new Map<
    string,
    { byMonth: Map<string, number>; labels: Map<string, number> }
  >();
  for (const t of allTxns) {
    if (t.type !== "expense") continue;
    const ym = t.date.slice(0, 7);
    if (!months.has(ym)) continue;
    const key = normalizePayee(t.description);
    if (!key) continue;
    const g = groups.get(key) ?? { byMonth: new Map(), labels: new Map() };
    g.byMonth.set(ym, (g.byMonth.get(ym) ?? 0) + Math.abs(Number(t.amount)));
    g.labels.set(t.description, (g.labels.get(t.description) ?? 0) + 1);
    groups.set(key, g);
  }
  const out: RecurringCandidate[] = [];
  for (const [payeeKey, g] of groups) {
    const monthsSeen = g.byMonth.size;
    if (monthsSeen < 3) continue;
    const expected = median([...g.byMonth.values()]);
    let label = payeeKey;
    let best = -1;
    for (const [lbl, n] of g.labels) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }
    out.push({ payeeKey, label, expected, monthsSeen });
  }
  return out.sort((a, b) => b.expected - a.expected);
}
```

- [ ] **Step 4: Run** `npm run test -- recurring-detect` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/recurring-detect.ts lib/cockpit/recurring-detect.test.ts
git commit -m "feat(engagements): recurring detection (normalizePayee + detectRecurring)"
```

---

## Task 3: `recurring-match.ts` (TDD)

**Files:** Create `lib/cockpit/recurring-match.ts`, `lib/cockpit/recurring-match.test.ts`

**Interfaces:**
- Consumes: `Txn`; `normalizePayee` from `./recurring-detect` (Task 2).
- Produces: `ChargeLite`, `ChargeStatus`, `ChargeMatch`; `matchMonth(charges, monthTxns)`; `engagementsTotals(matches, monthExpenseTotal)`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/recurring-match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchMonth, engagementsTotals } from "./recurring-match";
import type { Txn } from "./types";

const t = (over: Partial<Txn>): Txn => ({
  id: Math.random().toString(),
  date: "2026-06-05",
  amount: -50,
  description: "X",
  type: "expense",
  ...over,
});

describe("matchMonth", () => {
  const charges = [
    { payeeKey: "loyer", expected: 800 },
    { payeeKey: "netflix", expected: 14 },
    { payeeKey: "assurance", expected: 40 },
  ];
  const monthTxns = [
    t({ amount: -800, description: "LOYER JUIN" }),
    t({ amount: -20, description: "NETFLIX 06" }), // +43% → hausse
  ];
  it("matches by normalized payee and sets status/drift", () => {
    const m = matchMonth(charges, monthTxns);
    const loyer = m.find((x) => x.payeeKey === "loyer")!;
    expect(loyer.actual).toBe(800);
    expect(loyer.status).toBe("paye");
    const nf = m.find((x) => x.payeeKey === "netflix")!;
    expect(nf.status).toBe("hausse");
    expect(nf.driftPct).toBeCloseTo((20 - 14) / 14);
    const ass = m.find((x) => x.payeeKey === "assurance")!;
    expect(ass.actual).toBeNull();
    expect(ass.status).toBe("a_venir");
  });
});

describe("engagementsTotals", () => {
  it("sums paid, pending and derives variable", () => {
    const matches = matchMonth(
      [
        { payeeKey: "loyer", expected: 800 },
        { payeeKey: "assurance", expected: 40 },
      ],
      [t({ amount: -800, description: "LOYER" })]
    );
    const r = engagementsTotals(matches, 1000);
    expect(r.paid).toBe(800);
    expect(r.pending).toBe(40);
    expect(r.expectedTotal).toBe(840);
    expect(r.variable).toBe(200);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- recurring-match` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/recurring-match.ts`:

```ts
import type { Txn } from "./types";
import { normalizePayee } from "./recurring-detect";

export type ChargeLite = { payeeKey: string; expected: number };
export type ChargeStatus = "paye" | "a_venir" | "hausse" | "baisse";

export type ChargeMatch = {
  payeeKey: string;
  expected: number;
  actual: number | null;
  status: ChargeStatus;
  driftPct: number | null;
};

export function matchMonth(
  charges: ChargeLite[],
  monthTxns: Txn[]
): ChargeMatch[] {
  const spent = new Map<string, number>();
  for (const t of monthTxns) {
    if (t.type !== "expense") continue;
    const k = normalizePayee(t.description);
    spent.set(k, (spent.get(k) ?? 0) + Math.abs(Number(t.amount)));
  }
  return charges.map((c) => {
    const actual = spent.has(c.payeeKey)
      ? (spent.get(c.payeeKey) as number)
      : null;
    if (actual === null) {
      return {
        payeeKey: c.payeeKey,
        expected: c.expected,
        actual: null,
        status: "a_venir" as const,
        driftPct: null,
      };
    }
    const driftPct = c.expected > 0 ? (actual - c.expected) / c.expected : 0;
    const status: ChargeStatus =
      driftPct > 0.15 ? "hausse" : driftPct < -0.15 ? "baisse" : "paye";
    return { payeeKey: c.payeeKey, expected: c.expected, actual, status, driftPct };
  });
}

export function engagementsTotals(
  matches: ChargeMatch[],
  monthExpenseTotal: number
): { expectedTotal: number; paid: number; pending: number; variable: number } {
  let expectedTotal = 0;
  let paid = 0;
  let pending = 0;
  for (const m of matches) {
    expectedTotal += m.expected;
    if (m.actual === null) pending += m.expected;
    else paid += m.actual;
  }
  return {
    expectedTotal,
    paid,
    pending,
    variable: Math.max(0, monthExpenseTotal - paid),
  };
}
```

- [ ] **Step 4: Run** `npm run test -- recurring-match` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/recurring-match.ts lib/cockpit/recurring-match.test.ts
git commit -m "feat(engagements): month matching + engagement totals with tests"
```

---

## Task 4: API + hooks

**Files:** Create `lib/cockpit/recurring-charges-api.ts`; Modify `lib/cockpit/hooks.ts`

**Interfaces:**
- Produces: `RecurringCharge` type; `createRecurringCharge`, `updateRecurringCharge`, `deleteRecurringCharge`; `useRecurringCharges()`; `useAllTransactions` now selects `description`.

- [ ] **Step 1: Create `lib/cockpit/recurring-charges-api.ts`**

```ts
import { supabase } from "./supabase";

export type RecurringCharge = {
  id: string;
  payee_key: string;
  label: string;
  expected_amount: number;
  active: boolean;
};

export async function createRecurringCharge(
  userId: string,
  f: { payeeKey: string; label: string; expectedAmount: number }
): Promise<void> {
  const { error } = await supabase.from("recurring_charges").upsert(
    {
      user_id: userId,
      payee_key: f.payeeKey,
      label: f.label,
      expected_amount: f.expectedAmount,
      active: true,
    },
    { onConflict: "user_id,payee_key" }
  );
  if (error) throw new Error(error.message);
}

export async function updateRecurringCharge(
  id: string,
  f: { label: string; expectedAmount: number; active: boolean }
): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .update({
      label: f.label,
      expected_amount: f.expectedAmount,
      active: f.active,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringCharge(id: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_charges")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: `hooks.ts` — add `description` to `useAllTransactions`**

Change its select from `"id,date,amount,type"` to:
```ts
      .select("id,date,amount,type,description")
```

- [ ] **Step 3: `hooks.ts` — append `useRecurringCharges`**

Add the import near the other `./*-api` imports:
```ts
import type { RecurringCharge } from "./recurring-charges-api";
```
Append:
```ts
export function useRecurringCharges() {
  const [charges, setCharges] = useState<RecurringCharge[]>([]);

  const refetch = useCallback(() => {
    supabase
      .from("recurring_charges")
      .select("id,payee_key,label,expected_amount,active")
      .eq("active", true)
      .then(({ data }) => setCharges((data as RecurringCharge[]) ?? []));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { charges, refetch };
}
```

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/recurring-charges-api.ts lib/cockpit/hooks.ts
git commit -m "feat(engagements): recurring-charges API + hook + txn descriptions"
```

---

## Task 5: `EngagementsBar` + `EngagementsModal`

**Files:** Create `components/cockpit/EngagementsBar.tsx`, `components/cockpit/EngagementsModal.tsx`

**Interfaces:**
- Consumes: `eur`; `RecurringCandidate` (Task 2); `ChargeMatch`/`ChargeStatus` (Task 3); `RecurringCharge`/api (Task 4).
- Produces: `EngagementsBar({ paid, pending, variable, onDrill })`; `EngagementsModal({ userId, charges, matches, candidates, onClose, onChanged })`.

- [ ] **Step 1: Create `components/cockpit/EngagementsBar.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";

export function EngagementsBar({
  paid,
  pending,
  variable,
  onDrill,
}: {
  paid: number;
  pending: number;
  variable: number;
  onDrill: () => void;
}) {
  const total = paid + variable;
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="w-full text-left bg-card rounded-2xl p-4 mb-4"
    >
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[12.5px] font-bold">Engagements &amp; variable</span>
        <span className="font-mono-num text-[11.5px] text-ink-muted">
          {eur(paid)} · {eur(variable)}
        </span>
      </div>
      <div className="flex h-2.5 rounded-md overflow-hidden gap-[3px]">
        <div className="bg-emerald rounded-sm" style={{ width: `${pct}%` }} />
        <div className="bg-gold rounded-sm" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="flex gap-4 mt-2 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald inline-block" />
          Engagements {pct}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gold inline-block" />
          Variable {100 - pct}%
        </span>
      </div>
      {pending > 0 && (
        <div className="text-[11px] text-accent mt-2">
          Il reste {eur(pending)} d&apos;engagements à payer ce mois.
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/EngagementsModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { eur } from "@/lib/cockpit/format";
import {
  createRecurringCharge,
  updateRecurringCharge,
  deleteRecurringCharge,
  type RecurringCharge,
} from "@/lib/cockpit/recurring-charges-api";
import type { RecurringCandidate } from "@/lib/cockpit/recurring-detect";
import type { ChargeMatch, ChargeStatus } from "@/lib/cockpit/recurring-match";

const STATUS: Record<ChargeStatus, { label: string; cls: string }> = {
  paye: { label: "payé", cls: "text-emerald" },
  a_venir: { label: "à venir", cls: "text-ink-muted" },
  hausse: { label: "en hausse", cls: "text-accent" },
  baisse: { label: "en baisse", cls: "text-emerald" },
};

export function EngagementsModal({
  userId,
  charges,
  matches,
  candidates,
  onClose,
  onChanged,
}: {
  userId: string;
  charges: RecurringCharge[];
  matches: ChargeMatch[];
  candidates: RecurringCandidate[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>(
    Object.fromEntries(
      charges.map((c) => [c.id, String(Math.round(c.expected_amount))])
    )
  );
  const matchOf = (key: string) => matches.find((m) => m.payeeKey === key);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Engagements récurrents</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {charges.length > 0 && (
          <div className="mb-5">
            <div className="font-display text-[15px] mb-2">Mes engagements</div>
            {charges.map((c) => {
              const m = matchOf(c.payee_key);
              const st = m ? STATUS[m.status] : STATUS.a_venir;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 py-2 border-b border-rule"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.label}</div>
                    <div className="text-[11px] mt-0.5">
                      <span className={st.cls}>{st.label}</span>
                      {m?.driftPct != null && Math.abs(m.driftPct) > 0.15 && (
                        <span className="text-accent font-mono-num">
                          {" · "}
                          {m.driftPct >= 0 ? "+" : ""}
                          {Math.round(m.driftPct * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      className="border border-rule rounded-lg px-2 py-1.5 bg-white text-sm w-20 text-right font-mono-num"
                      type="text"
                      inputMode="decimal"
                      value={edits[c.id] ?? ""}
                      onChange={(e) =>
                        setEdits((x) => ({ ...x, [c.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const v = parseFloat((edits[c.id] || "").replace(",", "."));
                        if (isFinite(v) && v > 0 && v !== c.expected_amount) {
                          run(() =>
                            updateRecurringCharge(c.id, {
                              label: c.label,
                              expectedAmount: v,
                              active: c.active,
                            })
                          );
                        }
                      }}
                    />
                    <span className="text-ink-muted text-xs">€</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => deleteRecurringCharge(c.id))}
                      className="text-ink-muted text-lg px-1"
                      aria-label="Retirer"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <div className="font-display text-[15px] mb-2">Détectés</div>
          {!candidates.length && (
            <p className="text-ink-muted text-sm py-2">
              Pas de nouvelle charge récurrente détectée.
            </p>
          )}
          {candidates.map((cand) => (
            <div
              key={cand.payeeKey}
              className="flex items-center gap-3 py-2 border-b border-rule"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{cand.label}</div>
                <div className="text-[11px] text-ink-muted">
                  ~{eur(cand.expected)}/mois · {cand.monthsSeen} mois
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    createRecurringCharge(userId, {
                      payeeKey: cand.payeeKey,
                      label: cand.label,
                      expectedAmount: cand.expected,
                    })
                  )
                }
                className="shrink-0 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
              >
                Confirmer
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/EngagementsBar.tsx components/cockpit/EngagementsModal.tsx
git commit -m "feat(engagements): EngagementsBar + EngagementsModal"
```

---

## Task 6: Wire the Cockpit to engagements

**Files:** Modify `app/cockpit/page.tsx`

- [ ] **Step 1: Imports**

- In the hooks import block, add `useAllTransactions` and `useRecurringCharges`.
- Replace `import { fixedVariableFromInsights } from "@/lib/cockpit/fixed";` with:
```tsx
import { detectRecurring } from "@/lib/cockpit/recurring-detect";
import { matchMonth, engagementsTotals } from "@/lib/cockpit/recurring-match";
```
- Replace `import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";` with:
  `import { EngagementsBar } from "@/components/cockpit/EngagementsBar";`
- Replace `import { FixedCategoriesModal } from "@/components/cockpit/FixedCategoriesModal";` with:
  `import { EngagementsModal } from "@/components/cockpit/EngagementsModal";`

- [ ] **Step 2: Data**

Add near the other hooks:
```tsx
  const { charges, refetch: refetchCharges } = useRecurringCharges();
  const { txns: allTxns } = useAllTransactions();
```
Replace the two memos:
```tsx
  const fixedIds = useMemo(
    () => new Set(categories.filter((c) => c.is_fixed).map((c) => c.id)),
    [categories]
  );
  const split = useMemo(
    () => fixedVariableFromInsights(insights, fixedIds),
    [insights, fixedIds]
  );
```
with:
```tsx
  const monthExpenseTxns = useMemo(
    () => txns.filter((t) => t.type === "expense"),
    [txns]
  );
  const matches = useMemo(
    () =>
      matchMonth(
        charges.map((c) => ({
          payeeKey: c.payee_key,
          expected: Number(c.expected_amount),
        })),
        monthExpenseTxns
      ),
    [charges, monthExpenseTxns]
  );
  const totals = useMemo(
    () => engagementsTotals(matches, metrics.depenses),
    [matches, metrics.depenses]
  );
  const candidates = useMemo(() => {
    const confirmed = new Set(charges.map((c) => c.payee_key));
    return detectRecurring(allTxns, month).filter(
      (c) => !confirmed.has(c.payeeKey)
    );
  }, [allTxns, month, charges]);
```

- [ ] **Step 3: Replace the bar**

Replace the `FixedVariableBar` block:
```tsx
          {metrics.depenses > 0 && (
            <FixedVariableBar
              fixe={split.fixe}
              variable={split.variable}
              fixedShare={split.fixedShare}
              onDrill={() => setShowFixed(true)}
            />
          )}
```
with:
```tsx
          {(metrics.depenses > 0 || charges.length > 0) && (
            <EngagementsBar
              paid={totals.paid}
              pending={totals.pending}
              variable={totals.variable}
              onDrill={() => setShowFixed(true)}
            />
          )}
```

- [ ] **Step 4: Replace the modal**

Replace the `{showFixed && (<FixedCategoriesModal … />)}` block with:
```tsx
      {showFixed && (
        <EngagementsModal
          userId={user.id}
          charges={charges}
          matches={matches}
          candidates={candidates}
          onClose={() => setShowFixed(false)}
          onChanged={refetchCharges}
        />
      )}
```

- [ ] **Step 5: Type-check + build** — Run `npx tsc --noEmit` (clean — `fixedVariableFromInsights`/`FixedVariableBar`/`FixedCategoriesModal` no longer referenced) ; `npm run build` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(engagements): cockpit bar + section driven by recurring charges"
```

---

## Task 7: Retire the old fixed-category UI

**Files:** Delete `components/cockpit/FixedVariableBar.tsx`, `components/cockpit/FixedCategoriesModal.tsx`

**Note:** only after Task 6. Verify first.

- [ ] **Step 1: Confirm no references** — Grep the repo for `FixedVariableBar` and `FixedCategoriesModal`. Expected: only the two files themselves + docs markdown. If any page/component still imports them, STOP and report.

- [ ] **Step 2: Delete**

```bash
git rm components/cockpit/FixedVariableBar.tsx components/cockpit/FixedCategoriesModal.tsx
```

(Leave `fixed.ts` / `fixedVariableFromInsights` and `categories.is_fixed` / `setCategoryFixed` in the codebase — unused but harmless; not worth the churn/test changes.)

- [ ] **Step 3: Verify** — Run `npx tsc --noEmit` → clean ; `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(engagements): drop unused FixedVariableBar + FixedCategoriesModal"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `recurring-detect`, `recurring-match`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-27-recurring-charges.sql` first**, and an account with a few months of (imported) history:
  1. Cockpit bar « Engagements & variable » with the « il reste X € à payer » subtext; opens the modal.
  2. « Détectés » lists recurring payees (loyer, abos…) with ~expected/mois; « Confirmer » adds one → it moves to « Mes engagements ».
  3. A confirmed charge shows its month status (payé / à venir / en hausse) + drift %; editing the expected amount (blur) persists; « × » removes it.
  4. The bar's engagements share/pending update after confirm/edit.
  5. No more category-toggle modal; nothing references the old fixed UI.
  6. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(engagements): verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; detection pure (2) ; matching/totals pure (3) ; api + hook + txn descriptions (4) ; bar + modal (5) ; cockpit wiring (6) ; retire old UI (7) ; verification incl. SQL-first + light/dark (8). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `normalizePayee` (2) reused by `matchMonth` (3) ; `ChargeMatch`/`ChargeStatus` (3) + `RecurringCandidate` (2) + `RecurringCharge` (4) consumed by `EngagementsModal` (5) ; `engagementsTotals` (3) → `EngagementsBar` props (5) via page (6) ; `useRecurringCharges`/`useAllTransactions` (4) feed page (6).
- **Pure/no-Date.now:** detection takes `monthISO`; the page passes `month` (its `currentMonth` state).
- **Sequencing:** new code + cockpit switch (2–6) before deleting the old components (7) — tsc stays clean.
- **Detection input:** needs `description` over all months → `useAllTransactions` select extended (Task 4).
- **Branch note:** continues `boussole-redesign`.
