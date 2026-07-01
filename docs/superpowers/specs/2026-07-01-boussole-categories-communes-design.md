# Boussole — Catégories communes + admin (étape 3a)

**Date** : 2026-07-01
**Branche** : `boussole-redesign`
**Périmètre** : introduire des **catégories communes** (partagées, gérées par un admin) à côté des catégories perso. `categories.user_id` devient nullable (`NULL` = commune). Un admin gère la base commune depuis l'app ; chaque utilisateur ajoute/gère ses perso. Étape 3a = cœur ; la gestion des co-admins par UI = étape 3b (séparée).

## Décisions validées

- Base commune = **toutes tes catégories actuelles** promues (même `id` → transactions + budgets préservés).
- Admin = table `admins` (toi seedé ici ; co-admins via UI en 3b).
- Pas de masquage perso des communes (v1) : un utilisateur voit toutes les communes actives + peut ajouter les siennes.
- Migration **non destructive** et idempotente.

## Données / RLS — migration `supabase/2026-07-01-common-categories.sql`

```sql
-- 1. user_id nullable (NULL = catégorie commune)
alter table public.categories alter column user_id drop not null;

-- 2. table des admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id)
);
alter table public.admins enable row level security;
drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins for select using (auth.uid() = user_id);

-- 3. helper is_admin() (security definer pour lire admins sous RLS)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 4. RLS catégories : voir communes + les siennes ; écrire les siennes, ou les communes si admin
alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_write" on public.categories;
create policy "categories_select" on public.categories for select
  using (user_id is null or user_id = auth.uid());
create policy "categories_write" on public.categories for all
  using (user_id = auth.uid() or (user_id is null and public.is_admin()))
  with check (user_id = auth.uid() or (user_id is null and public.is_admin()));

-- 5. te seeder comme admin
insert into public.admins (user_id)
select id from auth.users where email = 'jeffalkhalid@gmail.com'
on conflict do nothing;

-- 6. promouvoir TES catégories en communes (même id → rien de cassé)
update public.categories
set user_id = null
where user_id = (select id from auth.users where email = 'jeffalkhalid@gmail.com');
```
Exécutée par l'utilisateur. Non destructive : aucun delete, aucun re-pointage (les `id` ne bougent pas ; `category_budgets` et `transactions` restent valides). Idempotente.

**Hypothèse** : à ce stade tu es (quasi) le seul utilisateur. Si des amis avaient déjà des catégories perso, elles restent perso (doublons possibles avec les communes) — réconciliation éventuelle hors périmètre 3a ; recommandé de faire 3a **avant** d'inviter.

## Module pur (testé) — `lib/cockpit/category-admin.ts` (ajout)

```ts
export function splitCategories<T extends { user_id?: string | null }>(
  categories: T[],
  myUserId: string
): { common: T[]; mine: T[] };
```
- `common` = `user_id == null` ; `mine` = `user_id != null && user_id === myUserId`.

**Tests** : sépare communes (user_id null) et perso (mon id) ; ignore d'éventuelles lignes d'un autre user (ne devrait pas arriver via RLS).

## Type & hook

- `lib/cockpit/types.ts` : `Category` gagne `user_id?: string | null`.
- `lib/cockpit/hooks.ts` :
  - `useCategories` : ajoute `user_id` au `.select(...)`.
  - Nouveau `useIsAdmin()` → `{ isAdmin: boolean }` : `select("user_id")` sur `admins` (RLS ne renvoie que ta ligne si admin) → `isAdmin = (data?.length ?? 0) > 0`.

## API — `lib/cockpit/categories-api.ts`

- `createCategory(userId: string | null, input)` : `user_id: userId` (null = commune). RLS autorise `null` seulement si admin.
- `updateCategory` / `setCategoryActive` inchangés (par `id` ; RLS filtre les droits).

## Seed — `lib/cockpit/seed.ts`

- **Retirer** la création de catégories par-personne (`ensureSeed` ne seed plus les catégories). Les nouveaux voient les communes ; le seed se désactiverait de toute façon (le probe `categories` renvoie les communes). Comptes toujours seedés.
- `DEFAULT_CATEGORIES` conservé (référence), plus utilisé par `ensureSeed`. Ajuster le test seed si besoin.

## UI — `components/cockpit/CategoriesModal.tsx` (refonte)

Utilise `useIsAdmin()` et `splitCategories(categories, userId)`. Deux blocs :

### Bloc « Communes »
- Groupé par type (`CAT_TYPE_ORDER`), n'affiche que les **actives**.
- **Non-admin** : lecture seule — pastille + icône + nom + petit tag « commune ». Pas de renommage/archivage.
- **Admin** : mêmes contrôles que l'existant (renommer inline, recolorer, archiver) sur les communes.

### Bloc « Mes catégories »
- Les perso (`user_id === userId`), **toujours éditables** (renommer/recolorer/archiver), comportement actuel.

### Archivées
- **Perso archivées** : visibles avec « Réactiver » (comme aujourd'hui).
- **Communes archivées** : visibles **uniquement pour l'admin**, avec « Réactiver ». (Une commune archivée est masquée pour tout le monde, y compris des sélecteurs.)

### Bloc « Ajouter »
- **Admin** : sélecteur de cible **Commune / Perso** (défaut : Commune) → `createCategory(cible === "commune" ? null : userId, …)`.
- **Non-admin** : toujours perso → `createCategory(userId, …)`.
- Validation `categoryNameError` contre les noms **actifs visibles** (communes + perso).

## Sélecteurs (inchangés)

TxnModal / import / Budgets filtrent déjà `active` ; communes et perso apparaissent naturellement (RLS renvoie les deux). Aucun changement.

## États & erreurs

- Non-admin tentant d'écrire une commune : l'UI ne l'expose pas ; la RLS rejetterait de toute façon (message remonté).
- `is_admin()` en `security definer` lit `admins` malgré la RLS.
- Aucune régression budgets (par-utilisateur, indépendants du propriétaire de la catégorie).

## Hors périmètre (→ 3b ou plus tard)

- Écran de gestion des co-admins (ajout/retrait par email via RPC) = **étape 3b**.
- Masquage perso d'une commune.
- Réconciliation des catégories perso d'amis pré-existants.
- Suppression de la colonne `categories.monthly_budget`.

## Critères de succès

- Tes catégories deviennent communes (visibles par tous), tes transactions/budgets intacts.
- Un nouvel utilisateur voit les communes sans seed, et peut ajouter ses perso (invisibles aux autres).
- Toi (admin) peux ajouter/renommer/recolorer/archiver les communes depuis l'app ; un non-admin ne peut pas.
- `npm run test` vert (incl. `splitCategories`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- Migration `supabase/2026-07-01-common-categories.sql` fournie.
