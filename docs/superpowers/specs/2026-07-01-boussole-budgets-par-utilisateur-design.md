# Boussole — Budgets par-utilisateur (prérequis catégories communes)

**Date** : 2026-07-01
**Branche** : `boussole-redesign`
**Périmètre** : déplacer les budgets mensuels par catégorie de la colonne `categories.monthly_budget` (partagée si la catégorie devient commune) vers une **table par-utilisateur** `category_budgets`. **Aucun changement visible** ; débloque l'étape suivante (catégories communes + admin).

## Contexte

Aujourd'hui `monthly_budget` est une colonne de `categories` : `setCategoryBudget(id, budget)` l'écrit, `BudgetsModal` la pré-remplit, `CategoryBreakdown` la lit. Sous le futur modèle « catégories communes » (lignes partagées `user_id IS NULL`), un budget sur une catégorie commune serait partagé — faux. Les budgets doivent devenir **par-utilisateur**.

## Données — nouvelle table

```sql
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
Migration : `supabase/2026-07-01-category-budgets-per-user.sql` (exécutée par l'utilisateur). **La colonne `categories.monthly_budget` est conservée** (plus lue par l'app) pour ne rien casser ; nettoyage éventuel plus tard.

## API — `lib/cockpit/categories-api.ts`

Remplacer `setCategoryBudget(id, budget)` par une version par-utilisateur (upsert / suppression) :
```ts
export async function setCategoryBudget(
  userId: string,
  categoryId: string,
  budget: number | null
): Promise<void>;
```
- `budget === null` → `delete` de la ligne `(user_id, category_id)`.
- sinon → `upsert({ user_id, category_id, monthly_budget: budget }, { onConflict: "user_id,category_id" })`.
- Remonte `error.message`.

(`setCategoryFixed` reste inchangé, non concerné ; `is_fixed` toujours inutilisé.)

## Hook — `lib/cockpit/hooks.ts`

- Nouveau `useCategoryBudgets()` → `{ budgets: Record<string, number>, refetch }` : `select("category_id,monthly_budget")` sur `category_budgets` (RLS scope l'utilisateur), construit la map `categoryId → montant`.
- `useCategories` : **retirer `monthly_budget`** du `.select(...)` (le budget ne vient plus de la catégorie).

## Type — `lib/cockpit/types.ts`

Retirer `monthly_budget?: number | null;` de `Category` (plus utilisé après refonte). Vérifier qu'aucun autre lecteur ne subsiste.

## Consommateurs

- **`BudgetsModal`** (`components/cockpit/BudgetsModal.tsx`) : nouvelles props `userId: string` + `budgets: Record<string, number>`. Pré-remplissage depuis `budgets[c.id]` (au lieu de `c.monthly_budget`) ; `prev = budgets[c.id] ?? null` ; écriture `setCategoryBudget(userId, c.id, next)`.
- **`CategoryBreakdown`** (`components/cockpit/CategoryBreakdown.tsx`) : remplacer la prop `categories` par `budgets: Record<string, number>` ; `budgetOf = (id) => budgets[id] ?? null`.
- **`app/cockpit/page.tsx`** : `const { budgets, refetch: refetchBudgets } = useCategoryBudgets();` ; passer `budgets` à `CategoryBreakdown` (retirer la prop `categories` de ce composant) ; passer `userId={user.id}` + `budgets={budgets}` à `BudgetsModal` ; son `onSaved` appelle `refetchBudgets()` (au lieu de/ en plus de `refetchCategories()`).

## États & erreurs

- Budget vidé (champ vide) → `setCategoryBudget(userId, id, null)` supprime la ligne.
- Reprise idempotente (`on conflict do nothing`) ; relançable.
- RLS : chaque utilisateur ne lit/écrit que ses budgets.

## Tests

- Petit helper pur `budgetsToMap(rows)` (rows `{category_id, monthly_budget}` → `Record`) testé Vitest, réutilisé par le hook (garde le hook trivial et testable).
- API/hook Supabase : non testés unitairement (cohérent avec les autres `*-api`). Vérif tsc/build/smoke.

## Hors périmètre

- Suppression de la colonne `categories.monthly_budget` (report ultérieur).
- Modèle « catégories communes » / admin (étape suivante).

## Critères de succès

- Les budgets fonctionnent exactement comme avant (édition via BudgetsModal, affichage/poste via CategoryBreakdown) **mais sont stockés par utilisateur**.
- Deux utilisateurs peuvent avoir des budgets différents sur la même catégorie (préparé pour les communes).
- `npm run test` vert (incl. `budgetsToMap`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- Migration `supabase/2026-07-01-category-budgets-per-user.sql` fournie.
