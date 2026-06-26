# Boussole — Charges fixes (pont dépenses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la barre « Fixe & variable » réelle et gérable : une catégorie marquée `is_fixed` ; `fixe` = vraies dépenses du mois dans les catégories fixes, `variable` = le reste. Retirer la dépendance `recurring`.

**Architecture:** `categories.is_fixed` + `fixedVariableFromInsights` (pur) + `setCategoryFixed` + `FixedCategoriesModal` ; bascule du Cockpit puis retrait du code `recurring`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement** ; RLS `categories` déjà active.
- `fixe` 100 % dérivé des vraies dépenses (insights du mois) ; pas de total déclaré.
- Séquencement : ajouter le neuf et basculer les consommateurs **avant** de retirer `recurring`, pour que `npx tsc --noEmit` reste clean à chaque task.
- Modale motif `BudgetsModal` ; toggles `accent-emerald`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `categories.is_fixed`

**Files:** Create `supabase/2026-06-26-category-fixed.sql`

- [ ] **Step 1: Create the file**

```sql
-- Charges fixes (Boussole). À exécuter dans Supabase SQL editor.
alter table public.categories add column if not exists is_fixed boolean not null default false;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-category-fixed.sql
git commit -m "feat(fixed): SQL migration — categories.is_fixed"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `fixedVariableFromInsights` (TDD, additive)

**Files:** Modify `lib/cockpit/fixed.ts`, `lib/cockpit/fixed.test.ts`

**Interfaces:**
- Produces: `fixedVariableFromInsights(insights, fixedIds): { fixe, variable, fixedShare }`.

- [ ] **Step 1: Add the failing test** — in `lib/cockpit/fixed.test.ts`, add `fixedVariableFromInsights` to the existing `./fixed` import, then append:

```ts
describe("fixedVariableFromInsights", () => {
  const insights = [
    { categoryId: "a", total: 600 },
    { categoryId: "b", total: 300 },
    { categoryId: "c", total: 100 },
  ];
  it("sums fixed vs variable by the fixed-category set", () => {
    const r = fixedVariableFromInsights(insights, new Set(["a", "c"]));
    expect(r.fixe).toBe(700);
    expect(r.variable).toBe(300);
    expect(r.fixedShare).toBeCloseTo(0.7);
  });
  it("empty fixed set → all variable, share 0", () => {
    const r = fixedVariableFromInsights(insights, new Set());
    expect(r.fixe).toBe(0);
    expect(r.fixedShare).toBe(0);
  });
  it("no insights → zeros", () => {
    expect(fixedVariableFromInsights([], new Set(["a"]))).toEqual({
      fixe: 0,
      variable: 0,
      fixedShare: 0,
    });
  });
});
```

- [ ] **Step 2: Run** `npm run test -- fixed` → FAIL (`fixedVariableFromInsights` not exported).

- [ ] **Step 3: Append to `lib/cockpit/fixed.ts`**:

```ts
export function fixedVariableFromInsights(
  insights: { categoryId: string; total: number }[],
  fixedIds: Set<string>
): { fixe: number; variable: number; fixedShare: number } {
  let fixe = 0;
  let variable = 0;
  for (const i of insights) {
    if (fixedIds.has(i.categoryId)) fixe += Number(i.total);
    else variable += Number(i.total);
  }
  const total = fixe + variable;
  return { fixe, variable, fixedShare: total > 0 ? fixe / total : 0 };
}
```

- [ ] **Step 4: Run** `npm run test -- fixed` → PASS (old recurring tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/fixed.ts lib/cockpit/fixed.test.ts
git commit -m "feat(fixed): fixedVariableFromInsights (real split) with tests"
```

---

## Task 3: `Category.is_fixed` + select + `setCategoryFixed`

**Files:** Modify `lib/cockpit/types.ts`, `lib/cockpit/hooks.ts`, `lib/cockpit/categories-api.ts`

- [ ] **Step 1: `Category` type** — add `is_fixed?: boolean;` to the `Category` type in `lib/cockpit/types.ts` (after `monthly_budget`).

- [ ] **Step 2: `useCategories` select** — in `lib/cockpit/hooks.ts`, in `useCategories`, change the select to include `is_fixed`:
```ts
      .select("id,name,type,color,monthly_budget,is_fixed")
```

- [ ] **Step 3: `categories-api.ts`** — append:
```ts
export async function setCategoryFixed(
  id: string,
  value: boolean
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ is_fixed: value })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/types.ts lib/cockpit/hooks.ts lib/cockpit/categories-api.ts
git commit -m "feat(fixed): Category.is_fixed + setCategoryFixed"
```

---

## Task 4: `FixedCategoriesModal`

**Files:** Create `components/cockpit/FixedCategoriesModal.tsx`

**Interfaces:**
- Consumes: `setCategoryFixed` (Task 3); `Category`; `CategoryInsight`; `eur`.
- Produces: `FixedCategoriesModal({ categories, insights, onClose, onSaved })`.

- [ ] **Step 1: Create `components/cockpit/FixedCategoriesModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { eur } from "@/lib/cockpit/format";
import { setCategoryFixed } from "@/lib/cockpit/categories-api";
import type { Category } from "@/lib/cockpit/types";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";

export function FixedCategoriesModal({
  categories,
  insights,
  onClose,
  onSaved,
}: {
  categories: Category[];
  insights: CategoryInsight[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const spentBy: Record<string, number> = {};
  for (const i of insights) spentBy[i.categoryId] = i.total;
  const expense = categories
    .filter((c) => c.type === "expense")
    .sort((a, b) => (spentBy[b.id] ?? 0) - (spentBy[a.id] ?? 0));
  const [fixed, setFixed] = useState<Record<string, boolean>>(
    Object.fromEntries(expense.map((c) => [c.id, !!c.is_fixed]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fixeTotal = expense.reduce(
    (a, c) => a + (fixed[c.id] ? spentBy[c.id] ?? 0 : 0),
    0
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      for (const c of expense) {
        if (!!c.is_fixed !== !!fixed[c.id]) {
          await setCategoryFixed(c.id, !!fixed[c.id]);
        }
      }
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
        <header className="flex justify-between items-center mb-1">
          <h2 className="font-display text-2xl">Charges fixes</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <p className="text-[12px] text-ink-muted mb-4">
          Coche les catégories incompressibles. Fixe ce mois :{" "}
          <span className="font-mono-num">{eur(fixeTotal)}</span>
        </p>
        <form onSubmit={submit} className="grid gap-1">
          {expense.map((c) => (
            <label
              key={c.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-rule"
            >
              <span className="min-w-0">
                <span className="text-sm">{c.name}</span>
                <span className="block text-[11px] text-ink-muted font-mono-num">
                  {eur(spentBy[c.id] ?? 0)} ce mois
                </span>
              </span>
              <input
                type="checkbox"
                checked={!!fixed[c.id]}
                onChange={(e) =>
                  setFixed((f) => ({ ...f, [c.id]: e.target.checked }))
                }
                className="w-5 h-5 accent-emerald shrink-0"
              />
            </label>
          ))}
          {!expense.length && (
            <p className="text-ink-muted text-sm py-4">
              Aucune catégorie de dépense.
            </p>
          )}
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

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/FixedCategoriesModal.tsx
git commit -m "feat(fixed): FixedCategoriesModal (toggle fixe + real spend)"
```

---

## Task 5: Switch the Cockpit to the real split

**Files:** Modify `app/cockpit/page.tsx`

- [ ] **Step 1: Imports**

- In the hooks import block, **remove** `useRecurring`.
- Replace the line `import { monthlyFixedTotal, fixedVariableSplit } from "@/lib/cockpit/fixed";` with:
```tsx
import { fixedVariableFromInsights } from "@/lib/cockpit/fixed";
```
- Replace the line `import { FixedChargesList } from "@/components/cockpit/FixedChargesList";` with:
```tsx
import { FixedCategoriesModal } from "@/components/cockpit/FixedCategoriesModal";
```

- [ ] **Step 2: Remove the recurring hook + recompute the split**

Delete the line:
```tsx
  const { recurring } = useRecurring(user.id);
```
Replace the two memos:
```tsx
  const fixedTotal = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  const split = useMemo(
    () => fixedVariableSplit(metrics.depenses, fixedTotal),
    [metrics.depenses, fixedTotal]
  );
```
with:
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

- [ ] **Step 3: Remove the inline `showFixed` branch from the main ternary**

Delete this branch (between the `showTransfers` branch and the `drill` branch):
```tsx
      ) : showFixed ? (
        <FixedChargesList
          recurring={recurring}
          categories={categories}
          onBack={() => setShowFixed(false)}
        />
```
so the ternary goes directly from the `showTransfers ? (…)` block to `) : drill ? (`.

- [ ] **Step 4: Show the bar whenever there are expenses**

Change:
```tsx
          {fixedTotal > 0 && (
            <FixedVariableBar
```
to:
```tsx
          {metrics.depenses > 0 && (
            <FixedVariableBar
```
(Keep `onDrill={() => setShowFixed(true)}`.)

- [ ] **Step 5: Render the modal**

Before the closing `</main>` (after the `{showBudgets && (…)}` block), add:
```tsx
      {showFixed && (
        <FixedCategoriesModal
          categories={categories}
          insights={insights}
          onClose={() => setShowFixed(false)}
          onSaved={() => {
            refetchCategories();
            setShowFixed(false);
          }}
        />
      )}
```

- [ ] **Step 6: Type-check + build** — Run `npx tsc --noEmit` (clean — `recurring`/`FixedChargesList`/`monthlyFixedTotal`/`fixedVariableSplit` are no longer referenced by the page) ; `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(fixed): cockpit fixe/variable from real expenses + manage modal"
```

---

## Task 6: Retire the `recurring` code

**Files:** Delete `components/cockpit/FixedChargesList.tsx`; Modify `lib/cockpit/hooks.ts`, `lib/cockpit/fixed.ts`, `lib/cockpit/fixed.test.ts`

**Note:** Do this only after Task 5 (no remaining references). Verify first with a search.

- [ ] **Step 1: Confirm no references remain**

Run (Grep): search the repo for `useRecurring`, `FixedChargesList`, `monthlyFixedTotal`, `monthlyAmount`, `fixedVariableSplit`, and `from "@/lib/cockpit/fixed"`/`from "./fixed"`. Expected remaining uses: only the imports/exports about to be removed, and `fixedVariableFromInsights`. If any other file still imports the recurring symbols, STOP and report.

- [ ] **Step 2: Delete the component**

```bash
git rm components/cockpit/FixedChargesList.tsx
```

- [ ] **Step 3: `hooks.ts`** — remove `import type { Recurring } from "./fixed";` and delete the entire `useRecurring` function.

- [ ] **Step 4: `fixed.ts`** — remove `Recurring` (type), `FREQ_TO_MONTHLY`, `monthlyAmount`, `monthlyFixedTotal`, and `fixedVariableSplit`. Keep only `fixedVariableFromInsights`.

- [ ] **Step 5: `fixed.test.ts`** — remove the tests/imports for `monthlyAmount`/`monthlyFixedTotal`/`fixedVariableSplit`; keep only the `fixedVariableFromInsights` block (import just that symbol).

- [ ] **Step 6: Verify** — Run `npm run test -- fixed` → PASS ; `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add lib/cockpit/hooks.ts lib/cockpit/fixed.ts lib/cockpit/fixed.test.ts
git commit -m "refactor(fixed): retire unused recurring code (useRecurring, FixedChargesList, monthly fns)"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `fixed`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-category-fixed.sql` first.** Then on Cockpit with a month that has expenses:
  1. The « Fixe & variable » bar shows (even with no fixed categories — then 100 % variable).
  2. Tapping it opens « Charges fixes »: each expense category with its real spend this month + a toggle; the « Fixe ce mois » preview updates as you toggle.
  3. Mark Logement/Assurance fixe → save → the bar's fixe share reflects the real spend in those categories.
  4. Untick all → bar back to 100 % variable.
  5. Nothing references `recurring` anymore; Projection still works.
  6. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(fixed): charges fixes verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; pure split (2) ; type/select/api (3) ; FixedCategoriesModal (4) ; cockpit switch to real split + manage modal + bar always-on (5) ; recurring retirement (6) ; verification incl. SQL-first + light/dark (7). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `fixedVariableFromInsights` (2) consumes `{ categoryId, total }` — `CategoryInsight` satisfies it ; `Category.is_fixed` (3) read by page (5) + `FixedCategoriesModal` (4) ; `setCategoryFixed` (3) used by modal (4) ; `FixedVariableBar` props unchanged (fed by the new split).
- **Sequencing keeps tsc clean:** new code + consumer switch (Tasks 2–5) land before the recurring removal (Task 6); Task 6 starts with a reference check.
- **DB note:** column by manual SQL; the `recurring` table is left in the DB (unused), not dropped.
- **Handoff:** fits the Cockpit maquette (Fixe & variable bar + drill); the manage modal is net-new in Boussole style.
- **Branch note:** continues `boussole-redesign`.
