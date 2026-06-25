# Boussole Phase 1 — Reskin Cockpit

**Date** : 2026-06-25
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : ré-habiller l'écran **Cockpit** sur le système Boussole, **iso-fonctionnel** (données et hooks existants). Aucun backend. Budgets par catégorie → Phase 2.

## Contexte (existant réutilisé)

- `computeMetrics(txns): Metrics` = `{ revenus, depenses, epargne, transferts, tauxEpargne, resteAVivre }`.
- `analyzeCategories(rows, month, categories): CategoryInsight[]` = `{ categoryId, name, total, nTxns, share, avgPrior, deltaPct }` triés par total décroissant.
- `fixedVariableSplit(depenses, fixedTotal)` + `FixedVariableBar`.
- `pendingTransfers` + `TransferNudge`/`TransferTriage` (déjà construits ; conservés tels quels).
- `eur(n)` (`@/lib/cockpit/format`), `Txn` = `{ id, date, amount, description, type, category_id, account_id, … }`, `Category` = `{ id, name, type, color }`.
- Composants actuels à remplacer/restyler : `HeroBand`, `StatStrip`, `CategoryBreakdown`, `CategoryRow`, `FixedVariableBar` ; drill inline dans `app/cockpit/page.tsx`.

## Décisions validées

- **Objectif de taux** par défaut **20 %** (codé en P1, réglable en Phase 2). Mood : `taux ≥ 20 %` → « Au top » ; `10–20 %` → « Bien » ; `< 10 %` → « À surveiller ».
- **Drill fidèle maquette** : recherche dans le drill par catégorie **et** vue « Toutes les opérations » (via la tuile Dépenses) avec **chips de filtre** par catégorie. Tout côté client.
- **Catégories** : barre = **part des dépenses** + chip de tendance (`deltaPct`). Pas de texte budget (Phase 2).
- **Montants** en `.font-mono-num` ; titres `.font-display` (Fraunces).

## Architecture des fichiers

```
lib/cockpit/
  mood.ts            + mood.test.ts            # savingsMood
  cockpit-notes.ts   + cockpit-notes.test.ts   # buildNotes (cartes "À noter")
  txn-filter.ts      + txn-filter.test.ts       # filterTxns (recherche + filtre)
  category-icon.ts   + category-icon.test.ts    # categoryIcon (emoji)

components/cockpit/
  HeroCard.tsx        # remplace HeroBand
  StatStrip.tsx       # restyle (3 cartes, Dépenses tappable)
  InsightsRow.tsx     # nouvelle bande "À noter"
  CategoryRow.tsx     # restyle (tuile emoji + tendance + barre de part)
  CategoryBreakdown.tsx # restyle en-tête "Par catégorie"
  FixedVariableBar.tsx  # restyle
  OpsDrill.tsx        # nouveau : drill par catégorie + toutes-opérations

app/cockpit/page.tsx  # calcule mood/notes, état drill étendu, branche les nouveaux composants
```

## Modules purs (testés)

### `mood.ts`
```ts
export type MoodTone = "good" | "ok" | "watch";
export type Mood = { label: string; progress: number; tone: MoodTone };

// taux et goal en 0..1. progress = clamp(taux/goal, 0, 1).
export function savingsMood(taux: number, goal: number): Mood;
```
- `goal <= 0` → `progress = 0`.
- `taux >= goal` → `{ label: "Au top", tone: "good" }` ; `taux >= goal/2` → `{ label: "Bien", tone: "ok" }` ; sinon `{ label: "À surveiller", tone: "watch" }`.

**Tests** : taux 0.25/goal 0.20 → good, progress 1 ; 0.12 → ok ; 0.04 → watch ; goal 0 → progress 0 ; clamp ne dépasse pas 1.

### `cockpit-notes.ts`
```ts
import type { CategoryInsight } from "./categories-analysis";
import type { Mood } from "./mood";

export type Note = { icon: string; title: string; body: string; tone: Mood["tone"] };

// Jusqu'à 3 cartes : statut épargne (mood), poste en plus forte hausse, poste dominant.
export function buildNotes(insights: CategoryInsight[], mood: Mood): Note[];
```
- Carte 1 (toujours) : statut épargne → `icon` par `mood.tone` (`good "🌱"`, `ok "👍"`, `watch "⚠️"`), `title = mood.label`, `body = "Ton taux d'épargne ce mois"`, `tone = mood.tone`.
- Carte 2 (si une `insight` a `deltaPct != null && deltaPct > 0`) : celle au `deltaPct` max → `icon "📈"`, `title = name`, `body = "+" + round(deltaPct*100) + "% vs ton habitude"`, `tone "watch"`.
- Carte 3 (si `insights` non vide) : `share` max → `icon "📊"`, `title = name`, `body = round(share*100) + "% de tes dépenses"`, `tone "ok"`.
- Déduplication par `title` (si la hausse == le dominant, on n'affiche qu'une fois) ; au plus 3.

**Tests** : insights vides → 1 carte (statut) ; une hausse présente → carte 📈 avec bon % ; dominant → carte 📊 ; dédup si même catégorie ; ordre statut/hausse/dominant.

### `txn-filter.ts`
```ts
import type { Txn } from "./types";

// query insensible casse/accents (libellé/description) ; categoryId optionnel (null/"all"/absent = toutes).
export function filterTxns(
  txns: Txn[],
  query: string,
  categoryId?: string | null
): Txn[];
```
- Normalise (`toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")`).
- Filtre catégorie si `categoryId` défini, non `null` et `!== "all"`.
- Filtre libellé si `query` non vide : `normalize(t.description).includes(normalize(query))`.

**Tests** : query "carre" matche "Carrefour" ; accents ; catégorie filtre ; query vide + sans catégorie → liste inchangée ; "all" = pas de filtre catégorie.

### `category-icon.ts`
```ts
export function categoryIcon(name: string): string;
```
- Mapping par mot-clé normalisé : salaire 💼, logement 🏠, course 🛒, restaurant 🍽️, transport 🚗, énergie ⚡, téléphon 📱, assurance 🛡️, santé ⚕️, loisir 🎬, vêtement 👕, banc 🏦, virement 🔄, épargne 🐷, invest/bourse/natixis 📈 ; défaut `💳`.

**Tests** : « Courses alimentaires » → 🛒 ; « Bourse / Natixis » → 📈 ; inconnu → 💳 ; insensible casse/accents.

## Composants

- **`HeroCard({ taux, reste, monthLabel, mood, goal })`** : carte `rounded-[26px]`, fond dégradé selon `mood.tone` (good = vert `#3E7D5A`, ok = or `#E3B23C`, watch = terracotta `#C75B39`), texte clair. Gros `taux %` (`.font-display`), barre de progression (`mood.progress`), note `objectif {round(goal*100)} %`, bloc reste à vivre (`.font-mono-num`), badge `mood.label`.
- **`StatStrip({ metrics, onAllOps })`** : 3 cartes `bg-card` — Revenus (`emerald`), **Dépenses** (`accent`, `<button onClick={onAllOps}>`), Épargne (`ink`). Montants `.font-mono-num`.
- **`InsightsRow({ notes })`** : titre « À noter », bande `overflow-x-auto` de cartes (`icon`, `title`, `body`), couleur d'accent selon `tone`. Rien si `notes` vide.
- **`FixedVariableBar`** (restyle) : mêmes props ; carte `bg-card`, barre fixe (`emerald`) / variable (`gold`) + légende.
- **`CategoryRow({ insight, icon, onClick })`** : tuile `bg-tile` emoji, nom, montant (`.font-mono-num`), chip tendance (`deltaPct` : `+x%` accent, `−x%` emerald, `null` rien), barre de **part** (`share`).
- **`CategoryBreakdown({ insights, onSelect })`** : titre « Par catégorie », mappe `CategoryRow` avec `categoryIcon(name)`. Vide → « Aucune dépense ce mois ».
- **`OpsDrill`** :
  ```ts
  OpsDrill({
    mode: "category" | "all",
    title: string, icon: string,           // titre + tuile (catégorie, ou "Toutes les dépenses")
    txns: Txn[], categories: Category[],
    query: string, onQuery: (q: string) => void,
    chip: string | null, onChip: (id: string | null) => void,  // utilisé en mode "all"
    onSelectTxn: (t: Txn) => void, onBack: () => void,
  })
  ```
  Affiche en-tête (retour, tuile, titre, n opérations · total), champ recherche, chips de catégories (mode `all` uniquement, à partir des catégories présentes), liste d'opérations tappables (libellé, date, montant signé coloré), état vide soigné. **La page fournit `txns` déjà cadré** : en mode `category`, uniquement les opérations de la catégorie ; en mode `all`, toutes les opérations du mois. La liste affichée = `filterTxns(txns, query, mode === "all" ? chip : null)`.

## Intégration `app/cockpit/page.tsx`

- Nouvel état : `drill: null | { kind: "category"; id: string } | { kind: "all" }`, `query: string`, `chip: string | null`.
- `const GOAL = 0.2;` ; `mood = savingsMood(metrics.tauxEpargne, GOAL)` ; `notes = buildNotes(insights, mood)`.
- Vue par défaut : `HeroCard` → `StatStrip` (onAllOps = ouvre `{kind:"all"}`) → `TransferNudge` (inchangé) → `InsightsRow` → `FixedVariableBar` → `CategoryBreakdown` (onSelect = `{kind:"category"}`).
- `OpsDrill` remplace l'ancien bloc drill inline ; `changeMonth` réinitialise `drill/query/chip` ; le tri manuel (`showTransfers`) et `ThemeToggle` restent.
- `editTxn`/`TxnModal` inchangés (sélection d'une opération dans le drill → édition).

## États & erreurs

- Mois sans dépense : `CategoryBreakdown` vide ; `InsightsRow` affiche au moins la carte statut.
- `goal = 0` (sécurité) : `progress = 0`, pas de division par zéro.
- Recherche sans résultat : état vide « Aucune opération ».
- Aucune régression sur le tri des virements ni l'édition.

## Hors périmètre

- Budgets par catégorie (Phase 2).
- Objectif de taux persisté / réglable (Phase 2, `user_settings`).
- Rappels, Objectifs, multi-devises (autres phases).
- Reskin Patrimoine / Projection / Stratégies (sous-phases suivantes de P1).

## Critères de succès

- Le Cockpit s'affiche au look Boussole (hero coloré selon mood, stat strip en cartes, « À noter », fixe/variable, catégories avec tuiles + tendance), en clair et en sombre.
- Tap Dépenses → toutes les opérations avec recherche + chips ; tap une catégorie → ses opérations avec recherche ; tap une opération → édition.
- Aucune perte de fonction (nudge virements, édition, navigation mois).
- `npm run test` vert (incl. `mood`, `cockpit-notes`, `txn-filter`, `category-icon`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
