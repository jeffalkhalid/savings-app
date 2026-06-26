# Boussole — Engagements récurrents (refonte « dépenses fixes »)

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Périmètre** : remplacer le pilotage « catégories fixes » (jugé trop grossier, trop manuel, peu parlant) par une notion d'**engagements récurrents** par charge : détectés automatiquement depuis l'historique, confirmés/édités par l'utilisateur, avec montant attendu, statut du mois, et détection de dérive. Sert 4 besoins : anticiper les engagements, voir le vrai disponible, repérer les dérives, savoir où agir.

## Décisions validées

- Raisonnement **par charge** (bénéficiaire récurrent), pas par catégorie.
- **Détection auto + confirmation** (hybride) : l'app propose, l'utilisateur valide/édite/retire.
- **Hero inchangé** : le « reste à vivre » reste le net réel du mois ; les engagements vivent dans **leur propre section** + une barre Cockpit reframée.
- **Supersède** `categories.is_fixed` / `FixedCategoriesModal` (retirés de l'UI ; la colonne `is_fixed` reste en base, inutilisée).

## Calibrage (par défaut, ajustable)

- Fenêtre d'analyse : **6 derniers mois** (mois courant inclus).
- Récurrence : une charge est candidate si son bénéficiaire apparaît dans **≥ 3 mois distincts** sur ces 6.
- `expected` = **médiane** des totaux mensuels (valeur absolue) du bénéficiaire.
- Rapprochement : par **libellé normalisé** (`payee_key`) — minuscule, sans accents, **chiffres et ponctuation retirés**, espaces compactés.
- Dérive (au mois) : `actual` vs `expected` — `|écart| ≤ 15 %` → « payé » ; `> +15 %` → « en hausse » ; `< −15 %` → « en baisse » ; pas d'opération → « à venir ».

## Données & sécurité

`supabase/2026-06-27-recurring-charges.sql` (exécutée manuellement) :
```sql
create table if not exists public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  label text not null,
  expected_amount numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, payee_key)
);
alter table public.recurring_charges enable row level security;
create policy "recurring_charges_per_user" on public.recurring_charges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Modules purs (testés)

### `lib/cockpit/recurring-detect.ts`
```ts
import type { Txn } from "./types";

export function normalizePayee(s: string): string;

export type RecurringCandidate = {
  payeeKey: string;
  label: string;        // libellé représentatif (le plus fréquent)
  expected: number;     // médiane des totaux mensuels (abs)
  monthsSeen: number;   // nb de mois distincts sur la fenêtre
};

// allTxns = toutes les opérations (on filtre type=expense en interne).
// monthISO = "YYYY-MM" courant ; la fenêtre = 6 mois jusqu'à monthISO.
export function detectRecurring(
  allTxns: Txn[],
  monthISO: string
): RecurringCandidate[];
```
- `normalizePayee` : `toLowerCase` → NFD sans accents → retire chiffres et tout sauf lettres/espaces → compacte → trim.
- `detectRecurring` : ne garde que `type==="expense"` dans les 6 derniers mois ; regroupe par `normalizePayee(description)` ; `monthsSeen` = mois distincts ; **candidat si `monthsSeen ≥ 3`** ; `expected` = médiane des totaux mensuels (abs) ; `label` = description la plus fréquente du groupe ; trié par `expected` décroissant.

**Tests** : `normalizePayee` (accents/casse/chiffres) ; un bénéficiaire présent 4 mois → candidat, `expected` = médiane ; présent 2 mois → ignoré ; `label` représentatif ; fenêtre (mois hors 6 derniers exclus).

### `lib/cockpit/recurring-match.ts`
```ts
import type { Txn } from "./types";

export type ChargeLite = { payeeKey: string; expected: number };
export type ChargeStatus = "paye" | "a_venir" | "hausse" | "baisse";

export type ChargeMatch = {
  payeeKey: string;
  expected: number;
  actual: number | null;     // somme des op. du mois rapprochées, ou null
  status: ChargeStatus;
  driftPct: number | null;   // (actual-expected)/expected, null si à venir
};

export function matchMonth(charges: ChargeLite[], monthTxns: Txn[]): ChargeMatch[];

export function engagementsTotals(
  matches: ChargeMatch[],
  monthExpenseTotal: number
): { expectedTotal: number; paid: number; pending: number; variable: number };
```
- `matchMonth` : pour chaque charge, somme des `abs(amount)` des `monthTxns` `type==="expense"` dont `normalizePayee(description) === payeeKey` → `actual` (ou `null`) ; `status`/`driftPct` selon le calibrage (±15 %).
- `engagementsTotals` : `expectedTotal = Σ expected` ; `paid = Σ actual (présents)` ; `pending = Σ expected des « à venir »` ; `variable = max(0, monthExpenseTotal − paid)`.

**Tests** : rapprochement par payeeKey ; statut payé/à venir/hausse/baisse ; `driftPct` ; totaux (payé, restant=pending, variable).

## API / hooks

- **`recurring-charges-api.ts`** : `createRecurringCharge(userId, { payeeKey, label, expectedAmount })` (upsert sur `(user_id,payee_key)`), `updateRecurringCharge(id, { label, expectedAmount, active })`, `deleteRecurringCharge(id)`.
- **`useRecurringCharges()`** : `{ charges, refetch }` (id, payee_key, label, expected_amount, active).
- **`useAllTransactions`** (modif) : ajouter `description` au `select` (aujourd'hui `id,date,amount,type`) → pour la détection. (Inoffensif pour `averageMonthlyNet`.)

## UI

- **`EngagementsBar`** (`components/cockpit/EngagementsBar.tsx`, remplace `FixedVariableBar` au Cockpit) : barre « Engagements ce mois » (`paid`) vs « Variable », + sous-texte d'anticipation « il reste {pending} € d'engagements à payer » si `pending > 0`. Affichée dès que `depenses > 0` **ou** qu'il existe des engagements. Tap → `EngagementsModal`.
- **`EngagementsModal`** (`components/cockpit/EngagementsModal.tsx`, remplace `FixedCategoriesModal`) :
  - **Mes engagements** : chaque charge confirmée → `label`, `expected` (éditable), **statut du mois** (chip payé/à venir/hausse/baisse) + **badge dérive** (`+x%` en `accent` si hausse), retrait.
  - **Détectés** : `detectRecurring(allTxns, month)` moins ceux déjà confirmés → suggestions avec `expected`, **« Confirmer »** en 1 tap (crée la charge).
- **Page Cockpit** : `useRecurringCharges` + `useAllTransactions` (détection) ; `matches = matchMonth(charges→ChargeLite, monthExpenseTxns)` ; `totals = engagementsTotals(matches, metrics.depenses)` ; `EngagementsBar` alimentée par `totals` ; `showFixed` → `EngagementsModal` ; refetch après confirm/édit.
- **Retrait** : `FixedCategoriesModal` supprimé ; `fixedVariableFromInsights` n'est plus utilisé par le Cockpit (peut rester dans `fixed.ts`, ou être retiré — au choix du plan). `categories.is_fixed` / `setCategoryFixed` plus utilisés (laissés en base/lib, inoffensifs).

## États & erreurs

- Aucun engagement confirmé : barre = 100 % variable + invite « Détecte tes charges récurrentes » → modale (section Détectés pré-remplie).
- Charge confirmée sans opération ce mois : statut « à venir », comptée dans `pending` (anticipation).
- Détection vide (pas assez d'historique) : section Détectés vide, message « Pas encore assez d'historique ».
- Erreur Supabase : message dans la modale ; détection/matching purs ne plantent jamais (entrées vides → vides).

## Hors périmètre

- Modification du hero / reste à vivre (inchangé, décidé).
- Récurrences non mensuelles (trimestriel/annuel) — v1 mensuel ; calibrage extensible plus tard.
- Notifications de dérive (juste un badge visuel).
- Suppression DB de `categories.is_fixed` (laissée).

## Critères de succès

- L'app **propose** des charges récurrentes depuis l'historique ; en 1 tap je les confirme ; je peux éditer le montant attendu / retirer.
- La barre Cockpit montre engagements (payé) vs variable + ce qu'il **reste à payer** ce mois.
- Chaque engagement signale sa **dérive** (hausse/baisse) et les statuts du mois.
- Aucune saisie de catégorie ; granularité par charge.
- `npm run test` vert (incl. `recurring-detect`, `recurring-match`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-27-recurring-charges.sql`.
