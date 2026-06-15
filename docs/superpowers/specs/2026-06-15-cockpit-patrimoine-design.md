# Cockpit — Vue Patrimoine (backlog #3)

**Date** : 2026-06-15
**Branche** : `patrimoine-view` (depuis `main`)
**Périmètre** : vue Patrimoine en **lecture** (consolidation par type + courbe d'évolution) **+ saisie CRUD minimale** (créer / corriger / supprimer assets et valuations). Remplace le placeholder `app/cockpit/patrimoine/page.tsx`.

## Contexte & schéma réel

Le schéma vit dans Supabase (pas de SQL dans le repo). Structure des colonnes **vérifiée par sondage** de l'API PostgREST (clé anon publique, read-only) :

- **`accounts`** : `id, user_id, name, type, institution, currency, created_at` — **aucune colonne de solde**.
- **`assets`** : `id, user_id, account_id, name, type, current_value, ticker, quantity, created_at`.
- **`asset_valuations`** : `id, user_id, asset_id, date, value, created_at` — série temporelle par asset.
- **`v_patrimoine`** : `(user_id, type, n_assets, total_value)` — agrégation des assets par `type`.

**Constats qui ont cadré le périmètre :**
1. `accounts` n'a pas de solde → dans ce schéma, **tout ce qui a de la valeur est un `asset`** (rattaché à un compte). Les livrets/cash doivent être des assets pour compter dans le patrimoine.
2. **Données quasi vides** : `v_patrimoine` ne renvoie qu'une ligne (`type=commodity`, `n_assets=2`, `total_value=0,00`). Seuls 2 assets « Or » existent, valorisés à 0 ; PEA/Natixis/Livret A/LDDS/BNP n'ont aucun asset. → la vue a besoin d'un flux de saisie pour avoir quelque chose à montrer.
3. **Sécurité** : `v_patrimoine` est lisible **sans authentification** (RLS non appliquée sur la vue). Mitigation immédiate : filtrer explicitement `?user_id=eq.<user.id>` côté client. **Suite (hors périmètre)** : corriger la vue (security_invoker / filtre `auth.uid()`) côté SQL.

## Décisions validées

- **Périmètre** : vue lecture + saisie CRUD minimale (create/edit/delete).
- **Modèle** : patrimoine = assets (par `account_id`) ; pas de solde de compte. Le « Mix » initial est abandonné (pas de `accounts.balance`).
- **Consolidation par type** : lue depuis `v_patrimoine`, filtrée `user_id`.
- **Courbe** : reconstruite depuis `asset_valuations` (somme, par date, de la dernière valuation ≤ date de chaque asset).
- **`assets.type`** : jeu fixe `stock | savings | cash | commodity`. Garde-fou : si une contrainte CHECK refuse une de ces valeurs au premier insert, ajuster le select (noté dans le plan).
- **Cohérence `current_value`** : recalée à la valeur de la valuation la plus récente après toute mutation de valuation (0 si aucune).
- **Tests** : Vitest sur les modules purs (`patrimoine.ts`). Reste vérifié par tsc/build/smoke.
- **Design** : mobile-first, tokens cream/ink/emerald, Fraunces/Geist, cohérent avec le Dashboard. recharts (déjà installé) pour la courbe.

## Architecture des fichiers

```
lib/cockpit/
  patrimoine.ts        # PUR + testé : types Asset/AssetValuation/PatrimoineLine ;
                       #   buildPatrimoineSeries(assets, valuations) -> [{date, total}]
                       #   latestValue(valuations) -> number
                       #   groupByType / parts en %
  patrimoine.test.ts   # Vitest
  patrimoine-api.ts    # mutations Supabase (impur) : createAsset, updateAsset,
                       #   deleteAsset, addValuation, updateValuation, deleteValuation
  hooks.ts             # (étendu) useAssets, useAssetValuations, usePatrimoineSummary

components/cockpit/patrimoine/
  PatrimoineHero.tsx   # total + delta vs point précédent
  PatrimoineChart.tsx  # recharts ; état vide si < 2 points
  TypeBreakdown.tsx    # une ligne par type : total_value, n_assets, part %
  AssetList.tsx + AssetRow.tsx   # asset par ligne, tappable -> édition
  AssetModal.tsx       # créer / corriger / supprimer un asset
  ValuationModal.tsx   # liste éditable des valuations d'un asset (add/edit/delete)

app/cockpit/patrimoine/page.tsx   # remplace le placeholder, assemble la vue
```

**Principes** : `patrimoine.ts` pur/testable ; toutes les écritures dans `patrimoine-api.ts` ; lectures via hooks (mêmes conventions loading/error/refetch que `useTransactions`). Composants présentationnels.

## Couche données

- **`usePatrimoineSummary()`** : `supabase.from("v_patrimoine").select("type,n_assets,total_value").eq("user_id", user.id)` → `{ lines, loading, error, refetch }`.
- **`useAssets()`** : `assets` du user (RLS) → `{ assets, loading, error, refetch }`.
- **`useAssetValuations()`** : `asset_valuations` du user (RLS), triées par date → `{ valuations, loading, error, refetch }`.
- Une mutation (create/edit/delete) appelle `patrimoine-api.ts` puis déclenche les `refetch` concernés (assets, valuations, summary).

## Modules purs (testés)

```ts
type Asset = { id: string; account_id: string | null; name: string; type: string;
               current_value: number; ticker?: string | null; quantity?: number | null };
type AssetValuation = { id: string; asset_id: string; date: string; value: number };
type PatrimoineLine = { type: string; n_assets: number; total_value: number };

// somme, par date présente dans valuations, de la dernière valuation <= date de chaque asset
buildPatrimoineSeries(assets: Asset[], valuations: AssetValuation[]): { date: string; total: number }[]

// valuation la plus récente par date ; 0 si vide
latestValue(valuations: AssetValuation[]): number

// parts en % (somme=100 ; cas total=0 -> parts à 0)
withShares(lines: PatrimoineLine[]): (PatrimoineLine & { share: number })[]
```

## Vue (layout)

1. En-tête `Patrimoine` (Fraunces) + date de dernière valorisation.
2. `PatrimoineHero` : total (Σ `total_value`) en Fraunces géant emerald + delta vs point précédent (mono, ↑/↓).
3. `PatrimoineChart` : aire/ligne emerald sur paper ; état vide propre si < 2 points.
4. `TypeBreakdown` : ligne par type (label FR : stock→Actions, savings→Livrets, cash→Liquidités, commodity→Or) avec `total_value`, `n_assets`, part %.
5. `AssetList`/`AssetRow` : nom, type, compte, `current_value` (mono) ; ligne tappable → `ValuationModal`.
6. FAB + (au-dessus de la tab bar) → `AssetModal` (création).

## Saisie CRUD

**Assets** : créer (name, type∈{stock,savings,cash,commodity}, account_id, ticker/quantity optionnels, valeur initiale → current_value + 1ère valuation à aujourd'hui) ; corriger (champs hors valeur) ; supprimer (supprime d'abord les valuations puis l'asset).

**Valuations** : add/edit/delete (date + value) via `ValuationModal`. Après chaque mutation, recaler `asset.current_value = latestValue(valuations restantes)`.

## États & erreurs

- Listes : loading (texte léger), vide (« Aucun asset — ajoute ta première ligne »), erreur (message visible, comme `useTransactions`).
- Courbe : < 2 points → message « Pas encore assez d'historique ».
- Mutations : erreurs Supabase affichées dans le modal (pattern `AddModal`).

## Hors périmètre

- Correctif RLS SQL de `v_patrimoine` (juste mitigé par le filtre `user_id`).
- Prix de marché automatiques / cours temps réel (les valeurs sont saisies à la main).
- Multi-devises (tout en EUR ; `currency` ignoré pour l'instant).
- Branchement simulateur (#6, passe suivante).

## Critères de succès

- `app/cockpit/patrimoine/page.tsx` affiche total + courbe + répartition par type + liste d'assets sur données réelles.
- On peut créer un asset, ajouter/corriger/supprimer une valuation, et voir total + courbe + `v_patrimoine` se mettre à jour.
- `current_value` reste cohérent avec la dernière valuation.
- Lecture de `v_patrimoine` filtrée par `user_id`.
- `npm run test` vert (incluant `patrimoine.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
