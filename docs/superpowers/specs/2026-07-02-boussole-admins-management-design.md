# Boussole — Gestion des co-admins par email (étape 3b)

**Date** : 2026-07-02
**Branche** : `boussole-redesign`
**Périmètre** : écran in-app (réservé aux admins) pour lister / ajouter / retirer des co-admins **par email**. La résolution email→identifiant se fait via des **fonctions Postgres sécurisées** (RPC `security definer`, admin-only), car le client anon ne peut pas lire `auth.users`.

## Décisions validées

- Placement : bouton **« Gérer les admins »** dans Réglages, visible **seulement si admin** → `AdminsModal`.
- Retrait : garde-fou **« pas toi-même »** (garantit ≥ 1 admin). Retrait des autres autorisé.
- On ne peut promouvoir qu'un **compte existant** (le pote doit s'être inscrit d'abord).
- Toutes les RPC rejettent les non-admins **côté base** (pas seulement l'UI).

## Fonctions Postgres — migration `supabase/2026-07-02-admin-rpcs.sql`

Trois fonctions `security definer` (`set search_path = public`), chacune vérifie `is_admin()` en tête (sinon `raise exception`), + `grant execute ... to authenticated` :

- `list_admins()` → `table(user_id uuid, email text)` : `admins` jointe à `auth.users`, triée par email.
- `add_admin_by_email(p_email text)` → `void` : `select id from auth.users where email = lower(trim(p_email))` ; si introuvable → `raise exception 'Aucun utilisateur avec cet email'` ; sinon `insert into admins (user_id) values (v_id) on conflict do nothing`.
- `remove_admin(p_user_id uuid)` → `void` : si `p_user_id = auth.uid()` → `raise exception 'Impossible de vous retirer vous-même'` ; sinon `delete from admins where user_id = p_user_id`.

(Réutilise `public.is_admin()` de l'étape 3a.)

## Module pur (testé) — `lib/cockpit/admins.ts`

```ts
export function adminEmailError(email: string): string | null;
```
- trim vide → « Email requis » ; format invalide (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`) → « Email invalide » ; sinon `null`.

**Tests** : vide, invalide (`"abc"`), valide (`"a@b.co"`).

## API — `lib/cockpit/admins-api.ts`

```ts
export type AdminRow = { user_id: string; email: string };
export async function listAdmins(): Promise<AdminRow[]>;          // rpc("list_admins")
export async function addAdminByEmail(email: string): Promise<void>; // rpc("add_admin_by_email", { p_email })
export async function removeAdmin(userId: string): Promise<void>;    // rpc("remove_admin", { p_user_id })
```
Chaque fonction remonte `error.message` en `throw`.

## UI — `components/cockpit/AdminsModal.tsx`

Bottom-sheet (chrome standard `bg-paper`/`rounded-t-2xl`, header + « Fermer »). Props `{ userId: string; onClose: () => void }`.
- Au montage : `listAdmins()` → état local `admins` (+ `loading`, `error`).
- **Liste** : chaque admin = email + bouton **retirer** (icône `UserMinus`), **désactivé si `user_id === userId`** (toi). Retrait → `removeAdmin` → refetch.
- **Ajouter** : champ email + bouton (validation `adminEmailError` avant appel) → `addAdminByEmail` → refetch + vide le champ. Message d'aide : « la personne doit déjà avoir un compte ».
- Erreurs (email introuvable, non-admin) remontées sous le formulaire.
- Icônes lucide (`UserPlus`, `UserMinus`, `ShieldCheck`…), champs `bg-card text-ink`, bouton emerald `text-[#FBF3EC]`.

## Câblage — `ReglagesModal`

- Utilise `useIsAdmin()`. Si `isAdmin`, afficher un bouton **« Gérer les admins »** (à côté de « Gérer les catégories ») → ouvre `AdminsModal` (état `showAdmins`, rendu en sibling comme `CategoriesModal`).
- Non-admins : bouton absent.

## États & erreurs

- Email d'un compte inexistant → « Aucun utilisateur avec cet email » (il faut inviter/faire inscrire d'abord).
- Tentative de retrait de soi → bloquée UI (bouton désactivé) **et** base (exception).
- Non-admin appelant une RPC → exception « Réservé aux admins » (défense en profondeur ; l'UI ne l'expose déjà pas).

## Hors périmètre

- Invitation/onboarding par email (envoi de mail) — hors sujet ; on promeut un compte déjà inscrit.
- Rôles plus fins que admin/non-admin.

## Critères de succès

- Un admin voit « Gérer les admins », peut lister, ajouter par email (compte existant), retirer un autre admin ; ne peut pas se retirer lui-même.
- Un non-admin ne voit pas le bouton et, même en appelant les RPC, est rejeté.
- `npm run test` vert (incl. `adminEmailError`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- Migration `supabase/2026-07-02-admin-rpcs.sql` fournie.
