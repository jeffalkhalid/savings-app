# Cockpit — Onboarding (amorçage d'un nouvel utilisateur)

**Date** : 2026-06-19
**Branche** : `onboarding-seed` (depuis `main`)
**Périmètre** : permettre à un utilisateur **inscrit manuellement** (Supabase → Auth) de se connecter et d'utiliser toutes les features avec son **suivi isolé**. À la 1ère connexion, l'app amorce des **catégories + comptes par défaut** (sinon tout est vide et la saisie/import ne marchent pas). Inclut le **correctif RLS** des 2 vues (SQL fourni).

## Contexte

L'app est multi-utilisateur par conception (auth Supabase + RLS `auth.uid() = user_id` sur les tables). Mais :
- Le `LoginForm` ne fait que `signInWithPassword` — pas d'inscription in-app (création de compte = manuelle dans Supabase, choix validé).
- Un nouvel utilisateur arrive **vide** : pas de catégories/comptes → `TxnModal`/import inutilisables (selects vides, catégories non résolues).
- Les vues `v_patrimoine` et `v_monthly_by_category` **n'ont pas de RLS** (lisibles sans filtre `user_id`) ; l'app filtre, mais la donnée reste exposable.

## Décisions validées

- **Mécanisme** : amorçage **côté app à la 1ère connexion** (catégories vides ⇒ insertion des défauts). 100% testable, rien à déployer en SQL côté seed.
- **Contenu** : ~16 catégories FR génériques + 2 comptes (« Compte courant », « Livret épargne »). L'utilisateur renomme/ajoute ensuite.
- **RLS vues** : fourni en SQL (`security_invoker`), exécuté manuellement par l'admin.
- **Tests** : Vitest sur les définitions pures. `ensureSeed`/layout par tsc/build + smoke.
- **Idempotence** : seed seulement si l'utilisateur n'a aucune catégorie.

## Architecture des fichiers

```
lib/cockpit/
  defaults.ts        # PUR + testé : DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed
  defaults.test.ts   # Vitest
  seed.ts            # ensureSeed(userId) : insère les défauts si catégories vides
  hooks.ts           # MODIF : + useEnsureSeed(userId)

app/cockpit/layout.tsx   # MODIF : écran "Préparation de votre espace…" pendant le seed

supabase/
  2026-06-19-rls-views.sql   # correctif RLS (security_invoker) — à exécuter dans Supabase
```

Reuse : `@/lib/cockpit/supabase` (`supabase`), `@/lib/cockpit/types` (`Category`).

## Données par défaut (pures, testées)

```ts
export type SeedCategory = { name: string; type: "income" | "expense" | "transfer" | "savings"; color: string };
export type SeedAccount = { name: string; type: string };

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: "Salaire",              type: "income",   color: "#1B5E40" },
  { name: "Revenus divers",       type: "income",   color: "#2D7A4F" },
  { name: "Logement",             type: "expense",  color: "#B45342" },
  { name: "Courses alimentaires", type: "expense",  color: "#B89968" },
  { name: "Restaurants & Sorties",type: "expense",  color: "#836FB2" },
  { name: "Transport",            type: "expense",  color: "#4A6FA5" },
  { name: "Énergie",              type: "expense",  color: "#B45342" },
  { name: "Téléphonie & Internet",type: "expense",  color: "#4F8B82" },
  { name: "Assurance",            type: "expense",  color: "#6B6E76" },
  { name: "Santé",                type: "expense",  color: "#C62828" },
  { name: "Loisirs",              type: "expense",  color: "#836FB2" },
  { name: "Vêtements",            type: "expense",  color: "#B89968" },
  { name: "Frais bancaires",      type: "expense",  color: "#6B6E76" },
  { name: "Virements",            type: "transfer", color: "#0288D1" },
  { name: "Épargne",              type: "savings",  color: "#1B5E40" },
  { name: "Investissements",      type: "savings",  color: "#2D7A4F" },
];

export const DEFAULT_ACCOUNTS: SeedAccount[] = [
  { name: "Compte courant", type: "checking" },
  { name: "Livret épargne", type: "savings" },
];

// Un utilisateur a besoin du seed s'il n'a aucune catégorie.
export function needsSeed(categories: { id: string }[]): boolean;
```

**Tests `defaults.test.ts`** : `DEFAULT_CATEGORIES` non vide ; tous les `type` ∈ {income,expense,transfer,savings} ; noms uniques ; au moins un income / expense / savings / transfer. `DEFAULT_ACCOUNTS` non vide. `needsSeed([])` true, `needsSeed([{id:"x"}])` false.

## Amorçage (`seed.ts`)

```ts
export async function ensureSeed(userId: string): Promise<boolean>;
```

- Lit `categories` du user (`select id`). Si non vide → renvoie `false` (rien à faire).
- Sinon : `insert(DEFAULT_CATEGORIES.map(c => ({ ...c, user_id })))` dans `categories`, et `insert(DEFAULT_ACCOUNTS.map(a => ({ ...a, user_id, currency: "EUR" })))` dans `accounts`. Renvoie `true`.
- Toute erreur Supabase est propagée (le hook la capte).

**Risque de contrainte assumé** : si `accounts.type` ou `categories.color` portent une contrainte CHECK/NOT NULL incompatible, le 1er seed échouera — le smoke le révèle, on ajuste `DEFAULT_ACCOUNTS`/`DEFAULT_CATEGORIES` (même schéma de correctif que `source="manual"` de l'import).

## Hook & layout

- **`useEnsureSeed(userId)`** : `useState({ ready:false, error:null })` ; `useEffect` appelle `ensureSeed(userId)` une fois, puis `setReady(true)` (même en cas d'erreur, pour ne pas bloquer — l'erreur est exposée mais l'app reste accessible).
- **`app/cockpit/layout.tsx`** : après `useSession` (auth prête + `user`), appelle `useEnsureSeed(user.id)`. Tant que `!ready` → écran « Préparation de votre espace… ». Ensuite, rend `AuthContext.Provider` + contenu comme aujourd'hui. Aux connexions suivantes (catégories présentes), `ensureSeed` renvoie vite `false` → court flash, acceptable.

## Correctif RLS (SQL fourni)

`supabase/2026-06-19-rls-views.sql` :

```sql
-- Les vues respectent la RLS des tables sous-jacentes (auth.uid() = user_id).
alter view public.v_patrimoine set (security_invoker = on);
alter view public.v_monthly_by_category set (security_invoker = on);
```

À exécuter une fois dans **Supabase → SQL Editor**. (Postgres 15+, supporté par Supabase.) Après ça, les vues ne renvoient plus que les lignes du user connecté. Non testable depuis le repo.

## Runbook — inscrire un utilisateur

1. **Supabase → Authentication → Add user** : email + mot de passe ; lui communiquer les identifiants.
2. (Une seule fois pour le projet) exécuter `supabase/2026-06-19-rls-views.sql` dans le SQL Editor.
3. L'utilisateur ouvre l'app, se connecte → « Préparation de votre espace… » → catégories + comptes par défaut créés → il peut saisir/importer, avec son suivi **isolé**.

## États & erreurs

- Erreur de seed : `useEnsureSeed` passe quand même `ready=true` (app accessible) et expose l'erreur (log/console) ; l'utilisateur peut réessayer en rechargeant.
- Double onglet à la 1ère connexion : risque théorique de double-seed (les deux voient « vide »). Acceptable à cette échelle (création manuelle, faible concurrence) ; non géré.

## Hors périmètre

- Écran d'inscription in-app (`signUp`) — création de compte reste manuelle (choix validé).
- Édition/CRUD des comptes/catégories dans l'UI (ils existent via seed, modifiables en base).
- Suppression/reset des données d'un utilisateur.
- Internationalisation (catégories en français).

## Critères de succès

- Un utilisateur créé manuellement, à sa 1ère connexion, obtient ~16 catégories + 2 comptes ; saisie de transaction et import fonctionnent immédiatement.
- Ses données sont isolées (RLS tables + vues sécurisées après exécution du SQL).
- Un utilisateur existant (déjà des catégories) n'est pas re-seedé.
- `npm run test` vert (incl. `defaults.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
