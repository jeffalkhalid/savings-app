# Boussole Phase 1 — Reskin Projection + onglet Épargne

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : ré-habiller l'écran **Projection** au look Boussole et **extraire** le Simulateur PEG/PER dans un **onglet de nav dédié « Épargne »** (`/cockpit/epargne`, 5ᵉ onglet). Iso-fonctionnel, aucun backend, aucune migration.

## Décisions validées

- **2 onglets de nav séparés** : Projection (déterministe + Monte-Carlo) et **Épargne** (stratégies). On supprime les sous-onglets internes (`ProjectionTabs`).
- Logique **inchangée** (`projection.ts`, `projection-sim.ts`, `monte-carlo.ts`, `lib/strategies.ts`, `lib/simulator.ts`) — déjà testée. Reskin = restyle Tailwind vers les tokens Boussole.
- Icônes lucide ; montants `.font-mono-num` ; titres `.font-display`. Graphes recharts : couleurs littérales Boussole.

## Structure & routing

- **`TabBar`** : ajouter un 5ᵉ onglet `{ href: "/cockpit/epargne", label: "Épargne", Icon: Sprout }` (lucide).
- **`app/cockpit/epargne/page.tsx`** (nouveau) : en-tête « Stratégies d'épargne » + le contenu actuel de `SimulatorView` (`SimulatorControls` + `StrategyRankList` + note hypothèses). `SimulatorView` peut être conservé tel quel (rendu par la nouvelle page) ou inliné — au choix de l'implémentation ; les composants enfants sont restylés.
- **`app/cockpit/projection/page.tsx`** : retire `ProjectionTabs` et le rendu `SimulatorView` ; ne garde que `ProjectionView`. En-tête « Projection ».
- **`ProjectionTabs.tsx`** : supprimé (plus de sous-onglets).

## Reskin — Projection

- **`ProjectionModeToggle`** : contrôle **segmenté** (conteneur `bg-seg rounded-xl p-1`, bouton actif `bg-card text-ink`, inactif `text-ink-muted`) — même motif que le sélecteur de thème des Réglages.
- **`ProjectionHero`** (déterministe) et **`MonteCarloHero`** (médian) : carte `bg-card rounded-[26px] p-6` ; libellé `ink-muted` ; gros montant projeté en `font-display text-4xl text-emerald` ; sous-texte (gain cumulé / fourchette p10–p90) `ink2`.
- **`ProjectionChart`** : carte `bg-card`, courbe médiane `#3E7D5A` (épaisse), optimiste `#C9A24B` / prudent `#B0805F` (pointillés), axes `#9A8E7C`.
- **`MonteCarloChart`** : carte `bg-card`, bande p10–p90 `rgba(62,125,90,0.14)`, médiane `#3E7D5A`, p90 `#C9A24B` / p10 `#B0805F` (pointillés).
- **`ProjectionControls`** + slider volatilité : libellés `text-[13px] text-ink-muted`, valeurs en `text-accent` ; sliders inchangés (héritent du style global déjà re-thémé).
- **`RiskProfilePicker`** : boutons-cartes (prudent/équilibré/dynamique) en pills Boussole (actif `bg-accent text-[#FBF3EC]` ou bord accent, inactif `bg-seg`/`border-rule`).

## Reskin — Épargne (Simulateur)

- **`SimulatorControls`** : même restyle que `ProjectionControls` (labels/valeurs Boussole).
- **`StrategyRankList`** : chaque stratégie en **carte `bg-card rounded-2xl`** : badge de rang, nom court, libellé secondaire `ink-muted`, montant net en `font-mono-num` (gros), badge **« Top »** (`bg-emerald text-[#FBF3EC]`) sur la meilleure. (Conserve les données/ordre fournis par `rankByNet`.)

## États & erreurs

- `initial === 0` (pas d'actifs) : message existant conservé (« Ajoute des assets… »), restylé.
- `txnError` : note existante conservée.
- Bascule déterministe/Monte-Carlo et profils de risque : comportement inchangé.
- Aucune perte de fonction (sliders, recalcul temps réel, classement stratégies).

## Hors périmètre

- Modification de la logique de simulation ou des hypothèses (abondement Carrefour, etc.).
- Nouveaux paramètres / nouvelles stratégies.
- Conversion multi-devises de la projection (hors sujet ; la projection reste en EUR).

## Critères de succès

- 5 onglets de nav (Cockpit · Patrimoine · Projection · Épargne · Objectifs) ; Projection ne montre que la projection, Épargne le simulateur de stratégies.
- Projection au look Boussole (toggle segmenté, hero carte, graphes colorés Boussole, sliders, profils) en déterministe **et** Monte-Carlo ; Épargne au look Boussole (contrôles + classement en cartes).
- Lisible clair + sombre ; aucune régression fonctionnelle.
- `npm run test` vert (suite existante) ; `npx tsc --noEmit` clean ; `npm run build` OK (routes `/cockpit/projection` et `/cockpit/epargne`).
