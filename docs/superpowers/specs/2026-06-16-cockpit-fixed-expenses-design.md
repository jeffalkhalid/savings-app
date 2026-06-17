# Cockpit — Charges fixes (split Fixe/Variable)

**Date** : 2026-06-16
**Branche** : `fixed-expenses` (depuis `main`)
**Périmètre** : isoler les charges fixes du Dashboard — une barre **Fixe/Variable** (après le StatStrip) basée sur les prélèvements `recurring`, avec **drill** vers le détail des charges fixes. Répond à « combien d'incompressible vs d'optimisable ».

## Contexte & découvertes

La répartition par poste du Dashboard mélange fixe (Logement, Énergie, Assurance, Téléphonie, abonnements…) et variable (Courses, Restos, Loisirs). La table **`recurring`** (7 prélèvements fixes) existe mais **n'était lue par aucune feature** du cockpit. Schéma réel (sondé) : `id, user_id, name, amount, day_of_month, frequency, category_id, account_id, active`.

## Décisions validées

- **Critère « fixe »** : **montant contractuel des `recurring` actifs** (normalisés au mois). `Fixe = Σ monthlyAmount(recurring actifs)`. `Variable = max(0, dépenses du mois − Fixe)`.
- **Placement** : barre Fixe/Variable sur le Dashboard (après `StatStrip`) ; **tap → drill** vers la liste des charges fixes (même UX que le drill catégorie). Pas de nouvel onglet.
- **Tests** : Vitest sur la couche pure. UI vérifiée par tsc/build/smoke.
- **Design** : tokens cream/ink/emerald, Fraunces/Geist. Fixe en `ink` (incompressible), Variable en `emerald` (optimisable).
- **Approximation assumée** : `Variable` compare les dépenses réelles du mois au fixe *contractuel* ; plancher à 0 si un prélèvement n'est pas encore passé.

## Architecture des fichiers

```
lib/cockpit/
  fixed.ts          # PUR + testé : type Recurring ; monthlyAmount, monthlyFixedTotal, fixedVariableSplit
  fixed.test.ts     # Vitest
  hooks.ts          # MODIF : + useRecurring(userId)

components/cockpit/
  FixedVariableBar.tsx   # barre Fixe/Variable (tappable -> drill)
  FixedChargesList.tsx   # vue drill : liste des recurring + total

app/cockpit/page.tsx     # MODIF : état showFixed ; barre + drill charges fixes
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Category`), `@/lib/cockpit/metrics` (`computeMetrics` → `depenses`), `@/lib/cockpit/hooks`.

## Couche pure (testée)

```ts
export type Recurring = {
  id: string;
  name: string;
  amount: number;
  day_of_month: number | null;
  frequency: string;       // "monthly" | "yearly" | "quarterly" | "weekly" | ...
  category_id: string | null;
  account_id: string | null;
  active: boolean;
};

// Montant normalisé au mois selon la fréquence (défaut = mensuel).
export function monthlyAmount(r: Recurring): number;

// Σ des montants mensualisés des lignes actives.
export function monthlyFixedTotal(recurring: Recurring[]): number;

export function fixedVariableSplit(
  depenses: number,
  fixedTotal: number
): { fixe: number; variable: number; fixedShare: number };
```

**`monthlyAmount`** : `amount × m`, où `m` = `{ monthly:1, yearly:1/12, quarterly:1/3, weekly:52/12 }[frequency] ?? 1`. Utilise `Math.abs(amount)` (les montants peuvent être stockés négatifs/positifs).

**`monthlyFixedTotal`** : filtre `active`, somme `monthlyAmount`.

**`fixedVariableSplit`** : `fixe = fixedTotal` ; `variable = Math.max(0, depenses − fixedTotal)` ; `fixedShare = (fixe+variable)>0 ? fixe/(fixe+variable) : 0`.

**Tests** :
- `monthlyAmount` : monthly→amount ; yearly→amount/12 ; quarterly→amount/3 ; weekly→amount×52/12 ; fréquence inconnue→amount ; signe via `Math.abs`.
- `monthlyFixedTotal` : ignore `active=false` ; somme normalisée d'un mix de fréquences.
- `fixedVariableSplit` : variable plancher à 0 quand `depenses < fixedTotal` ; `fixedShare` correct ; cas total 0 → share 0.

## Données

- **`useRecurring(userId)`** : `supabase.from("recurring").select("id,name,amount,day_of_month,frequency,category_id,account_id,active").eq("user_id", userId)` → `{ recurring, loading, error }`.
- Dépenses du mois : `computeMetrics(txns).depenses` (déjà calculé sur le Dashboard).

## UI

**`FixedVariableBar({ fixe, variable, onDrill })`** :
- Libellé : « Charges fixes » + `{eur(fixe)}/mois` + part « {fixedShare%} des dépenses ».
- Barre 2 segments (largeurs = parts) : Fixe `bg-ink`, Variable `bg-emerald`, fond `bg-rule`.
- Sous-texte : `{eur(fixe)} incompressible · {eur(variable)} optimisable`.
- Tappable (`<button>`) → `onDrill`.

**`FixedChargesList({ recurring, categories, onBack })`** :
- Bouton `‹ Retour` + titre « Charges fixes ».
- Une ligne par `recurring` actif (trié par `monthlyAmount` desc) : `name`, catégorie (via `categories`), `{eur(monthlyAmount)}/mois`, « le {day_of_month} ».
- Total mensuel en pied.

## Intégration page

`app/cockpit/page.tsx` : ajoute `const [showFixed, setShowFixed] = useState(false)` et `useRecurring(user.id)`. Calcule `fixedTotal = monthlyFixedTotal(recurring)` et `split = fixedVariableSplit(metrics.depenses, fixedTotal)` (`useMemo`).
- `changeMonth` réinitialise `drillCategory` **et** `showFixed`.
- Rendu de la zone principale :
  - `showFixed` → `FixedChargesList` (back → `setShowFixed(false)`) ;
  - sinon `drillCategory` → drill txns (inchangé) ;
  - sinon → `FixedVariableBar` (onDrill → `setShowFixed(true)`) **puis** `CategoryBreakdown`.
- `HeroBand`, `StatStrip`, FAB, `TxnModal` inchangés.

## États & erreurs

- Aucun `recurring` actif : `fixe = 0`, barre affiche 100% variable (ou masquée si `fixedTotal === 0` — on **masque** la barre dans ce cas pour ne pas afficher une barre vide).
- Erreur `useRecurring` : barre masquée, reste du Dashboard intact.
- Liste vide en drill : « Aucune charge fixe ».

## Hors périmètre

- Édition/CRUD des prélèvements `recurring` (lecture seule ici).
- Rapprochement prélèvement ↔ transaction réelle (matching).
- Projection des charges fixes / alertes d'échéance.
- Normalisation fine des fréquences exotiques (on couvre monthly/yearly/quarterly/weekly + défaut mensuel).

## Critères de succès

- Le Dashboard montre une barre **Fixe/Variable** (incompressible vs optimisable) sous les stats, basée sur les `recurring`.
- Taper la barre ouvre le **détail des charges fixes** (liste + total mensuel) ; retour revient au Dashboard.
- Si aucun prélèvement actif, la barre est masquée (pas de bruit).
- `npm run test` vert (incl. `fixed.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
