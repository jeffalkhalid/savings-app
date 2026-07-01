# Boussole — Gestion des catégories dans l'app

**Date** : 2026-07-01
**Branche** : `boussole-redesign`
**Périmètre** : écran de gestion des catégories (ajouter / renommer / recolorer / archiver) accessible depuis Réglages. Supprime le besoin de passer par du SQL. Nécessite **une migration** (colonne `active` + policies RLS d'écriture sur `categories`).

## Décisions validées

- **Emplacement** : bouton « Gérer les catégories » dans `ReglagesModal` → ouvre une bottom-sheet `CategoriesModal`.
- **Suppression** : pas de suppression dure → **archivage** (`active=false`). Réversible.
- **Couleur** : palette de préréglages (tons Boussole).
- **Type** : choisi à la création, **non modifiable** ensuite.
- Icône : dérivée du nom (`categoryIcon`), non stockée, non personnalisable (v1).

## Modèle de données

`categories` (existant) : `id, user_id, name, type, color, monthly_budget, is_fixed`. Ajout :
```sql
alter table public.categories add column if not exists active boolean not null default true;
```
+ policies RLS d'écriture (par prudence, comme `assets`) :
```sql
alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
create policy "categories_per_user" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
Migration : `supabase/2026-07-01-categories-active.sql` (exécutée par l'utilisateur).

## Module pur (testé) — `lib/cockpit/category-admin.ts`

```ts
export const CATEGORY_COLORS: string[]; // ~10 hex, tons Boussole

export type CatType = "income" | "expense" | "transfer" | "savings";
export const CAT_TYPE_LABELS: Record<CatType, string>; // "Revenus"/"Dépenses"/"Virements"/"Épargne"
export const CAT_TYPE_ORDER: CatType[]; // ["expense","income","savings","transfer"]

// Erreur de validation d'un nom, ou null si valide.
// existingNames = noms des catégories ACTIVES (hors la catégorie éditée).
export function categoryNameError(
  name: string,
  existingNames: string[]
): string | null;
```
Règles `categoryNameError` : trim vide → « Nom requis » ; doublon insensible casse/accents vs `existingNames` → « Ce nom existe déjà » ; sinon `null`.

**Tests** : nom vide, doublon (casse/accent), nom valide ; `CATEGORY_COLORS` non vide et hex ; `CAT_TYPE_ORDER` couvre les 4 types.

## API — `lib/cockpit/categories-api.ts`

```ts
export async function createCategory(
  userId: string,
  input: { name: string; type: CatType; color: string }
): Promise<void>; // insert { user_id, name, type, color, active: true }

export async function updateCategory(input: {
  id: string; name: string; color: string;
}): Promise<void>; // update name + color (PAS le type)

export async function setCategoryActive(id: string, active: boolean): Promise<void>;
```
Chaque fonction remonte `error.message` en `throw new Error(...)` (pattern existant).

## Hook — `lib/cockpit/hooks.ts`

- `useCategories` : ajoute `active` au `.select(...)` → renvoie **toutes** les catégories (actives + archivées) pour que les transactions passées restent résolues (nom/couleur).
- Le `Category` type (dans `types.ts`) gagne `active?: boolean` (optionnel pour compat ; traité comme `true` si absent).

## Filtrage des sélecteurs (actives seulement)

Les pickers ne doivent proposer que les catégories **actives**. Points concernés (dérivé `categories.filter((c) => c.active !== false)`) :
- `TxnModal` (saisie) — la liste déroulante.
- Page import (`app/cockpit/import/page.tsx`) → `ReviewTable`/`ReviewRow`.
- `BudgetsModal` — lignes budgétées.
- Toute autre modale qui liste les catégories pour choisir (allocation n'utilise pas les catégories → non concerné).

Règle : là où l'utilisateur **choisit** une catégorie, filtrer `active`. Là où on **affiche/résout** une catégorie existante (lignes de transactions, métriques), garder la liste complète. Le filtre se fait au plus près du picker (dérivé local), la source `useCategories` reste complète.

## UI — `components/cockpit/CategoriesModal.tsx`

Bottom-sheet (même chrome que les autres modales : `bg-paper`, `rounded-t-2xl`, header + « Fermer »).
- **Sections par type** dans l'ordre `CAT_TYPE_ORDER`, titre = `CAT_TYPE_LABELS`. N'affiche que les **actives** ici.
- **Ligne catégorie** : pastille couleur + `categoryIcon(name)` (aperçu live) + nom éditable (input inline, `onBlur`/Entrée → `updateCategory`, avec `categoryNameError`) + bouton palette (ouvre les pastilles `CATEGORY_COLORS` → `updateCategory`) + bouton **archiver** (icône `Archive` → `setCategoryActive(id,false)`).
- **Section repliée « Archivées »** : liste des `active===false`, chacune avec bouton **Réactiver** (`setCategoryActive(id,true)`).
- **Bloc d'ajout** (bas) : input nom + select **type** (`CAT_TYPE_ORDER`) + pastilles couleur + bouton « Ajouter » (validation `categoryNameError` vs noms actifs, puis `createCategory`).
- Après chaque mutation : `refetch()` (des catégories) via `onChanged` remonté au parent.
- Icônes lucide uniquement (`Archive`, `Palette`, `Plus`, `RotateCcw`…), jamais d'emoji.

## Câblage — `ReglagesModal`

Ajouter un bouton « Gérer les catégories » qui ouvre `CategoriesModal`. `ReglagesModal` reçoit déjà `userId`. Il faut lui passer/charger `categories` + un `refetch` : soit via de nouvelles props (`categories`, `onCategoriesChanged`) fournies par le parent qui monte `ReglagesModal`, soit `CategoriesModal` consomme `useCategories` lui-même. **Retenu** : le parent (là où `ReglagesModal` est monté) passe `categories` + `refetchCategories` en props, pour une seule source de vérité.

## États & erreurs

- Nom vide / doublon → message inline, mutation bloquée.
- Archiver une catégorie utilisée par des transactions : autorisé (les transactions restent, la catégorie disparaît juste des pickers). Aucune contrainte FK violée (on ne supprime rien).
- Erreur Supabase (ex. RLS non appliquée) : message remonté ; rappeler d'exécuter la migration.
- Catégories « système » (Virements, Virements émis/reçus, Épargne, Investissements) : **modifiables/archivables comme les autres** en v1 (pas de protection spéciale — l'utilisateur est seul sur ses données). À noter comme risque : archiver « Virements » masquerait la cible de classification à l'import ; acceptable v1, réversible.

## Hors périmètre v1

- Icône personnalisée (reste dérivée du nom).
- Changement de type d'une catégorie existante.
- Réordonnancement manuel (tri alpha/`name`).
- Fusion de catégories.

## Critères de succès

- Depuis Réglages → « Gérer les catégories », on peut **ajouter** (avec type + couleur), **renommer**, **recolorer**, **archiver** et **réactiver** une catégorie ; plus besoin de SQL.
- Les catégories archivées disparaissent des sélecteurs mais les transactions passées restent lisibles.
- `npm run test` vert (incl. `category-admin`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- Migration `supabase/2026-07-01-categories-active.sql` fournie.
