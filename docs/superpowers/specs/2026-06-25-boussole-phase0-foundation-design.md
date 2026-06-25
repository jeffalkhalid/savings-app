# Boussole Phase 0 — Fondation design & mode sombre

**Date** : 2026-06-25
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : re-thématiser l'app vers le système « Boussole » (palette chaude + variables CSS), ajouter le **mode sombre** (suit le système + bouton mémorisé), passer le corps en **DM Sans** (Geist Mono gardé pour les montants), et restyler le **TabBar**. Aucun backend, aucune logique métier touchée.

## Contexte

La navigation est **déjà** route + `TabBar` (bas) dans `app/cockpit/layout.tsx` (qui gère aussi auth/seed/`AuthContext`). La Phase 0 ne réinvente pas le shell : elle change la peau. Les tokens vivent dans `tailwind.config.ts` (couleurs/polices) et `app/globals.css` (variables + `.font-display`/`.font-mono-num`). Le corps est en Geist ; pas de mode sombre aujourd'hui.

## Décisions validées

- **Tokens en variables CSS** : valeurs claires dans `:root`, sombres dans `.dark` ; Tailwind référence ces variables → le sombre bascule via la classe `.dark` sur `<html>`.
- **Noms de classes conservés, valeurs repointées** : les écrans existants prennent le nouveau look sans modifier leurs `className`. On ajoute les tokens manquants (`card`, `tile`, `seg`, `ink2`, `accent`, `gold`).
- **Mode sombre** : suit la préférence système au premier lancement ; bouton dans l'en-tête Cockpit pour forcer clair/sombre ; choix mémorisé (`localStorage`). Réglage complet → écran Réglages (Phase 2).
- **Polices** : corps **DM Sans**, titres **Fraunces** (`.font-display`), montants **Geist Mono** (`.font-mono-num`, inchangé).
- **Primitive Sheet reportée en Phase 1** (construite au premier consommateur — YAGNI).
- **TabBar** : 3 onglets actuels conservés (Cockpit/Patrimoine/Projection) ; Épargne/Objectifs ajoutés quand leurs écrans existeront.

## Palette (tokens)

Variables CSS (clair → sombre) :

| Variable | Clair | Sombre |
|---|---|---|
| `--bg` | `#E7DDCD` | `#14110D` |
| `--phone` (surface app) | `#F3EDE3` | `#1C1915` |
| `--card` | `#FBF7F0` | `#262019` |
| `--tile` | `#EFE3CF` | `#2F2820` |
| `--seg` | `#EBE2D2` | `#2C261E` |
| `--line` | `#E6DDCD` | `#372F25` |
| `--muted` | `#9A8E7C` | `#A89B86` |
| `--ink2` | `#6b6155` | `#C7BAA4` |
| `--ink` | `#2A241C` | `#F1EADF` |

Accents constants (identiques clair/sombre) : `accent`/terracotta `#C75B39`, `emerald`/positif `#3E7D5A`, `gold` `#E3B23C`.

Mapping Tailwind (`tailwind.config.ts`) :

```ts
darkMode: "class",
colors: {
  paper: "var(--phone)",
  card: "var(--card)",
  tile: "var(--tile)",
  seg: "var(--seg)",
  rule: "var(--line)",
  ink: "var(--ink)",
  ink2: "var(--ink2)",
  "ink-muted": "var(--muted)",
  emerald: "#3E7D5A",
  accent: "#C75B39",
  "strat-a": "#C75B39",
  gold: "#E3B23C",
  "strat-b": "#4A6FA5",
  "strat-c": "#836FB2",
  "strat-d": "#4F8B82",
  "strat-e": "#B89968",
  "strat-f": "#2D7A4F",
},
fontFamily: {
  serif: ["Fraunces", "Georgia", "serif"],
  sans: ["DM Sans", "system-ui", "sans-serif"],
  mono: ["Geist Mono", "ui-monospace", "monospace"],
},
```

Note : `bg` n'a pas de classe Tailwind dédiée (le cadre téléphone de la maquette n'est pas repris) ; la variable `--bg` est définie pour usage ponctuel éventuel mais la surface de l'app est `paper` = `--phone`.

## Module pur (testé) — `lib/cockpit/theme.ts`

```ts
export type Theme = "light" | "dark";

// Préférence effective au démarrage : stockée si présente, sinon préférence système.
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean
): Theme;

// Bascule.
export function nextTheme(current: Theme): Theme;
```

- `resolveInitialTheme` : `stored === "dark"` → `"dark"` ; `stored === "light"` → `"light"` ; sinon `prefersDark ? "dark" : "light"`.
- `nextTheme` : `"light" ↔ "dark"`.

**Tests** : stored "dark"/"light" l'emportent sur le système ; stored `null`/inconnu → suit `prefersDark` (true→dark, false→light) ; `nextTheme` inverse.

## Composants

- **`ThemeProvider`** (`components/cockpit/ThemeProvider.tsx`, client) : état `theme` initialisé via `resolveInitialTheme(localStorage.getItem("theme"), matchMedia("(prefers-color-scheme: dark)").matches)` ; `useEffect` applique/retire `.dark` sur `document.documentElement` et écrit `localStorage`. Contexte `useTheme(): { theme, toggle }` où `toggle = () => setTheme(nextTheme)`.
- **`ThemeToggle`** (`components/cockpit/ThemeToggle.tsx`, client) : bouton icône (lucide `Sun`/`Moon`) appelant `toggle()`, style cohérent en-tête (rond, bord `rule`, fond `card`). Placé dans l'en-tête du Cockpit, à côté d'Import/Déco.
- **Anti-flash** : script inline dans le `<head>` de `app/layout.tsx` qui, avant le rendu, lit `localStorage('theme')` (sinon `prefers-color-scheme`) et ajoute `.dark` à `document.documentElement`. Réplique la logique de `resolveInitialTheme` en JS minimal (inline, sans import).

## Fichiers

```
Modif :
  tailwind.config.ts        # darkMode:"class", couleurs via var(), DM Sans
  app/globals.css           # @import + DM Sans ; :root/.dark variables ; body bg/color via var
  app/layout.tsx            # script anti-flash dans <head> ; themeColor
  app/cockpit/layout.tsx    # enveloppe le shell dans <ThemeProvider>
  components/cockpit/TabBar.tsx   # restyle (fond card, actif accent, arrondi)
  app/cockpit/page.tsx      # ThemeToggle dans l'en-tête
Nouveau :
  lib/cockpit/theme.ts            # + theme.test.ts
  components/cockpit/ThemeProvider.tsx
  components/cockpit/ThemeToggle.tsx
```

## globals.css (structure)

- `@import` Google Fonts : ajouter `DM Sans` (poids 400;500;600;700) à l'URL existante (garder Fraunces, Geist Mono ; Geist corps devient inutile mais sans risque s'il reste).
- `:root { --bg; --phone; --card; --tile; --seg; --line; --muted; --ink2; --ink; }` (valeurs claires) et `.dark { … }` (valeurs sombres).
- `html, body { background: var(--phone); color: var(--ink); font-family: "DM Sans", system-ui, sans-serif; }` + transition douce `background-color .3s`.
- `.font-display` (Fraunces) et `.font-mono-num` (Geist Mono) inchangés.

## États & erreurs

- `localStorage` indisponible (mode privé) : `ThemeProvider` et le script anti-flash encapsulent l'accès dans `try/catch` → repli sur la préférence système, sans crash.
- Aucun flash clair→sombre au chargement grâce au script `<head>`.
- SSR : le script s'exécute côté client avant hydratation ; le `ThemeProvider` ne lit `window`/`document` que dans `useEffect`/à l'init client (pas au rendu serveur).

## Hors périmètre

- Refonte des mises en page d'écran (Phase 1).
- Primitive Sheet, primitives Hero/StatTile (Phase 1, au premier usage).
- Onglets Épargne/Objectifs (écrans en P1/P2).
- Réglage de thème persisté côté compte (`user_settings`) — Phase 2 ; P0 mémorise en `localStorage`.

## Critères de succès

- L'app entière (Cockpit, Patrimoine, Projection, modales) s'affiche dans la palette chaude, corps en DM Sans, montants toujours alignés en Geist Mono.
- Bascule clair↔sombre instantanée via le bouton ; choix conservé après rechargement ; premier lancement = préférence système ; pas de flash au chargement.
- TabBar au nouveau look, 3 onglets fonctionnels.
- `npm run test` vert (incl. `theme.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
