# Cockpit — Édition / suppression de transactions (backlog #5)

**Date** : 2026-06-16
**Branche** : `txn-edit-delete` (depuis `main`)
**Périmètre** : permettre de **corriger** et **supprimer** une transaction existante du Dashboard. Unifie l'`AddModal` actuel en un `TxnModal` create/edit/delete et extrait les écritures dans un module dédié.

## Contexte

Le Dashboard ([app/cockpit/page.tsx](../../../app/cockpit/page.tsx)) liste les transactions via `TxnList`/`TxnRow`. `TxnRow` est déjà un `<button>` sans handler (prévu pour cette feature). La création passe par `AddModal`, qui fait son `insert` Supabase **inline** (déviation acceptée en passe 1 : « écritures hors hooks »). Cette passe règle aussi cette déviation en isolant les écritures.

Le `type` de transaction stocké est **signé** (`income` positif, le reste négatif), calculé à la création depuis `category.type` (`income` ⇒ +1, sinon −1). L'édition doit préserver/recalculer ce signe si la catégorie change.

## Décisions validées

- **Structure** : un seul composant `TxnModal` (create + edit + delete), même pattern que `AssetModal`/`ValuationModal` du patrimoine. `AddModal` est renommé/étendu.
- **Suppression** : **confirmation inline** (2 clics) avant d'effacer, en terracotta (`text-strat-a`).
- **Écritures** : isolées dans `lib/cockpit/transactions-api.ts`.
- **Logique de signe** : extraite en helper pur testé `signedAmount(absAmount, categoryType)`.
- **Tests** : Vitest sur `signedAmount`. Le reste (api, modal, câblage) vérifié par tsc/build/smoke.
- **Design** : inchangé (tokens cream/ink/emerald, bottom-sheet), cohérent avec l'existant.

## Architecture des fichiers

```
lib/cockpit/
  transactions.ts        # PUR + testé : signedAmount(absAmount, categoryType)
  transactions.test.ts   # Vitest
  transactions-api.ts    # mutations Supabase : createTransaction, updateTransaction,
                         #   deleteTransaction

components/cockpit/
  TxnModal.tsx           # (ex-AddModal) create / edit / delete + confirm inline
  TxnList.tsx            # (modif) propage onSelect(txn)
  TxnRow.tsx             # (modif) appelle onSelect au clic

app/cockpit/page.tsx     # (modif) ouvre TxnModal en création (FAB) ou édition (ligne)
```

## Module pur (testé)

```ts
// income => positif ; expense/transfer/savings => négatif
export function signedAmount(absAmount: number, categoryType: string): number {
  return categoryType === "income" ? Math.abs(absAmount) : -Math.abs(absAmount);
}
```

Tests : `income` → positif ; `expense`/`transfer`/`savings` → négatif ; gère une entrée déjà négative (toujours via `Math.abs`).

## Écritures (`transactions-api.ts`)

- `createTransaction(input)` : `insert` (logique reprise de l'AddModal actuel — `user_id, date, amount` signé, `description`, `merchant`, `category_id`, `account_id`, `type`, `source: "manual"`).
- `updateTransaction(input)` : `update` des mêmes champs (hors `user_id`/`source`) `.eq("id", id)`.
- `deleteTransaction(id)` : `delete().eq("id", id)`.
- Chaque fonction `throw new Error(error.message)` en cas d'erreur Supabase (pattern patrimoine-api).

## TxnModal (create / edit / delete)

- Props : `userId`, `categories`, `accounts`, `txn: Txn | null`, `onClose`, `onSaved`.
- `txn === null` ⇒ **création** (comportement actuel de l'AddModal) ; sinon **édition** pré-remplie.
- Pré-remplissage édition : `amount` affiché en **valeur absolue** (`Math.abs(txn.amount)`), `date`, `description`, `category_id`, `account_id` depuis `txn`.
- Soumission :
  - parse montant (virgule → point), validation `> 0` comme aujourd'hui.
  - `amount = signedAmount(montant, category.type)`.
  - création ⇒ `createTransaction` ; édition ⇒ `updateTransaction({ id: txn.id, ... })`.
- **Suppression** (édition uniquement) : bouton « Supprimer » → bascule en « Confirmer la suppression » (terracotta) ; le 2e clic appelle `deleteTransaction(txn.id)` puis `onSaved`.
- Erreurs Supabase affichées dans le modal (pattern existant).

## Câblage

- `TxnRow` : nouvelle prop `onSelect: () => void`, appelée par le `onClick` du `<button>`.
- `TxnList` : nouvelle prop `onSelect: (txn: Txn) => void`, passée à chaque `TxnRow`.
- `app/cockpit/page.tsx` : état `editTxn: Txn | null` en plus de `showAdd`. La liste ouvre `TxnModal` avec `txn={editTxn}` ; le FAB l'ouvre avec `txn={null}`. `onSaved` → `refetch()` + ferme le modal.

## États & erreurs

- Édition d'une transaction inexistante : non gérée (la liste ne propose que des txns chargées).
- Erreur de mutation : message visible dans le modal, le modal reste ouvert.
- Confirmation de suppression : réinitialisée si le modal se ferme.

## Hors périmètre

- Édition en masse / multi-sélection.
- Historique / annulation (undo).
- Modification du `type` indépendamment de la catégorie (le type suit toujours la catégorie).

## Critères de succès

- Cliquer une transaction ouvre `TxnModal` pré-rempli ; l'enregistrer met à jour la ligne et les stats du mois.
- Supprimer (après confirmation) retire la transaction et rafraîchit la liste/les stats.
- Le signe du montant reste correct même si on change la catégorie.
- Plus aucun `supabase.from(...).insert/update/delete` dans un composant (tout dans `transactions-api.ts`).
- `npm run test` vert (incl. `transactions.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
