# Cockpit — Projection Monte Carlo

**Date** : 2026-06-16
**Branche** : `monte-carlo` (depuis `main`)
**Périmètre** : ajouter un mode **Monte Carlo** à l'onglet Projection patrimoine — rendement annuel aléatoire (log-normal), N trajectoires, affichage de la fourchette P10/P50/P90 — via un toggle « Déterministe | Monte Carlo », avec profils de risque pré-remplissant rendement+volatilité.

## Contexte

La projection actuelle ([lib/cockpit/projection.ts](../../../lib/cockpit/projection.ts) `projectNetWorth`) est **déterministe** : rendement constant, une seule trajectoire lisse. Elle ne montre ni la volatilité, ni le risque de séquence de rendements, ni d'intervalles de confiance. Le Monte Carlo répond à « à ce rythme, quelle fourchette réaliste dans N ans ? ».

L'onglet Projection vit dans `components/cockpit/projection/ProjectionView.tsx` (toggle d'onglets Projection/Simulateur déjà en place au niveau page). Cette feature ajoute un **second toggle interne** à la vue Projection.

## Décisions validées

- **Intégration** : toggle « Déterministe | Monte Carlo » dans l'onglet Projection. Le mode déterministe reste l'actuel, inchangé.
- **Volatilité** : profils de risque (Prudent / Équilibré / Dynamique) qui pré-remplissent (μ, σ), puis curseurs ajustables (le curseur rendement existant = μ ; nouveau curseur σ).
- **Modèle** : log-normal, facteur annuel `exp((ln(1+μ) − σ²/2) + σ·z)`, `z ~ N(0,1)`. Contributions fixes (épargne mensuelle ×12), initial fixe.
- **Reproductible** : PRNG seedé (`mulberry32`) + Box-Muller, `seed` fixe, `runs = 1000`. Mêmes entrées ⇒ mêmes bandes (testable, pas de scintillement).
- **Sortie** : percentiles **P10 / P50 / P90** par année.
- **Tests** : Vitest sur le moteur pur. UI vérifiée par tsc/build/smoke.
- **Design** : tokens cream/ink/emerald, Fraunces/Geist, recharts ; mobile.

## Profils de risque

| Profil | μ (rendement) | σ (volatilité) |
|--------|---------------|----------------|
| Prudent | 3 % | 6 % |
| Équilibré | 5 % | 12 % |
| Dynamique | 7 % | 18 % |

Sélectionner un profil pose `rate=μ` et `sigma=σ` ; les curseurs restent ajustables ensuite.

## Architecture des fichiers

```
lib/cockpit/
  monte-carlo.ts        # PUR + testé : mulberry32, gaussian, percentile, simulateMonteCarlo
  monte-carlo.test.ts   # Vitest

components/cockpit/projection/
  ProjectionModeToggle.tsx  # Déterministe | Monte Carlo
  RiskProfilePicker.tsx     # 3 boutons profils
  MonteCarloChart.tsx       # bande P10–P90 + ligne P50 (recharts)
  MonteCarloHero.tsx        # P50 à l'horizon + fourchette P10–P90
  ProjectionView.tsx        # MODIF : état mode/sigma/profile ; rend déterministe ou MC

(constante RISK_PROFILES dans monte-carlo.ts ou RiskProfilePicker.tsx)
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/projection` (`projectNetWorth` pour le mode déterministe, inchangé), composants existants `ProjectionHero`/`ProjectionChart`/`ProjectionControls`.

## Moteur pur (testé)

```ts
export type McPoint = { year: number; p10: number; p50: number; p90: number };

// PRNG déterministe 32 bits.
export function mulberry32(seed: number): () => number;

// Normale standard via Box-Muller, à partir d'un rng() uniforme [0,1).
export function gaussian(rng: () => number): number;

// p ∈ [0,1] sur un tableau trié croissant (interpolation linéaire).
export function percentile(sorted: number[], p: number): number;

// Renvoie les percentiles par année (year 0 = initial), runs trajectoires log-normales.
export function simulateMonteCarlo(input: {
  initial: number;
  annualContribution: number;
  mu: number;     // ex. 0.05
  sigma: number;  // ex. 0.12
  years: number;
  runs: number;   // ex. 1000
  seed: number;   // ex. 42
}): McPoint[];
```

**Algorithme** : pour chaque run, `v = initial` ; pour `t = 1..years` : `z = gaussian(rng)` ; `factor = exp(Math.log(1+mu) - sigma*sigma/2 + sigma*z)` ; `v = v*factor + annualContribution`. On stocke `v` par année et par run, puis on calcule p10/p50/p90 par année (tri + `percentile`). Année 0 = `initial` pour tous.

**Tests** :
- `σ=0` ⇒ p10=p50=p90, et la trajectoire égale (à l'arrondi près) la capitalisation déterministe `initial*(1+μ)^t + C·…` (cohérence avec `projectNetWorth`).
- `σ>0` ⇒ `p10 < p50 < p90` à l'horizon ; longueur `years+1` ; `year 0 = initial`.
- `percentile` : médiane d'une liste connue, bornes p0/p1.
- déterminisme : `simulateMonteCarlo` même entrée (même seed) ⇒ sortie identique.
- `mulberry32` : même seed ⇒ même séquence ; valeurs dans [0,1).

## UI & intégration

- **`ProjectionModeToggle({ mode, onMode })`** : deux boutons (style des onglets : actif `bg-ink text-paper`).
- **`RiskProfilePicker({ active, onSelect })`** : 3 boutons ; au clic, la vue applique le profil (rate+sigma).
- **`MonteCarloChart({ points })`** : recharts ; bande P10–P90 (aire emerald 0.18 jusqu'à p90, aire paper opaque jusqu'à p10 pour « découper » le bas) + `Line` P50 emerald ; axe X = années.
- **`MonteCarloHero({ points, years })`** : `p50` à l'horizon (Fraunces emerald) + ligne mono « P10 {eur} – P90 {eur} ».
- **`ProjectionView`** (modif) : ajoute `mode: "deterministe"|"montecarlo"` (défaut déterministe), `sigma` (défaut 0.12), `profile`. Le `rate` existant sert de μ. 
  - Mode déterministe : rendu actuel (hero/chart/controls) inchangé.
  - Mode Monte Carlo : `points = useMemo(simulateMonteCarlo({ initial, annualContribution: monthlyFlow*12, mu: rate, sigma, years, runs: 1000, seed: 42 }))` → `MonteCarloHero` + `MonteCarloChart` + `RiskProfilePicker` + curseurs rendement(μ)/volatilité(σ)/horizon + champ épargne.
  - Le toggle est rendu en tête, sous les hints éventuels.

## États & erreurs

- `initial = 0` : la fourchette part de 0 et croît via les contributions (bande visible dès qu'il y a de l'épargne). Hint patrimoine existant conservé.
- Calcul 100 % local pur ; pas d'erreur réseau. `runs=1000 × years≤40` reste fluide en `useMemo`.

## Hors périmètre

- Corrélation entre actifs / multi-classes (un seul couple μ/σ global).
- Inflation, fiscalité, versements croissants.
- Réglage de `runs`/`seed` par l'utilisateur (constantes).
- Monte Carlo sur le simulateur PEG/PER (la valeur y est la comparaison relative).

## Critères de succès

- L'onglet Projection a un toggle Déterministe/Monte Carlo ; le mode déterministe est inchangé.
- En mode MC : choisir un profil pose rendement+volatilité ; ajuster μ/σ/horizon/épargne met à jour la fourchette en direct.
- Le graphe montre la bande P10–P90 + médiane P50 ; le hero montre P50 + fourchette à l'horizon.
- Mêmes entrées ⇒ même fourchette (reproductible) ; `σ=0` ⇒ fourchette plate = projection déterministe.
- `npm run test` vert (incl. `monte-carlo.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
