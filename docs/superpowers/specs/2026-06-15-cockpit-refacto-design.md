# Cockpit — Refacto + Design system (passe 1)

**Date** : 2026-06-15
**Branche** : `cockpit-v2` (depuis `main`)
**Périmètre** : backlog #1 (refacto en composants + couche `lib/cockpit`) **fusionné** avec #2 (design propre Fraunces/Geist + tokens), plus un manifest PWA minimal.

## Contexte

Le cockpit financier perso vit aujourd'hui dans un seul fichier `app/cockpit/page.tsx` :
client Supabase inline, login, dashboard mensuel, modal d'ajout, styles inline dans
un objet `S`, mois hardcodé `"2026-05"`. Le design system de `savings-app`
(Fraunces + Geist + Geist Mono, tokens `paper/ink/ink-muted/rule/emerald` dans
`tailwind.config.ts` et `globals.css`) existe déjà et est utilisé par le simulateur
(`app/page.tsx`) mais **ignoré** par le cockpit.

Cette passe découpe le monolithe en composants **écrits directement avec le design
system** (une seule passe, pas de portage des styles inline), pose une coquille de
navigation multi-vues, et couvre les calculs purs par des tests.

## Décisions validées

- **Scope** : refacto + design fusionnés, en une passe.
- **Couche data** : hooks custom légers (`useState`/`useEffect`), **pas** de React Query.
- **Branche** : `cockpit-v2` depuis `main`. (Note : la branche `cockpit` d'origine a déjà
  été mergée dans `main` via la PR #1 ; on repart de `main`.)
- **Navigation** : coquille multi-vues posée maintenant (Dashboard / Patrimoine / Projection),
  les deux dernières en placeholders.
- **Nav position** : **tab bar fixe en bas** (PWA), FAB + au-dessus à droite.
- **Layout dashboard** : direction **éditoriale (Option B)** — bandeau de tête avec taux
  d'épargne géant + reste à vivre, filet de stats inline, liste de transactions dominante.
- **Métriques héros** : deux chiffres — **taux d'épargne** + **reste à vivre**.
- **Modèle financier** :
  - `revenus = Σ income`, `depenses = Σ |expense|`, `epargne = Σ |savings|`, `transferts = Σ |transfer|`
  - `tauxEpargne = revenus > 0 ? epargne / revenus : 0`
  - `resteAVivre = revenus - depenses`
  - `type=savings` compte dans l'épargne ; `type=transfer` est neutre (affiché à part, n'entre dans aucun héros).
- **Couleur du négatif** : `strat-a` (#B45342, terracotta de la palette) au lieu de `#C62828`.
- **Manifest PWA minimal** : oui dans cette passe (name, theme-color cream, display standalone).
  Icônes/splash iOS → passe #7.
- **Tests** : Vitest (devDep) sur les modules purs (`metrics.ts`, `format.ts`) en TDD.

## Architecture des fichiers

```
lib/cockpit/
  supabase.ts      # client singleton (sorti du inline), typé
  types.ts         # Txn, Category, Account, TxnType
  format.ts        # eur(), todayISO(), currentMonth(), monthRange(month)
  metrics.ts       # pur : computeMetrics(txns) -> { revenus, depenses, epargne,
                   #        transferts, tauxEpargne, resteAVivre }
  hooks.ts         # useAuth, useTransactions(month), useCategories, useAccounts

app/cockpit/
  layout.tsx       # AuthGate + AuthProvider (contexte user) + <TabBar/> + shell
  page.tsx         # vue Dashboard (assemble les composants)
  patrimoine/page.tsx   # placeholder éditorial "bientôt"
  projection/page.tsx   # placeholder éditorial "bientôt"

components/cockpit/
  LoginForm.tsx
  TabBar.tsx       # nav bas, lucide icons, usePathname, safe-area iOS
  MonthSwitcher.tsx
  HeroBand.tsx     # bandeau taux d'épargne + reste à vivre
  StatStrip.tsx    # filet 4 stats inline
  TxnList.tsx
  TxnRow.tsx       # <button> (prêt pour édition #5, sans handler)
  AddModal.tsx     # bottom-sheet restylé (logique d'insert inchangée)
  Fab.tsx

app/manifest.json (ou app/manifest.ts) + meta theme-color/viewport dans app/layout.tsx
```

**Principes**
- `metrics.ts` et `format.ts` purs, testables sans React ni Supabase.
- Tout l'accès données est encapsulé dans `hooks.ts` — aucun `supabase.from(...)` dans un composant.
- Composants présentationnels, reçoivent données + callbacks.
- Un seul client Supabase singleton importé partout.

## Auth & données

**Auth** (`app/cockpit/layout.tsx`, client component) :
1. `supabase.auth.getUser()` + `onAuthStateChange` (logique extraite de l'actuel `page.tsx`).
2. `!ready` → loading ; `!user` → `<LoginForm/>` ; sinon → `{children}` + `<TabBar/>`.
3. expose `user` via `AuthContext` consommé par `useAuth()`.

**Hooks** (custom, légers) :
- `useTransactions(month)` → `{ txns, loading, error, refetch }`, dépendance `[month]`.
- `useCategories()` → `{ categories }` (une fois).
- `useAccounts()` → `{ accounts }` (une fois).
- Les erreurs Supabase sont remontées dans `error` (plus de `?? []` silencieux).

Après un ajout dans `AddModal`, on appelle `refetch()` (remplace le `fetchTxns()` prop-drillé).

## Vue Dashboard (Option B)

De haut en bas :
1. En-tête : `Cockpit` (Fraunces) + `<MonthSwitcher/>` (input month restylé pill mono,
   défaut = mois courant, plus de hardcode).
2. `<HeroBand/>` : taux d'épargne en Fraunces géant (emerald) à gauche, reste à vivre à droite,
   filet `border-ink` dessous. Reçoit `metrics`.
3. `<StatStrip/>` : 4 stats inline séparées par `border-rule` — Revenus (emerald +),
   Dépenses (terracotta −), Épargne, Transferts. Geist Mono tabular-nums.
4. `<TxnList/>` : titre `<Mois> · N transactions`, puis `<TxnRow/>` (desc + `date · catégorie`
   muted + montant mono coloré). Lignes = `<button>` (prêtes #5, sans handler).
5. `<Fab/>` : `+` emerald, fixé bas-droite au-dessus de la tab bar.
6. `<AddModal/>` : bottom-sheet, logique d'insert inchangée, restylé tokens, `refetch()` au save.

États gérés : loading (skeleton léger), liste vide ("Aucune transaction ce mois"),
erreur (message visible).

## Shell & navigation

- `<TabBar/>` : barre fixe en bas, fond paper `border-t border-rule`, 3 items avec icônes
  lucide (`LayoutGrid`, `Landmark`, `TrendingUp`) + label, actif détecté via `usePathname()`,
  safe-area iOS (`env(safe-area-inset-bottom)`).
- Routes : `/cockpit`, `/cockpit/patrimoine`, `/cockpit/projection`. Les deux dernières =
  placeholders éditoriaux (même en-tête/typo, mention "bientôt").

## Hors périmètre (backlog futur)

- #3 Vue Patrimoine réelle (placeholder seulement)
- #4 Import CSV BNP
- #5 Édition/suppression (TxnRow déjà en `<button>`)
- #6 Branchement simulateur (placeholder Projection)
- #7 PWA complète (icônes/splash) — **sauf** manifest minimal + safe-area faits ici

## Tests (TDD, Vitest)

Ajouter Vitest en devDependency + script `test`. Tests d'abord, puis implémentation :

- `metrics.ts` :
  - sommes par type (income/expense/transfer/savings) avec montants signés mixtes
  - `tauxEpargne` = epargne/revenus ; cas `revenus = 0` → 0
  - `resteAVivre` = revenus − depenses
  - `transfer` n'entre ni dans tauxEpargne ni dans resteAVivre
- `format.ts` :
  - `eur()` format fr-FR
  - `monthRange("2026-05")` → `{ start: "2026-05-01", next: "2026-06-01" }`
  - bascule décembre → année suivante
  - `currentMonth()` / `todayISO()` (format, longueur)

Composants : non testés unitairement cette passe ; vérification via `npm run build`.

## Critères de succès

- `app/cockpit/page.tsx` ne contient plus que l'assemblage de la vue Dashboard.
- Aucun style inline `S` ; tout en classes Tailwind + tokens + `font-display`/`font-mono-num`.
- Aucun `supabase.from(...)` hors de `lib/cockpit/hooks.ts`.
- Mois par défaut = mois courant (plus de `"2026-05"`).
- 3 routes navigables via tab bar.
- `npm run build` passe ; `npm run test` vert sur metrics + format.
- App installable (manifest minimal).
