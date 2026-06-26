# Boussole Phase 1 — Reskin Patrimoine + icônes premium (lucide)

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : (A) remplacer le système d'icônes **emoji** par des **icônes lucide premium** dans tout le Cockpit déjà livré, et (B) ré-habiller l'écran **Patrimoine** au look Boussole, iso-fonctionnel. Aucun backend.

## Contexte & décisions

- **Icônes premium** : tout passe par **`lucide-react`** (déjà dépendance, utilisé par `TabBar`/`ThemeToggle`). Plus aucun emoji dans l'UI. Les helpers d'icônes renvoient un **composant `LucideIcon`**, pas une chaîne. Voir [[premium-icons]].
- **Patrimoine** : on **garde le graphe d'évolution** (restylé). **Reporté en Phase 2** (besoin backend) : devise de reporting / multi-devises, allocation cible (réel vs objectif), montants natifs.
- Modales `AssetModal`/`ValuationModal` conservées (héritent de la palette) ; passage en bottom-sheets = polish ultérieur.
- Montants en `.font-mono-num` ; titres `.font-display`.

## Existant réutilisé

- Patrimoine : `app/cockpit/patrimoine/page.tsx`, composants `PatrimoineHero`, `PatrimoineChart`, `TypeBreakdown`, `AssetList`, `AssetModal`, `ValuationModal` ; lib `patrimoine.ts` (`Asset`, `PatrimoineLine`, `buildPatrimoineSeries`, `withShares`, `typeLabel`) ; hooks `useAssets`, `useAssetValuations`, `usePatrimoineSummary`, `useAccounts`.
- Cockpit (à rétrofiter) : `category-icon.ts` (emoji → lucide), `cockpit-notes.ts` (emoji → kind), `CategoryRow`, `CategoryBreakdown`, `InsightsRow`, `OpsDrill`, `app/cockpit/page.tsx`.

## Partie A — Système d'icônes premium

### `lib/cockpit/category-icon.ts` (rework)
```ts
import type { LucideIcon } from "lucide-react";
export function categoryIcon(name: string): LucideIcon;
```
- Renvoie un composant lucide selon un mot-clé normalisé (insensible casse/accents). Mapping : `salaire→Briefcase`, `logement→Home`, `course→ShoppingCart`, `restaurant→UtensilsCrossed`, `transport→Car`, `energie→Zap`, `telephon|internet→Smartphone`, `assurance→Shield`, `sante→HeartPulse`, `loisir→Clapperboard`, `vetement→Shirt`, `banc→Landmark`, `virement→ArrowLeftRight`, `epargne→PiggyBank`, `invest|bourse|natixis→TrendingUp` ; défaut `CreditCard`.

**Tests** (mise à jour) : `categoryIcon("Courses alimentaires") === ShoppingCart` ; `"Bourse / Natixis" === TrendingUp` ; `"Logement" === Home` ; insensible casse (`"ÉNERGIE" === Zap`) ; inconnu `=== CreditCard`.

### `lib/cockpit/asset-icon.ts` (nouveau)
```ts
import type { LucideIcon } from "lucide-react";
export function assetIcon(type: string): LucideIcon;
```
- `stock|action→TrendingUp`, `saving|livret→PiggyBank`, `cash|liquid→Banknote`, `commodity|or→Coins` ; défaut `CreditCard`. Insensible casse.

**Tests** : `assetIcon("stock") === TrendingUp` ; `"savings" === PiggyBank` ; `"commodity" === Coins` ; inconnu `=== CreditCard`.

### `lib/cockpit/cockpit-notes.ts` (rework)
- `Note` ne porte plus `icon: string` (emoji) mais `kind: "status" | "rise" | "dominant"` :
  ```ts
  export type Note = { kind: "status" | "rise" | "dominant"; title: string; body: string; tone: Mood["tone"] };
  ```
- `buildNotes` inchangé sauf le champ : carte statut → `kind: "status"` ; hausse → `kind: "rise"` ; dominant → `kind: "dominant"`. Dédup par `title`, max 3 (comportement inchangé).

**Tests** (mise à jour) : remplacer les assertions `icon === "📈"/"📊"` par `kind === "rise"/"dominant"` ; statut `kind === "status"`.

### Consommateurs (rendu lucide)
- **`CategoryRow`** : prop `Icon: LucideIcon` (au lieu de `icon: string`) ; rend `<Icon size={17} className="text-ink2" />` dans la tuile `bg-tile`.
- **`CategoryBreakdown`** : `icon={categoryIcon(i.name)}` → `Icon={categoryIcon(i.name)}`.
- **`InsightsRow`** : mappe `kind`→lucide (`status`→`Sprout`/`ThumbsUp`/`TriangleAlert` selon `tone`, `rise`→`TrendingUp`, `dominant`→`PieChart`) + couleur via `tone`. Rend `<Icon size={20} />`.
- **`OpsDrill`** : prop `Icon: LucideIcon` pour la tuile d'en-tête ; état vide rend `<SearchX size={28} />`.
- **`app/cockpit/page.tsx`** : passe `Icon={categoryIcon(drillCat?.name ?? "")}` en mode catégorie et `Icon={Wallet}` (lucide) en mode « toutes dépenses ».

## Partie B — Reskin Patrimoine

- **`PatrimoineHero`** : carte verte arrondie (`#3E7D5A`), `Patrimoine total` (label), **total** en gros (`.font-display`), badges : delta « ▲/▼ {eur} ce mois » (vert clair) + « {n} actifs ». Texte clair `text-[#FBF3EC]`.
- **`PatrimoineChart`** : carte `bg-card rounded-2xl p-…`, courbe `emerald`, axes/labels discrets `ink-muted`. Mêmes données `series` ; conserve l'état vide actuel.
- **`TypeBreakdown`** → titre `font-display` « Répartition » ; pour chaque `withShares(lines)` : ligne `typeLabel` + valeur (`.font-mono-num`) + part % + barre (`bg-rule` piste, remplissage `accent/70`).
- **`AssetList`** → titre « Mes actifs » ; chaque actif : tuile `bg-tile` `<Icon=assetIcon(type) size={18} />`, nom, sous-ligne `typeLabel(type)` (+ `ticker`/`quantity` si présents), valeur (`.font-mono-num`) ; conserve `loading`/`error`/`onSelect`. Nouvelle prop `onAdd: () => void` → bouton pointillé « + Ajouter un actif » en bas de liste. État vide soigné (icône lucide `Landmark`, message) suivi du même bouton.
- **`app/cockpit/patrimoine/page.tsx`** : câble les composants restylés ; passe `count={assets.length}` au hero et `onAdd={() => setShowCreate(true)}` à `AssetList`. `Fab`, modales, refetch inchangés (le `Fab` et le bouton de liste appellent le même `setShowCreate(true)`).

## États & erreurs

- Aucun actif : `AssetList` montre l'état vide ; hero total 0 €, delta null (pas de badge delta) ; graphe vide géré comme aujourd'hui.
- `delta` null (moins de 2 points) : pas de badge delta.
- Icône inconnue : défaut `CreditCard` (catégorie) / `CreditCard` (actif).

## Hors périmètre

- Multi-devises / devise de reporting, allocation cible, montants natifs (Phase 2).
- Conversion des modales en bottom-sheets (polish ultérieur).
- Reskin Projection / Stratégies (sous-phases suivantes).

## Critères de succès

- Plus aucun emoji dans le Cockpit ni le Patrimoine : icônes lucide partout (tuiles catégories, « À noter », drill, actifs).
- Patrimoine au look Boussole : hero vert (total + delta + n actifs), graphe restylé, répartition, liste d'actifs à tuiles ; clair + sombre.
- Aucune perte de fonction (ajout/édition d'actif, valuations, navigation).
- `npm run test` vert (incl. `category-icon`, `asset-icon`, `cockpit-notes`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
