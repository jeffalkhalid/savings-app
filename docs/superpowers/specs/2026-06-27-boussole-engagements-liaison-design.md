# Boussole — Liaison des engagements à la saisie / l'import

**Date** : 2026-06-27
**Branche** : `boussole-redesign`
**Périmètre** : pouvoir **lier** une dépense à un engagement récurrent au moment de la saisie (TxnModal) et de l'import BNP (revue), avec **reconnaissance automatique** des bénéficiaires déjà liés. Extension de la feature « Engagements récurrents » existante ; **aucune nouvelle table / migration**.

## Décisions validées

- **Saisie manuelle** : une dépense peut **créer** un engagement (case « Engagement récurrent »). Si le bénéficiaire est déjà un engagement → badge lecture seule.
- **Import** : les lignes dont le bénéficiaire correspond à un engagement connu sont **reconnues automatiquement** (badge) ; une **case par ligne** permet d'en marquer une nouvelle → créée à l'import.
- **Détection « Détectés »** conservée (raccourci, inchangée).
- Réutilise `recurring_charges`, `createRecurringCharge`, `useRecurringCharges`, `normalizePayee`. Rapprochement mensuel/barre/section : inchangés.

## Module pur (testé) — `lib/cockpit/recurring-detect.ts` (ajout)

```ts
export function isEngagement(description: string, keys: Set<string>): boolean;
```
- `return keys.has(normalizePayee(description));`

**Tests** : libellé dont le bénéficiaire normalisé ∈ `keys` → true ; sinon false ; insensible casse/chiffres (« NETFLIX 0612 » vs clé « netflix »).

## Saisie manuelle — `TxnModal`

- Nouvelle prop `engagementKeys: Set<string>` (les `payee_key` des engagements actifs).
- `payeeOf = description.trim() || categoryName` ; `alreadyEngagement = isEngagement(payeeOf, engagementKeys)`.
- Affichage **seulement si la catégorie sélectionnée est de type `expense`** :
  - si `alreadyEngagement` → badge lecture seule « ✓ Déjà un engagement récurrent » ;
  - sinon → case **« Engagement récurrent »** (état local `engagement`, défaut décoché).
- À l'enregistrement : après `createTransaction`/`updateTransaction`, si `cat.type === "expense"` ET `engagement` coché ET `!alreadyEngagement` → `createRecurringCharge(userId, { payeeKey: normalizePayee(payeeOf), label: payeeOf, expectedAmount: amt })`.
- **Cockpit** : passe `engagementKeys` (depuis `charges`) aux deux `TxnModal` ; `onSaved` refait `refetch()` **et** `refetchCharges()`.

## Import — `ReviewRow` / `ReviewTable` / page import

- **`ReviewRow`** : props ajoutées `engagementKnown: boolean`, `engagement: boolean`, `onToggleEngagement: (v: boolean) => void`. Pour une ligne **dépense** (`row.amount < 0`) :
  - si `engagementKnown` → petit **badge « engagement »** (reconnu auto, pas de case) ;
  - sinon → case **« engagement »** (liée à `engagement`/`onToggleEngagement`).
  - (lignes non-dépense : rien.)
- **`ReviewTable`** : relaie ces props par ligne (calcule `engagementKnown` via `isEngagement(row.label, engagementKeys)` ; expose `onToggleEngagement(index, v)`).
- **Page import** (`app/cockpit/import/page.tsx`) :
  - `useRecurringCharges()` → `engagementKeys = new Set(charges.map((c) => c.payee_key))`.
  - `Row` type += `engagement: boolean` (défaut `false`) ; `setEngagement(i, v)`.
  - À l'import (`doImport`), après `createTransactionsBulk`, pour chaque ligne **incluse, dépense, `engagement` coché et non déjà connue** → `createRecurringCharge(user.id, { payeeKey: normalizePayee(r.label), label: r.label, expectedAmount: Math.abs(r.amount) })` (dédupe sur `payee_key` déjà créé dans le lot).

## États & erreurs

- Catégorie non-dépense (revenu/épargne) : pas d'option engagement (saisie + import).
- Bénéficiaire déjà engagement : badge, pas de double création (l'upsert `onConflict (user_id,payee_key)` protège de toute façon).
- Libellé vide en saisie : `payeeOf` retombe sur le nom de catégorie.
- Erreur Supabase à la création d'engagement : remonte le message ; la transaction/l'import a déjà réussi (création d'engagement = effet secondaire best-effort, message non bloquant).

## Hors périmètre

- Délier une dépense déjà comptée (se fait via la section Engagements → retrait).
- Récurrences non mensuelles.
- Pré-remplissage d'un budget de catégorie à la confirmation (resté séparé).

## Critères de succès

- En saisie manuelle d'une dépense, cocher « Engagement récurrent » crée l'engagement ; les occurrences suivantes sont reconnues (barre + section).
- À l'import, les bénéficiaires déjà liés sont badgés ; marquer une nouvelle ligne la crée comme engagement à l'import.
- Aucune régression sur la saisie/import existants ; pas de migration.
- `npm run test` vert (incl. `isEngagement`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
