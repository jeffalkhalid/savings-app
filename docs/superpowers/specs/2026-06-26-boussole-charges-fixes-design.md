# Boussole — Charges fixes (pont avec les dépenses)

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Périmètre** : rendre la barre « Fixe & variable » du Cockpit **réelle** et **gérable**. Une catégorie peut être marquée **« fixe »** (`categories.is_fixed`) ; `fixe` = dépenses réelles du mois dans les catégories fixes, `variable` = le reste. On retire la dépendance à la table `recurring` (dormante, lecture seule).

## Décisions validées

- **Modèle « catégories fixes »** : pont 100 % réel — `fixe` provient des vraies opérations, pas d'un total déclaré.
- Gestion via un **toggle « fixe » par catégorie de dépense** (modale ouverte depuis la barre).
- **Retrait de `recurring`** côté app : `useRecurring`, `FixedChargesList`, et les fonctions recurring de `fixed.ts` sont supprimés. La table SQL `recurring` reste en base (non droppée) mais n'est plus utilisée.

## Données & sécurité

`supabase/2026-06-26-category-fixed.sql` (exécutée manuellement) :
```sql
alter table public.categories add column if not exists is_fixed boolean not null default false;
```
RLS déjà active sur `categories`.

## Module pur (testé) — `lib/cockpit/fixed.ts`

Nouvelle fonction (remplace `fixedVariableSplit`) :
```ts
export function fixedVariableFromInsights(
  insights: { categoryId: string; total: number }[],
  fixedIds: Set<string>
): { fixe: number; variable: number; fixedShare: number };
```
- `fixe` = Σ `total` des insights dont `categoryId ∈ fixedIds` ; `variable` = Σ des autres ; `total = fixe + variable` ; `fixedShare = total > 0 ? fixe/total : 0`.

**Retraits** dans `fixed.ts` : `Recurring` (type), `monthlyAmount`, `monthlyFixedTotal`, `fixedVariableSplit`. **Test** (`fixed.test.ts`, réécrit) : `fixedVariableFromInsights` — part fixe correcte ; `fixedIds` vide → tout variable, `fixedShare` 0 ; insights vide → `{0,0,0}`.

## Type / API / nettoyage

- **`Category`** (`types.ts`) += `is_fixed?: boolean`.
- **`useCategories`** : `select` ajoute `is_fixed` (→ `id,name,type,color,monthly_budget,is_fixed`).
- **`categories-api.ts`** : `setCategoryFixed(id: string, value: boolean): Promise<void>` (update `is_fixed`).
- **Retrait `recurring`** :
  - `hooks.ts` : supprimer `useRecurring` et l'import `Recurring`.
  - Supprimer `components/cockpit/FixedChargesList.tsx`.
  - `app/cockpit/page.tsx` : supprimer `useRecurring`, l'import `monthlyFixedTotal`/`fixedVariableSplit`, l'usage `FixedChargesList`.

## UI

- **`FixedVariableBar`** (inchangée visuellement) : alimentée par `fixedVariableFromInsights`. Affichée dès que `metrics.depenses > 0` (au lieu de `fixedTotal > 0`). Tap → ouvre `FixedCategoriesModal` (`showFixed`).
- **`FixedCategoriesModal`** (`components/cockpit/FixedCategoriesModal.tsx`, remplace `FixedChargesList`) : liste les catégories `type === "expense"` triées par dépense décroissante ; par ligne : nom + **dépense réelle du mois** (`money`/`eur`, depuis un map `categoryId → total` construit des `insights`) + **toggle « fixe »** (état local). Enregistrer → `setCategoryFixed` pour chaque catégorie dont l'état a changé ; `onSaved` → refetch catégories + close. En-tête + total « fixe » courant en aperçu.
- **Page Cockpit** :
  - `const fixedIds = useMemo(() => new Set(categories.filter((c) => c.is_fixed).map((c) => c.id)), [categories])`.
  - `const split = useMemo(() => fixedVariableFromInsights(insights, fixedIds), [insights, fixedIds])`.
  - `FixedVariableBar` rendu si `metrics.depenses > 0` ; `onDrill={() => setShowFixed(true)}`.
  - `showFixed` → `<FixedCategoriesModal categories={categories} insights={insights} onClose={…} onSaved={() => { refetchCategories(); setShowFixed(false); }} />`.
  - `useCategories()` expose déjà `refetch` (ajouté pour les budgets).

## États & erreurs

- Aucune catégorie fixe : `fixe = 0`, barre 100 % variable ; la barre invite « Définis tes charges fixes » → modale.
- Catégorie fixe sans dépense ce mois : contribue 0 (correct), reste cochable dans la modale.
- Erreur Supabase (set) : message dans la modale.
- `insights` indisponible (vue répartition KO) : `fixe`/`variable` à 0 — pas de crash.

## Hors périmètre

- Charges nommées déclarées (Loyer 1200 €…) / prévision / rappels de charges — non retenu (modèle catégories).
- Marquage par opération individuelle.
- Suppression SQL de la table `recurring` (laissée en base).

## Critères de succès

- Marquer une catégorie « fixe » fait passer ses dépenses réelles en « fixe » ; la barre se met à jour ; la part fixe/variable reflète le réel.
- La barre s'affiche dès qu'il y a des dépenses ; tap → gestion + vue du réel par catégorie.
- Plus aucune dépendance à `recurring` dans l'app ; rien ne casse (Projection inchangée).
- `npm run test` vert (incl. `fixed`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-category-fixed.sql`.
