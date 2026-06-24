# Cockpit — Tri des virements (vue d'argent fidèle)

**Date** : 2026-06-24
**Branche** : `transfers-triage` (depuis `reste-a-vivre`, qui contient le nouveau calcul `resteAVivre` net signé)
**Périmètre** : outil de tri pour reclasser les transactions `type=transfer` vers leur vraie nature (épargne, dépense, revenu…), afin que `transfer` ne désigne plus que les vrais mouvements internes neutres — et que taux d'épargne / dépenses / transferts deviennent fidèles.

## Contexte & problème

L'import BNP type tous les « Virements » en `transfer`, qui est un **fourre-tout** : virements vers PEA/Natixis (= épargne réelle), paiements à des tiers (= dépense), virements reçus (= revenu/entrée), mouvements internes neutres. Conséquence sur le Dashboard : **Transferts gonflé** (brut, ex. 3 537 €), **Épargne sous-comptée** (200 €), **taux d'épargne faussement bas** (4 %). Le `resteAVivre` net signé reste juste (il somme tout en net), mais les autres chiffres trompent.

Décision de cadrage : **reclasser chaque virement dans les types/catégories existants** (pas de nouveau concept), via un **outil de tri manuel dédié** sur le mois courant.

## Décisions validées

- **Modèle** : reclasser vers les catégories existantes (qui portent le bon `type`). `transfer` ne reste que pour les mouvements internes neutres laissés tels quels.
- **Mécanisme** : outil de tri manuel, mois par mois. Pas de règles auto / « appliquer aux similaires » (version ultérieure).
- **Entrée** : la cellule **« Transferts »** du `StatStrip` devient tappable → drill vers l'outil (même pattern que « Charges fixes »/catégories).
- **Données** : réutilise les `txns` du mois (`useTransactions(month)`) filtrés `type=transfer` — aucune nouvelle requête.
- **Écriture** : `updateTransaction` existant (re-type + re-signe via `signedAmount` selon la catégorie choisie), puis `refetch()`.
- **Tests** : Vitest sur le helper pur. UI vérifiée par tsc/build/smoke.
- **Design** : tokens cream/ink/emerald, Fraunces/Geist, mobile.

## Architecture des fichiers

```
lib/cockpit/
  transfers.ts        # PUR + testé : pendingTransfers(txns)
  transfers.test.ts   # Vitest

components/cockpit/
  StatStrip.tsx        # MODIF : cellule "Transferts" tappable (onTransfers optionnel)
  TransferTriage.tsx   # vue drill : liste + compteur
  TransferTriageRow.tsx# 1 ligne : date, libellé, montant, menu catégorie

app/cockpit/page.tsx   # MODIF : état showTransfers ; drill outil de tri
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Txn`, `Category`), `@/lib/cockpit/transactions-api` (`updateTransaction`, `TxnFields`).

## Module pur (testé)

```ts
import type { Txn } from "./types";

// Virements à classer : transactions type=transfer, triées par date décroissante.
export function pendingTransfers(txns: Txn[]): Txn[];
```

Tests : ne garde que `type==="transfer"` (ignore income/expense/savings) ; tri date desc ; liste vide → `[]`.

## UI

**`StatStrip`** : la cellule « Transferts » devient un `<button>` si une prop `onTransfers` est fournie (sinon rendu inchangé) ; au clic → `onTransfers()`. Les 3 autres cellules inchangées.

**`TransferTriage({ transfers, categories, monthLabel, onReclassify, onBack })`** :
- « ‹ Retour » + « Virements à classer · {N} ».
- Si `N === 0` : « Tous les virements sont classés. ».
- Une `TransferTriageRow` par virement.

**`TransferTriageRow({ txn, categoryName, categories, onReclassify })`** :
- date · libellé (`txn.description`) · montant signé (mono, coloré).
- **menu Catégorie** (toutes les catégories) ; au changement vers une catégorie d'id ≠ actuel → `onReclassify(txn, categoryId)`.
- La catégorie courante du virement est pré-sélectionnée.

## Reclassement (page)

`onReclassify(txn, categoryId)` :
1. `cat = categories.find(c => c.id === categoryId)`.
2. `updateTransaction(txn.id, { date: txn.date, absAmount: Math.abs(Number(txn.amount)), description: txn.description, categoryId, categoryName: cat.name, accountId: txn.account_id ?? "", categoryType: cat.type })`.
3. `await` → `refetch()` (les txns rechargent ; la ligne reclassée n'est plus `transfer` → sort de la pile ; StatStrip/Hero/resteAVivre se recalculent).
4. Erreur Supabase → message visible.

Note : `updateTransaction` re-signe le montant selon `cat.type` (reçu→income +, émis→expense/savings −) — cohérent avec la saisie manuelle.

## Intégration page

`app/cockpit/page.tsx` : ajoute `const [showTransfers, setShowTransfers] = useState(false)`.
- `changeMonth` réinitialise aussi `showTransfers`.
- `StatStrip` reçoit `onTransfers={() => setShowTransfers(true)}`.
- Rendu zone principale (priorité) : `showTransfers` → `TransferTriage` ; sinon `showFixed` → charges fixes ; sinon `drillCategory` → drill txns ; sinon barre Fixe/Variable + `CategoryBreakdown`.
- `transfers = pendingTransfers(txns)` passé à `TransferTriage`.

## États & erreurs

- Aucun virement le mois courant → cellule Transferts à 0 € ; le drill affiche « Tous les virements sont classés. ».
- `account_id` manquant sur un virement → `updateTransaction` reçoit `accountId: ""` ; si la base refuse (NOT NULL), message d'erreur (peu probable, les txns importées ont un account_id).
- Le breakdown par catégorie (vue `v_monthly_by_category`) ne se rafraîchit qu'au rechargement/changement de mois ; Hero/StatStrip/resteAVivre, eux, se mettent à jour via `refetch` (limitation déjà connue, acceptable).

## Hors périmètre

- Règles automatiques par libellé/destinataire et « appliquer aux similaires » (version 2).
- Mapping des virements à l'import (forward-looking) — séparé.
- Multi-mois en une vue (on trie mois par mois).
- Nouvelles catégories/types (on reclasse dans l'existant).

## Critères de succès

- Taper « Transferts » ouvre la liste des virements du mois ; reclasser un virement (ex. vers « Bourse / Natixis ») le retire de la pile et met à jour taux d'épargne / dépenses / transferts / reste à vivre.
- Les vrais mouvements internes peuvent rester en `transfer` (non touchés).
- `npm run test` vert (incl. `transfers.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
