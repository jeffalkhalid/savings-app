# Cockpit — Vue Projection (patrimoine simple) (backlog #6, passe 1/2)

**Date** : 2026-06-16
**Branche** : `projection-view` (depuis `main`)
**Périmètre** : onglet **Projection patrimoine** — projeter le patrimoine futur à partir du patrimoine actuel + du flux d'épargne mensuel réel, capitalisés sur un horizon et un rendement paramétrables. Pose la **coquille à onglets** ; l'onglet **Simulateur PEG/PER seedé** est la passe 2 (placeholder ici).

## Contexte & décisions de cadrage

Backlog #6 voulait « brancher le simulateur PEG/PER sur les vrais flux mensuels ». Cadrage : le simulateur ([lib/simulator.ts](../../../lib/simulator.ts)) modélise de l'**épargne salariale** (PEG/PER, abondement Carrefour, inputs annuels intéressement/participation/volontaire) — des données qui **n'existent pas** dans le cockpit, et le mapping asset→PEG/PER/PEA est flou. On a donc **découpé** :

- **Passe 1 (ce doc)** : projection patrimoine **générique**, 100 % pilotée par les données réelles. N'utilise PAS le modèle PEG/PER.
- **Passe 2 (suivante)** : onglet simulateur PEG/PER seedé, avec son propre cadrage (mapping + saisie des inputs salariaux manquants).

**Décisions validées :**
- **Flux mensuel** = moyenne de `income − expense` par mois (les `transfer` sont neutres). C'est la vraie croissance du patrimoine (tout ce qui n'est pas dépensé). = « reste à vivre » du Dashboard, moyenné.
- **Source** : agrégation des `transactions` du user par mois (les mois en agrégats par catégorie restent des lignes `transactions`).
- **Patrimoine de départ** : total de `v_patrimoine` (déjà exposé par `usePatrimoineSummary`, filtré `user_id`).
- **Entrées éditables** : flux mensuel (pré-rempli au calcul), rendement (défaut 5 %/an), horizon (défaut 10 ans, 1–40).
- **Coquille à onglets** posée ; onglet Simulateur désactivé (« bientôt »).
- **Tests** : Vitest sur les fonctions pures. Reste vérifié par tsc/build/smoke.
- **Design** : mobile-first, tokens cream/ink/emerald, Fraunces/Geist, recharts.

## Architecture des fichiers

```
lib/cockpit/
  projection.ts        # PUR + testé :
                       #   averageMonthlyNet(txns) -> number
                       #   projectNetWorth({ initial, annualContribution, rate, years })
                       #     -> { year: number; value: number }[]
  projection.test.ts   # Vitest
  hooks.ts             # (étendu) useAllTransactions()

components/cockpit/projection/
  ProjectionTabs.tsx     # onglets : Projection (actif) | Simulateur PEG/PER (bientôt)
  ProjectionHero.tsx     # valeur à l'horizon + multiplicateur vs patrimoine actuel
  ProjectionChart.tsx    # recharts (aire emerald)
  ProjectionControls.tsx # flux mensuel + rendement + horizon (éditables)

app/cockpit/projection/page.tsx   # remplace le placeholder, assemble
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/hooks` (`useAuth`, `usePatrimoineSummary`), `@/lib/cockpit/types` (`Txn`).

## Modules purs (testés)

```ts
// Moyenne, sur les mois présents, de (income - expense). 0 si aucune transaction.
export function averageMonthlyNet(txns: Txn[]): number;

// Capitalisation annuelle avec annuité de fin de période.
// value(t) = initial*(1+r)^t + C*((1+r)^t - 1)/r  ; r=0 => initial + C*t ; t=0 => initial.
export function projectNetWorth(input: {
  initial: number;
  annualContribution: number;
  rate: number; // ex. 0.05
  years: number;
}): { year: number; value: number }[];
```

`averageMonthlyNet` : groupe par `txn.date.slice(0,7)` ; par mois, `Σ income − Σ |expense|` (via `type`) ; renvoie la moyenne des nets mensuels. Tests : 1 mois, plusieurs mois, liste vide → 0, `transfer`/`savings` ignorés dans le net.

`projectNetWorth` : tests : `t=0` = initial ; croissance composée connue (ex. 10000 @ 5 % sur 1 an + 1200/an → 10000·1.05 + 1200 = 11700) ; `rate=0` → linéaire ; `annualContribution=0` → capitalisation pure ; longueur = `years + 1` (de t=0 à t=years).

## Données

- **`useAllTransactions()`** : `supabase.from("transactions").select("id,date,amount,type")` (toutes, RLS) → `{ txns, loading, error }`. Sert uniquement au calcul du flux moyen.
- **Patrimoine de départ** : `usePatrimoineSummary(user.id)` → `Σ total_value`.

## Entrées & calcul (page)

- État local : `monthlyFlow` (init = `averageMonthlyNet(txns)` une fois chargé), `rate` (0.05), `years` (10).
- `annualContribution = monthlyFlow * 12`.
- `series = projectNetWorth({ initial: patrimoineTotal, annualContribution, rate, years })`.
- Héros : `series[series.length-1].value` + multiplicateur `value / initial` (si `initial > 0`).
- Recalcul en direct à chaque changement d'entrée (`useMemo`).

## Layout

1. **`ProjectionTabs`** : deux onglets. « Projection » actif ; « Simulateur PEG/PER » désactivé avec mention « bientôt » (placeholder passe 2).
2. **`ProjectionHero`** : valeur projetée à l'horizon (Fraunces, emerald) + ligne « ×N le patrimoine actuel · dans {years} ans ».
3. **`ProjectionChart`** : aire emerald sur paper (recharts), axe X = années.
4. **`ProjectionControls`** : 3 contrôles — flux mensuel (input €, pré-rempli + éditable), rendement (slider %, libellé), horizon (slider ans). Sous le flux, mention « moyenne observée : {eur(avg)} » pour le distinguer d'une saisie libre.

## États & erreurs

- Patrimoine de départ = 0 → bandeau « Ajoute des assets dans Patrimoine pour projeter sur une base réelle » ; la courbe reste affichée (croît depuis 0 avec les contributions).
- Aucune transaction → flux moyen = 0 ; champ flux éditable pour saisir une valeur.
- Erreurs Supabase (`useAllTransactions`) : message discret, n'empêche pas la saisie manuelle du flux.

## Hors périmètre (passe 2 et au-delà)

- Onglet Simulateur PEG/PER seedé (mapping assets→PEG/PER/PEA, saisie intéressement/participation/volontaire).
- Inflation, fiscalité, versements croissants.
- Scénarios multiples (pessimiste/optimiste).

## Critères de succès

- L'onglet Projection affiche une courbe de patrimoine futur sur données réelles (patrimoine actuel + flux moyen observé).
- Modifier flux / rendement / horizon met à jour héros + courbe en direct.
- La coquille à onglets est en place, l'onglet Simulateur visible mais inactif.
- `npm run test` vert (incl. `projection.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK, route `/cockpit/projection` présente.
