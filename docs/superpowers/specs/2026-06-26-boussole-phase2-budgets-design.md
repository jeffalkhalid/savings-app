# Boussole Phase 2 — Budgets par catégorie

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : budget mensuel **fixe et optionnel** par catégorie de dépense. Les barres du Cockpit passent en « consommé vs budget » (avec alerte de dépassement) quand un budget existe ; sinon la barre « part % » actuelle. Une modale **Budgets** pour les fixer.

## Décisions validées

- **Budget mensuel fixe** par catégorie → colonne `monthly_budget` sur `categories` (nullable ; null = pas de budget). Pas de budget par mois (YAGNI).
- **Modale Budgets** ouverte depuis l'en-tête de la section « Par catégorie ».
- Le consommé du mois affiché vient de `analyzeCategories` (`CategoryInsight.total`). Budgets sur catégories de **dépense** uniquement.

## Données & sécurité

Migration `supabase/2026-06-26-category-budgets.sql` (exécutée manuellement) :
```sql
alter table public.categories add column if not exists monthly_budget numeric;
```
RLS déjà active sur `categories` (`auth.uid() = user_id`).

## Module pur (testé) — `lib/cockpit/budget.ts`

```ts
export type BudgetState = "none" | "ok" | "warn" | "over";
export function budgetStatus(
  consumed: number,
  budget: number | null | undefined
): { ratio: number; pct: number; state: BudgetState; overBy: number };
```
- `budget` null/≤0 → `{ ratio: 0, pct: 0, state: "none", overBy: 0 }`.
- sinon : `ratio = consumed / budget` ; `pct = Math.min(ratio, 1) * 100` ; `state` = `ratio < 0.8 ? "ok" : ratio < 1 ? "warn" : "over"` ; `overBy = Math.max(0, consumed − budget)`.

**Tests** : `(50,100)` → ok, pct 50, overBy 0 ; `(90,100)` → warn ; `(120,100)` → over, pct 100 (plafonné), overBy 20 ; `(50,null)` → none ; `(50,0)` → none.

## Type / API / hook

- **`Category`** (`lib/cockpit/types.ts`) += `monthly_budget?: number | null`.
- **`useCategories`** (`hooks.ts`) : sélectionne `id,name,type,color,monthly_budget` et **expose `refetch`** (motif `useAssets`) → `{ categories, refetch }`. (Aujourd'hui : chargé une fois, pas de refetch — petit ajout pour rafraîchir après l'édition des budgets.)
- **`categories-api.ts`** (nouveau) :
  ```ts
  export async function setCategoryBudget(id: string, budget: number | null): Promise<void>;
  ```
  update `{ monthly_budget: budget }` sur `categories` ; erreur Supabase → throw.

Note : `useCategories` est consommé par plusieurs écrans (cockpit, modales). Ajouter `refetch` est rétro-compatible (les usages qui déstructurent `{ categories }` restent valides).

## UI

- **`CategoryRow`** (`components/cockpit/CategoryRow.tsx`) : nouvelle prop `budget: number | null`.
  - `budgetStatus(insight.total, budget)` ; si `state !== "none"` → barre **consommé/budget** : piste `bg-rule`, remplissage couleur selon `state` (`ok` → `bg-emerald`, `warn` → `bg-gold`, `over` → `bg-accent`), largeur `pct` ; libellé droit `{eur(total)} / {eur(budget)}` (classe `text-accent` si `over`, sinon `text-ink-muted`).
  - si `state === "none"` → barre **part %** actuelle inchangée (remplissage `bg-accent/70`, libellé `{pct}%`).
- **`CategoryBreakdown`** (`components/cockpit/CategoryBreakdown.tsx`) : props `{ insights, categories, onSelect, onEditBudgets }`. En-tête : titre « Par catégorie » + petit bouton **« Budgets »** (`onEditBudgets`). Pour chaque insight, budget = `categories.find(c => c.id === insight.categoryId)?.monthly_budget ?? null` → passé à `CategoryRow`.
- **`BudgetsModal`** (`components/cockpit/BudgetsModal.tsx`, motif `AssetModal`) : liste les catégories `type === "expense"` triées par nom ; un champ `€` par catégorie (pré-rempli depuis `monthly_budget`, vide si null) ; **Enregistrer** → pour chaque catégorie dont la valeur a changé, `setCategoryBudget(id, valeurOuNull)` (champ vide → `null`) ; `onSaved` (refetch categories + close). Erreur visible.
- **Page Cockpit** (`app/cockpit/page.tsx`) : `useCategories()` devient `{ categories, refetch: refetchCategories }` ; état `showBudgets` ; `CategoryBreakdown` reçoit `categories` + `onEditBudgets={() => setShowBudgets(true)}` ; `BudgetsModal` rendue si `showBudgets`, `onSaved` → `refetchCategories()` + close.

## États & erreurs

- Catégorie sans budget : comportement actuel (barre part %).
- Budget défini mais 0 dépense ce mois : la catégorie n'apparaît pas dans le breakdown (pas d'insight) ; elle reste éditable dans la modale Budgets.
- Dépassement : barre pleine `accent` + libellé rouge ; pas de blocage.
- Champ budget invalide (non numérique) : ignoré/validation dans la modale (message).
- Erreur Supabase (set) : message dans la modale.

## Hors périmètre

- Budget global mensuel (somme) — on reste par catégorie.
- Budget par mois variable (table dédiée).
- Report/alertes proactives (notifications).
- Budgets sur revenus/épargne (dépense uniquement).

## Critères de succès

- Fixer un budget pour une catégorie via la modale ; la barre du Cockpit passe en consommé/budget avec la bonne couleur ; dépassement signalé en rouge.
- Retirer un budget (champ vide) → la catégorie repasse en barre « part % ».
- Persistance ; chaque user ne voit que ses budgets (RLS).
- `npm run test` vert (incl. `budget`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-category-budgets.sql`.
