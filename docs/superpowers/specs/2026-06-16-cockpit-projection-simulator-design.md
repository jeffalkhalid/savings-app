# Cockpit — Onglet Simulateur PEG/PER (backlog #6, passe 2/2)

**Date** : 2026-06-16
**Branche** : `projection-simulator` (depuis `main`)
**Périmètre** : activer le second onglet de la page Projection — un **simulateur PEG/PER compact mobile** réutilisant le moteur existant `lib/simulator`, avec un seed léger (versement volontaire pré-rempli depuis l'épargne observée) et le classement des 6 stratégies.

## Contexte & cadrage

Le simulateur d'épargne salariale existe **déjà en entier** sur la page racine `/` (`app/page.tsx` + composants desktop `ParameterPanel`, `StrategyRanking`, `ComparisonChart`, `StrategyDetail`, `DataTables`, moteur `lib/simulator.simulateAll`, barèmes `lib/strategies`).

Le **cockpit ne tracke aucun PEG/PER** (comptes : BNP, PEA, Natixis, Or, Livret A, LDDS). « Seeder avec les vraies données » a donc peu de matière : les capitaux initiaux PEG/PER ne sont pas dans le cockpit, et l'épargne perso n'est pas de l'intéressement/participation. **Décision validée** : *intégrer le simulateur en version mobile compacte, avec seed léger* (versement volontaire = épargne mensuelle observée ×12, rendement, horizon éditables ; le reste garde les valeurs par défaut). Réglage fin complet : page `/`.

## Décisions validées

- **Moteur réutilisé tel quel** : `simulateAll(params)` + `DEFAULT_PARAMS` + `STRATEGIES`. Aucune logique de simulation réécrite.
- **Seed léger** : `volontaire` pré-rempli = `averageMonthlyNet(txns) * 12` (fonction déjà en place dans `lib/cockpit/projection.ts`) ; `rate`, `years` éditables ; tout le reste = `DEFAULT_PARAMS`.
- **UI mobile neuve et compacte** ; pas de réutilisation des gros composants desktop.
- **Onglets interactifs** : la page `/cockpit/projection` gère un état `tab` ("projection" | "simulateur") ; `ProjectionTabs` devient cliquable.
- **Tests** : Vitest sur les helpers purs. UI vérifiée par tsc/build/smoke.
- **Design** : tokens cream/ink/emerald, Fraunces/Geist, cohérent avec la vue Projection.

## Architecture des fichiers

```
lib/cockpit/
  projection-sim.ts        # PUR + testé : buildSimParams, rankByNet
  projection-sim.test.ts   # Vitest

components/cockpit/projection/
  ProjectionTabs.tsx        # MODIF : interactif (active + onSelect)
  ProjectionView.tsx        # NOUVEAU : contenu projection extrait de page.tsx
  SimulatorView.tsx         # NOUVEAU : contrôles + classement des stratégies
  SimulatorControls.tsx     # NOUVEAU : volontaire / rendement / horizon
  StrategyRankList.tsx      # NOUVEAU : liste classée des 6 stratégies

app/cockpit/projection/page.tsx   # MODIF : état tab ; rend ProjectionView | SimulatorView
```

Reuse : `@/lib/simulator` (`simulateAll`), `@/lib/strategies` (`DEFAULT_PARAMS`, `STRATEGIES`), `@/lib/types` (`SimulationParams`, `SimulationResult`, `StrategyKey`), `@/lib/cockpit/projection` (`averageMonthlyNet`), `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/hooks` (`useAllTransactions`).

## Modules purs (testés)

```ts
import type { SimulationParams, SimulationResult } from "@/lib/types";

// DEFAULT_PARAMS + overrides exposés. Le reste des paramètres garde ses valeurs par défaut.
export function buildSimParams(input: {
  volontaire: number;
  rate: number;   // ex. 0.06
  years: number;
}): SimulationParams;

// Stratégies triées par summary.net_total décroissant.
export function rankByNet(results: SimulationResult[]): SimulationResult[];
```

Tests `projection-sim.test.ts` :
- `buildSimParams` : `volontaire`/`rate`/`years` overridés ; un paramètre par défaut non exposé (ex. `plafondPEG`, `tmi`) conserve sa valeur de `DEFAULT_PARAMS`.
- `rankByNet` : tri décroissant sur `summary.net_total` ; ne mute pas l'entrée ; gagnante en tête.

## UI

**Onglets** : `ProjectionTabs({ active, onSelect })` — deux boutons « Projection » / « Simulateur PEG/PER », l'actif en `bg-ink text-paper`. La page gère `const [tab, setTab] = useState<"projection"|"simulateur">("projection")`.

**`ProjectionView`** : exactement le contenu projection actuel (hero + chart + controls), extrait de `page.tsx` sans changement de comportement.

**`SimulatorView`** :
1. `SimulatorControls` : versement volontaire annuel (input €, pré-rempli = `averageMonthlyNet*12`, éditable), rendement (slider %, défaut depuis `DEFAULT_PARAMS.rate`), horizon (slider ans, défaut `DEFAULT_PARAMS.years`).
2. `params = buildSimParams({ volontaire, rate, years })` ; `results = simulateAll(params)` ; `ranked = rankByNet(results)` (recalcul `useMemo`).
3. `StrategyRankList` : une ligne par stratégie (ordre `ranked`) — `STRATEGIES[k].label`, `summary.net_total` (mono), `×multiplier`, `STRATEGIES[k].short`/description courte ; la 1ère (gagnante) en emerald/encadrée.
4. Mention « Hypothèses par défaut (abondement Carrefour) — réglage fin sur la page principale ».

## Données

`SimulatorView` reçoit l'épargne moyenne via la page (`useAllTransactions` → `averageMonthlyNet`), déjà chargée pour l'onglet Projection. Aucune nouvelle requête.

## États & erreurs

- Pas de données transactions → `averageMonthlyNet = 0` → `volontaire` initial 0, éditable (le simulateur tourne quand même avec les autres versements par défaut).
- Tout est calcul local pur ; pas d'erreur réseau.

## Hors périmètre

- Réglage des ~20 paramètres (intéressement, participation, plafonds, fiscalité, capitaux initiaux) — reste sur `/`.
- Mapping assets→capitaux initiaux PEG/PER (non tracké dans le cockpit).
- Graphes détaillés par stratégie (`ComparisonChart`/`DataTables` desktop) — éventuelle passe ultérieure.

## Critères de succès

- L'onglet « Simulateur PEG/PER » est actif et bascule avec « Projection ».
- Le versement volontaire est pré-rempli depuis l'épargne observée ; ajuster volontaire/rendement/horizon reclasse les 6 stratégies en direct.
- Le classement reflète `simulateAll` (mêmes résultats que la page `/` à paramètres égaux).
- `npm run test` vert (incl. `projection-sim.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
