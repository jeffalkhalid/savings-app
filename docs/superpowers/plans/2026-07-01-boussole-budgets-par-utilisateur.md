# Boussole — Budgets par-utilisateur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déplacer les budgets mensuels par catégorie de la colonne `categories.monthly_budget` vers une table par-utilisateur `category_budgets`, sans changement visible.

**Architecture:** helper pur `budgetsToMap` → table + RLS + API upsert/delete → hook `useCategoryBudgets` (map) → BudgetsModal/CategoryBreakdown/page consomment la map. Prérequis pour les catégories communes.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Budgets **par utilisateur** (RLS `auth.uid() = user_id`) ; deux users peuvent avoir un budget différent sur la même catégorie.
- **Aucun changement visible** : édition (BudgetsModal) et affichage/poste (CategoryBreakdown) fonctionnent comme avant.
- Colonne `categories.monthly_budget` **conservée** en base (plus lue par l'app).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Helper pur `budgetsToMap` (TDD)

**Files:** Create `lib/cockpit/budgets.ts`, `lib/cockpit/budgets.test.ts`

**Produces:** `BudgetRow` type, `budgetsToMap(rows): Record<string, number>`.

- [ ] **Step 1: Failing test** — `lib/cockpit/budgets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { budgetsToMap } from "./budgets";

describe("budgetsToMap", () => {
  it("maps rows by category id", () => {
    expect(
      budgetsToMap([
        { category_id: "a", monthly_budget: 100 },
        { category_id: "b", monthly_budget: 50 },
      ])
    ).toEqual({ a: 100, b: 50 });
  });
  it("returns empty for no rows", () => {
    expect(budgetsToMap([])).toEqual({});
  });
  it("coerces numeric strings", () => {
    expect(
      budgetsToMap([
        { category_id: "a", monthly_budget: "80" as unknown as number },
      ])
    ).toEqual({ a: 80 });
  });
});
```

- [ ] **Step 2: Run** `npm run test -- budgets` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/budgets.ts`:

```ts
export type BudgetRow = { category_id: string; monthly_budget: number };

export function budgetsToMap(rows: BudgetRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.category_id] = Number(r.monthly_budget);
  return map;
}
```

- [ ] **Step 4: Run** `npm run test -- budgets` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/budgets.ts lib/cockpit/budgets.test.ts
git commit -m "feat(budgets): budgetsToMap pure helper with test"
```

---

## Task 2: Cutover — table + API + hook + type + consumers + page

This is an atomic cutover: `setCategoryBudget`'s signature changes, so the API + all callers move together to stay type-clean.

**Files:** Create `supabase/2026-07-01-category-budgets-per-user.sql` ; Modify `lib/cockpit/categories-api.ts`, `lib/cockpit/hooks.ts`, `lib/cockpit/types.ts`, `components/cockpit/BudgetsModal.tsx`, `components/cockpit/CategoryBreakdown.tsx`, `app/cockpit/page.tsx`

**Consumes:** `budgetsToMap`, `BudgetRow` (Task 1).

- [ ] **Step 1: Migration** — create `supabase/2026-07-01-category-budgets-per-user.sql`:

```sql
-- Budgets par catégorie déplacés en par-utilisateur (prérequis catégories communes).
-- À exécuter une fois dans Supabase > SQL Editor.
create table if not exists public.category_budgets (
  user_id uuid not null references auth.users(id),
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_budget numeric not null,
  primary key (user_id, category_id)
);
alter table public.category_budgets enable row level security;
drop policy if exists "category_budgets_per_user" on public.category_budgets;
create policy "category_budgets_per_user" on public.category_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reprise des budgets existants (par propriétaire)
insert into public.category_budgets (user_id, category_id, monthly_budget)
select user_id, id, monthly_budget
from public.categories
where monthly_budget is not null and user_id is not null
on conflict (user_id, category_id) do nothing;
```

- [ ] **Step 2: API** — in `lib/cockpit/categories-api.ts`, replace the whole `setCategoryBudget` function with:

```ts
export async function setCategoryBudget(
  userId: string,
  categoryId: string,
  budget: number | null
): Promise<void> {
  if (budget === null) {
    const { error } = await supabase
      .from("category_budgets")
      .delete()
      .eq("user_id", userId)
      .eq("category_id", categoryId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("category_budgets")
    .upsert(
      { user_id: userId, category_id: categoryId, monthly_budget: budget },
      { onConflict: "user_id,category_id" }
    );
  if (error) throw new Error(error.message);
}
```
(Leave `setCategoryFixed`, `createCategory`, `updateCategory`, `setCategoryActive` unchanged.)

- [ ] **Step 3: Hook** — in `lib/cockpit/hooks.ts`:
  (a) Add to the imports (top of file): `import { budgetsToMap, type BudgetRow } from "./budgets";`
  (b) In `useCategories`, change the select from `.select("id,name,type,color,monthly_budget,is_fixed,active")` to:
```ts
      .select("id,name,type,color,is_fixed,active")
```
  (c) Add a new hook (after `useCategories`):
```ts
export function useCategoryBudgets() {
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const refetch = useCallback(() => {
    supabase
      .from("category_budgets")
      .select("category_id,monthly_budget")
      .then(({ data }) => setBudgets(budgetsToMap((data as BudgetRow[]) ?? [])));
  }, []);
  useEffect(() => {
    refetch();
  }, [refetch]);
  return { budgets, refetch };
}
```
(`useState`, `useCallback`, `useEffect`, `supabase` are already imported in this file.)

- [ ] **Step 4: Type** — in `lib/cockpit/types.ts`, remove the line `monthly_budget?: number | null;` from the `Category` type.

- [ ] **Step 5: `BudgetsModal`** — in `components/cockpit/BudgetsModal.tsx`:
  (a) Props: add `userId: string;` and `budgets: Record<string, number>;` to the props type and destructure them (alongside `categories, onClose, onSaved`).
  (b) Initial `values` state: replace `c.monthly_budget != null ? String(c.monthly_budget) : ""` with `budgets[c.id] != null ? String(budgets[c.id]) : ""`.
  (c) In `submit`, replace `const prev = c.monthly_budget != null ? Number(c.monthly_budget) : null;` with `const prev = budgets[c.id] ?? null;`.
  (d) Replace the call `await setCategoryBudget(c.id, next);` with `await setCategoryBudget(userId, c.id, next);`.

- [ ] **Step 6: `CategoryBreakdown`** — in `components/cockpit/CategoryBreakdown.tsx`:
  (a) Replace the `categories: Category[];` prop with `budgets: Record<string, number>;` (and rename `categories` → `budgets` in the destructure).
  (b) Replace `const budgetOf = (id: string) => categories.find((c) => c.id === id)?.monthly_budget ?? null;` with `const budgetOf = (id: string) => budgets[id] ?? null;`.
  (c) Remove the now-unused `import type { Category } from "@/lib/cockpit/types";`.

- [ ] **Step 7: `app/cockpit/page.tsx`**:
  (a) Add `import { useCategoryBudgets } from ...` — it's the same module as `useCategories` (`@/lib/cockpit/hooks`); add `useCategoryBudgets` to that existing import.
  (b) Near the other hooks (after `useCategories()`), add:
```tsx
  const { budgets, refetch: refetchBudgets } = useCategoryBudgets();
```
  (c) At the `<CategoryBreakdown … />` usage, replace `categories={categories}` with `budgets={budgets}`.
  (d) At the `<BudgetsModal … />` usage, add `userId={user.id}` and `budgets={budgets}` (keep `categories={categories}`), and in its `onSaved` replace `refetchCategories();` with `refetchBudgets();` (keep `setShowBudgets(false)`).

- [ ] **Step 8: Verify** — Run:
  - `npx tsc --noEmit` → no errors.
  - `npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add supabase/2026-07-01-category-budgets-per-user.sql lib/cockpit/categories-api.ts lib/cockpit/hooks.ts lib/cockpit/types.ts components/cockpit/BudgetsModal.tsx components/cockpit/CategoryBreakdown.tsx app/cockpit/page.tsx
git commit -m "feat(budgets): move category budgets to per-user category_budgets table"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — `npm run test` → PASS (incl. `budgets`).
- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Stale-ref scan** — `rg "monthly_budget" lib components app` should only match `budgets.ts`/tests and the SQL migration file — NOT any `.select("…monthly_budget…")` on `categories`, nor `c.monthly_budget` reads. Report anything else.
- [ ] **Step 5: Manual smoke (`npm run dev`, after running the migration)**:
  1. Cockpit → « Budgets » : les budgets existants s'affichent (repris depuis l'ancienne colonne).
  2. Modifier un budget, enregistrer → la barre « Par catégorie » reflète le nouveau budget.
  3. Vider un budget → il disparaît (ligne supprimée).
  4. Aucune régression d'affichage des postes.

---

## Self-review notes

- **Spec coverage:** helper `budgetsToMap` (T1) ; table+RLS+reprise, API upsert/delete, hook, type, consumers, page (T2) ; vérif+stale-scan (T3). Tous les points de la spec couverts.
- **Placeholder scan:** code complet à chaque étape.
- **Type consistency:** `setCategoryBudget(userId, categoryId, budget|null)` (T2 step 2) appelé avec 3 args en T2 step 5d ; `budgetsToMap`/`BudgetRow` (T1) importés par le hook (T2 step 3) ; prop `budgets: Record<string, number>` cohérente entre hook, page, BudgetsModal, CategoryBreakdown.
- **Atomicité:** le changement de signature de `setCategoryBudget` + tous ses appelants sont dans la même tâche (T2) → pas d'état intermédiaire non compilable.
- **Migration:** `supabase/2026-07-01-category-budgets-per-user.sql`, exécutée par l'utilisateur ; reprise idempotente.
- **Branch:** `boussole-redesign`.
```
