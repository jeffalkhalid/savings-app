# Boussole Phase 2 — Allocation cible Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Définir une allocation cible en % par type d'actif et la comparer à la répartition réelle (barre réelle + repère cible + delta) sur l'écran Patrimoine, via une table `allocation_targets`.

**Architecture:** table `allocation_targets` + module pur `allocation.ts` + `allocation-api` + `useAllocationTargets` + composants `AllocationTargets`/`AllocationModal` + câblage page Patrimoine.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement** ; RLS `auth.uid() = user_id`.
- Types = `["stock","savings","cash","commodity"]` (mêmes que `AssetModal`/`typeLabel`). `target_pct ≤ 0` = pas de cible.
- Somme des cibles **informative** (signalée si ≠ 100, sans bloquer).
- Réel via les `PatrimoineLine` (`usePatrimoineSummary`). Tokens : barre `bg-rule`/`bg-emerald`, repère `bg-ink`. Modale motif `BudgetsModal`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `allocation_targets`

**Files:** Create `supabase/2026-06-26-allocation-targets.sql`

- [ ] **Step 1: Create the file**

```sql
-- Allocation cible (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.allocation_targets (
  user_id uuid not null references auth.users(id),
  asset_type text not null,
  target_pct numeric not null,
  primary key (user_id, asset_type)
);

alter table public.allocation_targets enable row level security;

create policy "allocation_targets_per_user" on public.allocation_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-allocation-targets.sql
git commit -m "feat(allocation): SQL migration — allocation_targets + RLS"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `allocation.ts` pure module (TDD)

**Files:** Create `lib/cockpit/allocation.ts`, `lib/cockpit/allocation.test.ts`

**Interfaces:**
- Consumes: `PatrimoineLine` from `./patrimoine`.
- Produces: `ALLOCATION_TYPES`; `AllocationRow`; `allocationRows(lines, targets)`; `targetsTotal(targets)`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/allocation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { allocationRows, targetsTotal } from "./allocation";
import type { PatrimoineLine } from "./patrimoine";

const lines: PatrimoineLine[] = [
  { type: "stock", n_assets: 2, total_value: 6000 },
  { type: "savings", n_assets: 1, total_value: 4000 },
];

describe("allocationRows", () => {
  it("computes realPct from lines and delta vs target", () => {
    const rows = allocationRows(lines, { stock: 50, savings: 30 });
    const stock = rows.find((r) => r.type === "stock")!;
    expect(stock.realPct).toBe(60);
    expect(stock.targetPct).toBe(50);
    expect(stock.delta).toBe(10);
  });
  it("includes a target type with no holdings", () => {
    const rows = allocationRows(lines, { commodity: 20 });
    const c = rows.find((r) => r.type === "commodity")!;
    expect(c.realPct).toBe(0);
    expect(c.targetPct).toBe(20);
    expect(c.delta).toBe(-20);
  });
  it("leaves target/delta null for a holding without target", () => {
    const rows = allocationRows(lines, {});
    const stock = rows.find((r) => r.type === "stock")!;
    expect(stock.targetPct).toBeNull();
    expect(stock.delta).toBeNull();
  });
  it("handles a zero total without dividing by zero", () => {
    const rows = allocationRows(
      [{ type: "stock", n_assets: 0, total_value: 0 }],
      { stock: 50 }
    );
    expect(rows[0].realPct).toBe(0);
  });
});

describe("targetsTotal", () => {
  it("sums positive targets", () => {
    expect(targetsTotal({ stock: 50, savings: 30, cash: 0 })).toBe(80);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- allocation` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/allocation.ts`:

```ts
import type { PatrimoineLine } from "./patrimoine";

export const ALLOCATION_TYPES: string[] = [
  "stock",
  "savings",
  "cash",
  "commodity",
];

export type AllocationRow = {
  type: string;
  realPct: number;
  targetPct: number | null;
  delta: number | null;
};

export function allocationRows(
  lines: PatrimoineLine[],
  targets: Record<string, number>
): AllocationRow[] {
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  const realByType: Record<string, number> = {};
  for (const l of lines) {
    realByType[l.type] = (realByType[l.type] ?? 0) + Number(l.total_value);
  }
  const types = new Set<string>([
    ...Object.keys(realByType),
    ...Object.keys(targets).filter((t) => targets[t] > 0),
  ]);
  const rows: AllocationRow[] = [...types].map((type) => {
    const realPct = total > 0 ? ((realByType[type] ?? 0) / total) * 100 : 0;
    const t = targets[type];
    const targetPct = t != null && t > 0 ? t : null;
    return {
      type,
      realPct,
      targetPct,
      delta: targetPct != null ? realPct - targetPct : null,
    };
  });
  return rows.sort(
    (a, b) => b.realPct - a.realPct || (b.targetPct ?? 0) - (a.targetPct ?? 0)
  );
}

export function targetsTotal(targets: Record<string, number>): number {
  return Object.values(targets).reduce(
    (a, v) => a + (Number(v) > 0 ? Number(v) : 0),
    0
  );
}
```

- [ ] **Step 4: Run** `npm run test -- allocation` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/allocation.ts lib/cockpit/allocation.test.ts
git commit -m "feat(allocation): allocationRows + targetsTotal pure module with tests"
```

---

## Task 3: `allocation-api.ts` + `useAllocationTargets` hook

**Files:** Create `lib/cockpit/allocation-api.ts`; Modify `lib/cockpit/hooks.ts`

**Interfaces:**
- Produces: `getAllocationTargets(userId): Promise<Record<string,number>>`; `saveAllocationTargets(userId, targets): Promise<void>`; `useAllocationTargets(userId): { targets, refetch }`.

- [ ] **Step 1: Create `lib/cockpit/allocation-api.ts`**

```ts
import { supabase } from "./supabase";

export async function getAllocationTargets(
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("allocation_targets")
    .select("asset_type,target_pct")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const m: Record<string, number> = {};
  for (const r of (data as { asset_type: string; target_pct: number }[]) ?? []) {
    m[r.asset_type] = Number(r.target_pct);
  }
  return m;
}

export async function saveAllocationTargets(
  userId: string,
  targets: Record<string, number>
): Promise<void> {
  const rows = Object.entries(targets).map(([asset_type, target_pct]) => ({
    user_id: userId,
    asset_type,
    target_pct,
  }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("allocation_targets")
    .upsert(rows, { onConflict: "user_id,asset_type" });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Add `useAllocationTargets` to `lib/cockpit/hooks.ts`**

Add the import near the other `./*-api` imports:
```ts
import { getAllocationTargets } from "./allocation-api";
```
Append at the END of the file:
```ts
export function useAllocationTargets(userId: string) {
  const [targets, setTargets] = useState<Record<string, number>>({});

  const refetch = useCallback(() => {
    getAllocationTargets(userId)
      .then(setTargets)
      .catch(() => setTargets({}));
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { targets, refetch };
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/allocation-api.ts lib/cockpit/hooks.ts
git commit -m "feat(allocation): allocation-api (get/upsert) + useAllocationTargets"
```

---

## Task 4: `AllocationTargets` + `AllocationModal`

**Files:** Create `components/cockpit/patrimoine/AllocationTargets.tsx`, `components/cockpit/patrimoine/AllocationModal.tsx`

**Interfaces:**
- Consumes: `typeLabel` from `@/lib/cockpit/patrimoine`; `AllocationRow`, `targetsTotal`, `ALLOCATION_TYPES` (Task 2); `saveAllocationTargets` (Task 3).
- Produces: `AllocationTargets({ rows, targets, onEdit })`; `AllocationModal({ userId, targets, onClose, onSaved })`.

- [ ] **Step 1: Create `components/cockpit/patrimoine/AllocationTargets.tsx`**

```tsx
import { typeLabel } from "@/lib/cockpit/patrimoine";
import { targetsTotal, type AllocationRow } from "@/lib/cockpit/allocation";

export function AllocationTargets({
  rows,
  targets,
  onEdit,
}: {
  rows: AllocationRow[];
  targets: Record<string, number>;
  onEdit: () => void;
}) {
  const hasTargets = targetsTotal(targets) > 0;
  return (
    <section className="mb-4">
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-display text-[15px]">Allocation cible</div>
        <button type="button" onClick={onEdit} className="text-[12px] text-ink-muted">
          Éditer
        </button>
      </div>
      {!hasTargets ? (
        <button
          type="button"
          onClick={onEdit}
          className="w-full border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted"
        >
          Définis ton allocation cible
        </button>
      ) : (
        rows.map((r) => (
          <div key={r.type} className="py-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm">{typeLabel(r.type)}</span>
              <span className="flex items-baseline gap-2 text-[11px]">
                <span className="font-mono-num text-ink">
                  {Math.round(r.realPct)}%
                </span>
                <span className="text-ink-muted">
                  cible {r.targetPct != null ? `${Math.round(r.targetPct)}%` : "—"}
                </span>
                {r.delta != null && (
                  <span className="font-mono-num text-ink-muted">
                    {r.delta >= 0 ? "+" : "−"}
                    {Math.abs(Math.round(r.delta))} pts
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 mt-1.5">
              <div className="absolute inset-0 rounded-full bg-rule overflow-hidden">
                <div
                  className="h-full bg-emerald"
                  style={{ width: `${Math.min(r.realPct, 100)}%` }}
                />
              </div>
              {r.targetPct != null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-ink"
                  style={{ left: `${Math.min(r.targetPct, 100)}%` }}
                />
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/patrimoine/AllocationModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { saveAllocationTargets } from "@/lib/cockpit/allocation-api";
import { ALLOCATION_TYPES, targetsTotal } from "@/lib/cockpit/allocation";
import { typeLabel } from "@/lib/cockpit/patrimoine";

export function AllocationModal({
  userId,
  targets,
  onClose,
  onSaved,
}: {
  userId: string;
  targets: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      ALLOCATION_TYPES.map((t) => [t, targets[t] ? String(targets[t]) : ""])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-2 bg-white text-base w-24 text-right";

  const parsed: Record<string, number> = {};
  for (const t of ALLOCATION_TYPES) {
    const raw = (values[t] ?? "").trim();
    parsed[t] = raw ? parseFloat(raw.replace(",", ".")) : 0;
  }
  const sum = targetsTotal(parsed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    for (const t of ALLOCATION_TYPES) {
      if (!isFinite(parsed[t]) || parsed[t] < 0) {
        setError(`Valeur invalide : ${typeLabel(t)}`);
        return;
      }
    }
    setSaving(true);
    try {
      await saveAllocationTargets(userId, parsed);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
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
          <h2 className="font-display text-2xl">Allocation cible</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-2">
          {ALLOCATION_TYPES.map((t) => (
            <div key={t} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">{typeLabel(t)}</span>
              <div className="flex items-center gap-1">
                <input
                  className={field}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={values[t] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [t]: e.target.value }))
                  }
                />
                <span className="text-ink-muted text-sm">%</span>
              </div>
            </div>
          ))}
          <div
            className={`text-[12px] mt-1 ${
              sum === 100 ? "text-ink-muted" : "text-accent"
            }`}
          >
            Somme : {Math.round(sum)}%{sum !== 100 ? " (≠ 100 %)" : ""}
          </div>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60 mt-3"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/patrimoine/AllocationTargets.tsx components/cockpit/patrimoine/AllocationModal.tsx
git commit -m "feat(allocation): AllocationTargets section + AllocationModal editor"
```

---

## Task 5: Wire the Patrimoine page

**Files:** Modify `app/cockpit/patrimoine/page.tsx`

- [ ] **Step 1: Imports + data**

- Add `useAllocationTargets` to the hooks import block (`from "@/lib/cockpit/hooks"`).
- Add `import { allocationRows } from "@/lib/cockpit/allocation";`.
- Add `import { AllocationTargets } from "@/components/cockpit/patrimoine/AllocationTargets";` and `import { AllocationModal } from "@/components/cockpit/patrimoine/AllocationModal";`.

- [ ] **Step 2: Hook + memo + state**

Add near the other hooks (after `usePatrimoineSummary`):
```tsx
  const { targets, refetch: refetchTargets } = useAllocationTargets(user.id);
```
Add a state near `showCreate`:
```tsx
  const [showAlloc, setShowAlloc] = useState(false);
```
Add after the `total`/`delta` consts:
```tsx
  const allocRows = useMemo(
    () => allocationRows(lines, targets),
    [lines, targets]
  );
```

- [ ] **Step 3: Render the section + modal**

Insert the section right after `<TypeBreakdown lines={lines} />`:
```tsx
      <AllocationTargets
        rows={allocRows}
        targets={targets}
        onEdit={() => setShowAlloc(true)}
      />
```
Add the modal before the closing `</main>` (after the `{selected && ( … )}` block):
```tsx
      {showAlloc && (
        <AllocationModal
          userId={user.id}
          targets={targets}
          onClose={() => setShowAlloc(false)}
          onSaved={() => {
            refetchTargets();
            setShowAlloc(false);
          }}
        />
      )}
```

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add app/cockpit/patrimoine/page.tsx
git commit -m "feat(allocation): wire AllocationTargets + editor into Patrimoine"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `allocation`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-allocation-targets.sql` first.** Then on Patrimoine:
  1. With no targets, the "Allocation cible" section shows the "Définis ton allocation cible" prompt.
  2. "Éditer" → modal with the 4 types; entering e.g. 50/30/0/20 shows "Somme : 100%"; entering values ≠ 100 shows the sum in accent (no block).
  3. After save, each type shows réel% vs cible% + delta (pts) and a bar with a vertical marker at the target.
  4. A target type with no holdings shows an empty bar + marker; a holding without target shows no marker.
  5. Persists after reload; legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(allocation): Phase 2 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; allocation pure (2) ; api + hook (3) ; AllocationTargets/AllocationModal (4) ; page wiring (5) ; verification incl. SQL-first + ≠100 inform + marker + light/dark (6). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `allocationRows`/`AllocationRow`/`targetsTotal`/`ALLOCATION_TYPES` (2) used by components (4) + page (5) ; `saveAllocationTargets`/`getAllocationTargets` (3) used by AllocationModal (4) + hook (3) ; `useAllocationTargets` returns `{ targets, refetch }` consumed by page (5).
- **Marker not clipped:** the target marker is a sibling of the (overflow-hidden) track inside a relative, non-clipped wrapper.
- **DB note:** table by manual SQL; tests/build don't hit the DB; live smoke needs the migration first.
- **Branch note:** continues `boussole-redesign`; docs on the branch.
