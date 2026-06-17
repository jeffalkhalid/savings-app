# Cockpit — Charges fixes (split Fixe/Variable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isoler les charges fixes du Dashboard via une barre Fixe/Variable (basée sur les prélèvements `recurring`), avec drill vers le détail des charges fixes.

**Architecture:** Couche pure `lib/cockpit/fixed.ts` (normalisation mensuelle + split), hook `useRecurring`, composants `FixedVariableBar`/`FixedChargesList`, intégrés au Dashboard à côté de la répartition par poste existante.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

## Global Constraints

- Styling : tokens Tailwind uniquement (`paper`, `ink`, `ink-muted`, `rule`, `emerald`, `strat-a`) ; `.font-display` (Fraunces) titres, `.font-mono-num` (Geist Mono) chiffres ; mobile-first `max-w-[600px]`. Pas de hex brut hors charts. `style={{ width }}` autorisé (valeur dynamique).
- Lectures via hooks (`lib/cockpit/hooks.ts`), scoping RLS par `user_id`. `recurring` en lecture seule.
- Modules purs testés avec Vitest. `npx tsc --noEmit` clean, `npm run build` OK avant fin.

---

## Task 1: fixed.ts pure module (TDD)

**Files:**
- Create: `lib/cockpit/fixed.ts`
- Test: `lib/cockpit/fixed.test.ts`

**Interfaces:**
- Consumes: rien (module autonome).
- Produces: type `Recurring`; `monthlyAmount(r: Recurring): number`; `monthlyFixedTotal(recurring: Recurring[]): number`; `fixedVariableSplit(depenses: number, fixedTotal: number): { fixe: number; variable: number; fixedShare: number }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/fixed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthlyAmount, monthlyFixedTotal, fixedVariableSplit } from "./fixed";
import type { Recurring } from "./fixed";

const rec = (over: Partial<Recurring>): Recurring => ({
  id: "r",
  name: "x",
  amount: 100,
  day_of_month: 1,
  frequency: "monthly",
  category_id: null,
  account_id: null,
  active: true,
  ...over,
});

describe("monthlyAmount", () => {
  it("monthly = amount", () => {
    expect(monthlyAmount(rec({ amount: 800 }))).toBe(800);
  });
  it("yearly = amount/12", () => {
    expect(monthlyAmount(rec({ amount: 1200, frequency: "yearly" }))).toBeCloseTo(100);
  });
  it("quarterly = amount/3", () => {
    expect(monthlyAmount(rec({ amount: 300, frequency: "quarterly" }))).toBeCloseTo(100);
  });
  it("weekly = amount*52/12", () => {
    expect(monthlyAmount(rec({ amount: 12, frequency: "weekly" }))).toBeCloseTo(52);
  });
  it("unknown frequency defaults to monthly", () => {
    expect(monthlyAmount(rec({ amount: 50, frequency: "whatever" }))).toBe(50);
  });
  it("uses the absolute value of amount", () => {
    expect(monthlyAmount(rec({ amount: -40 }))).toBe(40);
  });
});

describe("monthlyFixedTotal", () => {
  it("sums normalized active amounts and ignores inactive", () => {
    const total = monthlyFixedTotal([
      rec({ amount: 800, frequency: "monthly" }),
      rec({ amount: 1200, frequency: "yearly" }), // 100/mois
      rec({ amount: 50, frequency: "monthly", active: false }), // ignoré
    ]);
    expect(total).toBeCloseTo(900);
  });
  it("returns 0 for an empty list", () => {
    expect(monthlyFixedTotal([])).toBe(0);
  });
});

describe("fixedVariableSplit", () => {
  it("splits expenses into fixe and variable", () => {
    const s = fixedVariableSplit(2000, 800);
    expect(s.fixe).toBe(800);
    expect(s.variable).toBe(1200);
    expect(s.fixedShare).toBeCloseTo(0.4);
  });
  it("floors variable at 0 when expenses < fixed", () => {
    const s = fixedVariableSplit(500, 800);
    expect(s.variable).toBe(0);
    expect(s.fixe).toBe(800);
  });
  it("fixedShare is 0 when total is 0", () => {
    expect(fixedVariableSplit(0, 0).fixedShare).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- fixed`
Expected: FAIL — `Cannot find module './fixed'`.

- [ ] **Step 3: Implement fixed.ts**

Create `lib/cockpit/fixed.ts`:

```ts
export type Recurring = {
  id: string;
  name: string;
  amount: number;
  day_of_month: number | null;
  frequency: string;
  category_id: string | null;
  account_id: string | null;
  active: boolean;
};

const FREQ_TO_MONTHLY: Record<string, number> = {
  monthly: 1,
  yearly: 1 / 12,
  quarterly: 1 / 3,
  weekly: 52 / 12,
};

// Montant normalisé au mois selon la fréquence (défaut = mensuel).
export function monthlyAmount(r: Recurring): number {
  const m = FREQ_TO_MONTHLY[r.frequency] ?? 1;
  return Math.abs(Number(r.amount)) * m;
}

// Σ des montants mensualisés des lignes actives.
export function monthlyFixedTotal(recurring: Recurring[]): number {
  return recurring
    .filter((r) => r.active)
    .reduce((sum, r) => sum + monthlyAmount(r), 0);
}

export function fixedVariableSplit(
  depenses: number,
  fixedTotal: number
): { fixe: number; variable: number; fixedShare: number } {
  const fixe = fixedTotal;
  const variable = Math.max(0, depenses - fixedTotal);
  const total = fixe + variable;
  return { fixe, variable, fixedShare: total > 0 ? fixe / total : 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- fixed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/fixed.ts lib/cockpit/fixed.test.ts
git commit -m "feat(fixed): add recurring normalization + fixed/variable split with tests"
```

---

## Task 2: useRecurring hook

**Files:**
- Modify: `lib/cockpit/hooks.ts` (append)

**Interfaces:**
- Consumes: `Recurring` type from `./fixed` (Task 1); existing `supabase`, `useState`, `useEffect`.
- Produces: `useRecurring(userId: string): { recurring: Recurring[]; loading: boolean; error: string | null }`.

- [ ] **Step 1: Add the import**

In `lib/cockpit/hooks.ts`, add after the existing `import type { MonthlyCategoryRow } from "./categories-analysis";` line:

```ts
import type { Recurring } from "./fixed";
```

- [ ] **Step 2: Append the hook at the end of the file**

```ts
export function useRecurring(userId: string) {
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("recurring")
      .select("id,name,amount,day_of_month,frequency,category_id,account_id,active")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setRecurring((data as Recurring[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  return { recurring, loading, error };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/hooks.ts
git commit -m "feat(fixed): add useRecurring hook"
```

---

## Task 3: FixedVariableBar + FixedChargesList components

**Files:**
- Create: `components/cockpit/FixedVariableBar.tsx`
- Create: `components/cockpit/FixedChargesList.tsx`

**Interfaces:**
- Consumes: `eur` from `@/lib/cockpit/format`; `Recurring`, `monthlyAmount`, `monthlyFixedTotal` from `@/lib/cockpit/fixed`; `Category` from `@/lib/cockpit/types`.
- Produces: `FixedVariableBar({ fixe, variable, fixedShare, onDrill })`; `FixedChargesList({ recurring, categories, onBack })`.

- [ ] **Step 1: FixedVariableBar.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";

export function FixedVariableBar({
  fixe,
  variable,
  fixedShare,
  onDrill,
}: {
  fixe: number;
  variable: number;
  fixedShare: number;
  onDrill: () => void;
}) {
  const pct = Math.round(fixedShare * 100);
  return (
    <button type="button" onClick={onDrill} className="w-full text-left mb-6">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs uppercase tracking-[0.1em] text-ink-muted">
          Charges fixes
        </span>
        <span className="font-mono-num text-sm">
          {eur(fixe)}
          <span className="text-ink-muted"> /mois · {pct}%</span>
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-rule">
        <div className="bg-ink" style={{ width: `${pct}%` }} />
        <div className="bg-emerald" style={{ width: `${100 - pct}%` }} />
      </div>
      <div className="text-[11px] text-ink-muted mt-1.5">
        {eur(fixe)} incompressible · {eur(variable)} optimisable
      </div>
    </button>
  );
}
```

- [ ] **Step 2: FixedChargesList.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import { monthlyAmount, monthlyFixedTotal } from "@/lib/cockpit/fixed";
import type { Recurring } from "@/lib/cockpit/fixed";
import type { Category } from "@/lib/cockpit/types";

export function FixedChargesList({
  recurring,
  categories,
  onBack,
}: {
  recurring: Recurring[];
  categories: Category[];
  onBack: () => void;
}) {
  const active = recurring
    .filter((r) => r.active)
    .sort((a, b) => monthlyAmount(b) - monthlyAmount(a));
  const total = monthlyFixedTotal(recurring);
  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <section>
      <button onClick={onBack} className="text-ink-muted text-sm mb-2">
        ‹ Retour
      </button>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Charges fixes
      </div>
      {!active.length && (
        <p className="text-ink-muted text-sm py-4">Aucune charge fixe.</p>
      )}
      {active.map((r) => (
        <div
          key={r.id}
          className="flex justify-between items-center py-2.5 border-b border-rule"
        >
          <div>
            <div className="text-sm">{r.name}</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {nameOf(r.category_id) ?? "—"}
              {r.day_of_month ? ` · le ${r.day_of_month}` : ""}
            </div>
          </div>
          <strong className="font-mono-num text-sm">
            {eur(monthlyAmount(r))}
            <span className="text-ink-muted text-[11px]"> /mois</span>
          </strong>
        </div>
      ))}
      {!!active.length && (
        <div className="flex justify-between items-center py-3 mt-1">
          <span className="text-sm font-medium">Total mensuel</span>
          <strong className="font-mono-num text-sm">{eur(total)}</strong>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/FixedVariableBar.tsx components/cockpit/FixedChargesList.tsx
git commit -m "feat(fixed): add fixed/variable bar and fixed charges list"
```

---

## Task 4: Integrate into the Dashboard

**Files:**
- Modify (full rewrite): `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `useRecurring` (Task 2); `monthlyFixedTotal`, `fixedVariableSplit` (Task 1); `FixedVariableBar`, `FixedChargesList` (Task 3); existing dashboard pieces.
- Produces: the wired dashboard (no exports consumed elsewhere).

- [ ] **Step 1: Rewrite app/cockpit/page.tsx**

Replace the entire contents of `app/cockpit/page.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
  useRecurring,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { monthlyFixedTotal, fixedVariableSplit } from "@/lib/cockpit/fixed";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";
import { FixedChargesList } from "@/components/cockpit/FixedChargesList";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";

const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [showFixed, setShowFixed] = useState(false);

  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { recurring } = useRecurring(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const fixedTotal = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  const split = useMemo(
    () => fixedVariableSplit(metrics.depenses, fixedTotal),
    [metrics.depenses, fixedTotal]
  );
  const label = monthLabelOf(month);

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrillCategory(null);
    setShowFixed(false);
  };
  const drillTxns = drillCategory
    ? txns.filter((t) => t.category_id === drillCategory)
    : [];
  const drillName =
    categories.find((c) => c.id === drillCategory)?.name ?? "";

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Cockpit</h1>
        <div className="flex items-center gap-2">
          <MonthSwitcher month={month} onChange={changeMonth} />
          <Link href="/cockpit/import" className="text-ink-muted text-sm">
            Import
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-ink-muted text-sm"
          >
            Déco
          </button>
        </div>
      </header>

      <HeroBand metrics={metrics} monthLabel={label} />
      <StatStrip metrics={metrics} />

      {showFixed ? (
        <FixedChargesList
          recurring={recurring}
          categories={categories}
          onBack={() => setShowFixed(false)}
        />
      ) : drillCategory ? (
        <section>
          <button
            onClick={() => setDrillCategory(null)}
            className="text-ink-muted text-sm mb-2"
          >
            ‹ Retour
          </button>
          <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            {drillName}
          </div>
          <TxnList
            txns={drillTxns}
            categories={categories}
            loading={loading}
            error={error}
            monthLabel={label}
            onSelect={setEditTxn}
          />
        </section>
      ) : (
        <>
          {fixedTotal > 0 && (
            <FixedVariableBar
              fixe={split.fixe}
              variable={split.variable}
              fixedShare={split.fixedShare}
              onDrill={() => setShowFixed(true)}
            />
          )}
          {catError && (
            <p className="text-ink-muted text-xs mb-2">
              Répartition indisponible — réessaie plus tard.
            </p>
          )}
          <CategoryBreakdown
            insights={insights}
            monthLabel={label}
            onSelect={setDrillCategory}
          />
        </>
      )}

      <Fab onClick={() => setShowAdd(true)} label="Ajouter une transaction" />

      {showAdd && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            setShowAdd(false);
          }}
        />
      )}

      {editTxn && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            refetch();
            setEditTxn(null);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(fixed): add fixed/variable bar + charges drill to dashboard"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `fixed` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit`. Verify:
1. A "Charges fixes" bar appears under the stat strip: a two-segment bar (ink = fixe, emerald = variable) with `{fixe}/mois · {x}%` and "{fixe} incompressible · {variable} optimisable".
2. Tapping the bar opens the fixed-charges detail: "‹ Retour", a list of active recurring charges (name, category, {amount}/mois, "le {jour}") sorted by amount, and a monthly total. Back returns to the dashboard.
3. The category breakdown still shows below the bar; its own drill-down still works and is independent of the fixed-charges drill.
4. Changing the month resets both the fixed-charges view and the category drill.
5. If there are no active recurring rows (or the query errors), the bar is hidden and the dashboard is otherwise unchanged.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(fixed): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** `monthlyAmount`/`monthlyFixedTotal`/`fixedVariableSplit` pure + tested (Task 1); `useRecurring` filtered by user_id (Task 2); `FixedVariableBar` (ink/emerald segments, share, incompressible/optimisable) + `FixedChargesList` (active sorted, category, /mois, day, total) (Task 3); dashboard bar after StatStrip with `fixedTotal>0` guard (hidden when none/error → recurring empty), tap → drill, month reset of both drills, category breakdown unchanged (Task 4); verification incl. hidden-when-empty (Task 5). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `Recurring` (Task 1) used by `useRecurring` (Task 2) and both components (Task 3); `monthlyFixedTotal`/`fixedVariableSplit` signatures match the page call (Task 4); `FixedVariableBar` props (`fixe`/`variable`/`fixedShare`/`onDrill`) and `FixedChargesList` props (`recurring`/`categories`/`onBack`) match the page. `metrics.depenses` exists on `computeMetrics` output.
- **Hidden-when-empty:** the bar renders only when `fixedTotal > 0`; with no active recurring (or a query error → `recurring` stays `[]`), `fixedTotal` is 0 and the bar is hidden — matches the spec's "no noise" rule.
- **Branch note:** `fixed-expenses` from `main` (has the category breakdown + drill it sits beside).
