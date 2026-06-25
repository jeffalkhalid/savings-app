# Refonte « Boussole » — Feuille de route globale

**Date** : 2026-06-25
**Source design** : claude.ai/design — projet « Refonte app d'épargne », fichiers `Epargne App.dc.html` (app complète) + `Refonte Cockpit.dc.html` (variante Cockpit).
**But** : adopter le système visuel « Boussole » comme cible et le livrer **par phases shippables**, en réutilisant au maximum le code/les données existants. Pas de big-bang.

> Maquette = peau statique (`{{ … }}` = données bidon). Le travail réel = brancher chaque binding sur les hooks/lib existants, et bâtir le backend des features neuves. Le HTML ne fait que définir l'apparence.

---

## 1. Système de design (cible)

- **Typo** : Fraunces (display/serif, titres + gros chiffres hero) + **DM Sans** (corps). **Décision validée : on garde Geist Mono (`.font-mono-num`) pour les montants** dans les listes/tableaux (alignement tabulaire) ; DM Sans pour le reste.
- **Palette (clair)** : `--bg#E7DDCD --phone#F3EDE3 --card#FBF7F0 --tile#EFE3CF --seg#EBE2D2 --line#E6DDCD --muted#9A8E7C --ink2#6b6155 --ink#2A241C`.
- **Palette (sombre, `.dark`)** : `--bg#14110D --phone#1C1915 --card#262019 --tile#2F2820 --seg#2C261E --line#372F25 --muted#A89B86 --ink2#C7BAA4 --ink#F1EADF`.
- **Accents** : terracotta `#C75B39` (primaire/CTA), vert `#3E7D5A` (revenus/positif), or `#E3B23C` (variable/alerte douce).
- **Formes** : cartes `radius 16–26px`, hero `26px`, tuiles icônes `12–14px` ; ombres chaudes.
- **Mouvement** : `scIn` (entrée écran), `scSheet` (bottom-sheet), `scOverlay`, `scPop` ; respect `prefers-reduced-motion`.
- **Shell** : conteneur pleine hauteur (on **abandonne le cadre téléphone** 404×868 de la maquette — l'app est une PWA plein écran), **bottom nav 5 onglets**, **bottom-sheets** pour les modales.

## 2. Inventaire écrans / feuilles

| Élément maquette | Statut | Code existant à réutiliser |
|---|---|---|
| **Cockpit** (hero taux+reste, stat strip, nudge virements, insights, fixe/variable, catégories+drill+recherche) | reskin | `computeMetrics`, `analyzeCategories`, `fixedVariableSplit`, `pendingTransfers`/`classifyTransfer`, `TxnList`, `TxnModal`, hooks |
| **Patrimoine** (total, répartition, **allocation cible**, actifs, détail/ajout actif) | reskin + neuf | vue `v_patrimoine` / écran patrimoine existant ; *allocation cible = neuf* |
| **Projection** (déterministe + Monte-Carlo, sliders, **profils de risque**) | reskin | simulateur projection (det + MC) existant ; *profils = presets neufs (pure)* |
| **Épargne / stratégies** (PEG/PER/PEA classées, dépli versé/gains/fiscalité, abondement) | reskin logique + écran à bâtir | logique `lib/strategies.ts` + `projection-sim.ts` existante ; *écran dédié « Stratégies » nouveau (aujourd'hui embarqué dans Projection)* |
| **Objectifs** (anneau global, cartes goals, contribuer) | **neuf** | — |
| Sheet **Import** | reskin | `app/cockpit/import` (BNP) |
| Sheet **Tri des virements** | reskin | `TransferTriage` / `TransferNudge` (déjà construit) |
| Sheet **Réglages** (thème, devise reporting, objectif taux) | neuf | — |
| Sheet **Rappels** | **neuf** | — |
| Sheet **Détail / Ajout actif** | reskin + neuf | patrimoine existant |
| Sheet **Détail / Ajout objectif** | **neuf** | — |
| **Login** | conserver | auth Supabase email (on **ne fait pas** Google/Apple pour l'instant — boutons retirés ou désactivés) |

## 3. Dépendances backend (features neuves)

| Feature | Données nécessaires | Module lib (pur, testé) |
|---|---|---|
| **Objectifs** | table `goals` (name, icon, target_amount, deadline?, account_id?) + `goal_contributions` (goal_id, date, amount) **ou** `current_amount` dénormalisé | `goals.ts` (pct, reste, statut, anneau global) |
| **Rappels** | table `reminders` (label, due_date, recurrence?, amount?, kind, done) | `reminders.ts` (dues, tri, compteur badge) |
| **Budgets / catégorie** | colonne `categories.monthly_budget` (ou table `budgets`) | `budgets.ts` (consommé vs budget, couleur d'état, tendance vs M-1 via `v_monthly_by_category`) |
| **Allocation cible** | table `allocation_targets` (asset_type, target_pct) | `allocation.ts` (réel vs cible, delta, position du repère) |
| **Multi-devises** | `user_settings.reporting_ccy` + source FX (`fx_rates` snapshot ou API) ; actifs avec devise native | `fx.ts` (conversion, libellé natif) |
| **Réglages / hero** | `user_settings` (theme, reporting_ccy, **savings_rate_goal**) | `mood.ts` (badge + note hero depuis taux vs objectif) |

RLS : toutes les nouvelles tables suivent le motif `auth.uid() = user_id`. Vues éventuelles en `security_invoker = on`.

## 4. Phases (ordre + livrables)

Chaque phase est **mergeable et testable seule**. Tests purs Vitest sur chaque module lib ; UI vérifiée tsc/build/smoke.

### Phase 0 — Fondation & shell *(aucun backend)*
- Tokens Tailwind → palette chaude (clair + sombre via classe `.dark` sur `<html>`), DM Sans en corps, `.font-mono-num` conservé pour montants.
- Provider **thème** (clair/sombre, persisté localStorage en P0, migré vers `user_settings` en P2).
- Primitives shell : **BottomNav** (5 onglets, routing), **Sheet** (bottom-sheet animée + overlay), **HeroCard**, **StatTile**, **SectionTitle**.
- Aucune logique métier touchée → l'app change de peau immédiatement.
- *Livrable* : app re-thémée + navigation par onglets + dark mode, écrans actuels rendus dans le nouveau cadre.

### Phase 1 — Reskin iso-fonctionnel *(données réelles, zéro nouveau backend)*
- **1a Cockpit** : hero (taux + reste à vivre + mood — objectif taux **par défaut codé en dur** en P1, persisté en P2), stat strip, nudge virements (déjà là), insights, fixe/variable, catégories + drill + recherche/chips. Barres de budget **masquées tant qu'aucun budget** (activées en 2c).
- **1b Patrimoine** : total, répartition, liste actifs, sheets détail/ajout actif. **Mono-devise** (multi-devises en 2e). Bloc « allocation cible » masqué (activé en 2d).
- **1c Projection** : déterministe + Monte-Carlo, sliders, **profils de risque** (presets purs mappés sur taux/volatilité).
- **1d Épargne / stratégies** : cartes classées, dépli versé/gains/fiscalité, abondement.
- *Livrable* : toute l'app actuelle, look « Boussole », sans régression fonctionnelle.

### Phase 2 — Features neuves *(chacune : brainstorm → spec → plan)*
Ordre conseillé par dépendance/valeur :
- **2a Réglages + user_settings** (thème persisté, objectif de taux, devise) — débloque le mood/hero « vrai » et sert de socle.
- **2b Objectifs** (`goals` [+ contributions], écran + sheets, anneau global, lien hero).
- **2c Budgets par catégorie** (colonne budget, barres + état dépassement, tendance).
- **2d Rappels** (`reminders`, badge cloche, sheet, actions).
- **2e Allocation cible** (`allocation_targets`, réel vs cible + repère).
- **2f Multi-devises** (reporting + FX) — la plus lourde, **optionnelle** ; à décider selon besoin réel.

## 5. Hors périmètre / décisions à acter

- **Cadre téléphone** de la maquette (statut « 9:41 », 5G) : non repris.
- **Login Google/Apple** : non repris pour l'instant (email Supabase). Boutons retirés.
- **Libellés optimistes** de la maquette à brancher sur du réel ou retirer : « Synchronisé 22:00 » (pas d'auto-sync), « barème Carrefour » (abondement en dur → paramétrable), conversion FX (2e).
- **Objectif de taux d'épargne** : valeur par défaut en P1, réglable en 2a.
- **Source FX** (2f) : snapshot manuel vs API externe — à trancher si on fait 2f.

## 6. Risques & garde-fous

- **Régression visuelle pendant le reskin** : Phase 1 écran par écran, chacun mergé seul ; smoke test à chaque écran.
- **Dérive de périmètre** : les features neuves (Phase 2) ne démarrent pas avant que la Phase 1 soit verte ; chacune repasse par le cycle brainstorm/spec.
- **Tokens en double** : la Phase 0 remplace les tokens actuels (paper/ink/emerald/strat-a) en une fois ; pas de cohabitation longue.
- **Tabulaire des chiffres** : garder `.font-mono-num` sur tous les montants (validé).

## 7. Critère de succès global

L'app actuelle (Cockpit, Patrimoine, Projection, Stratégies) tourne intégralement sous le design « Boussole » (clair + sombre, bottom nav, sheets) **sans perte de fonction** à l'issue de la Phase 1 ; les features neuves arrivent ensuite une par une, chacune spécifiée et testée. `npm run test` / `tsc` / `build` verts à chaque phase.
