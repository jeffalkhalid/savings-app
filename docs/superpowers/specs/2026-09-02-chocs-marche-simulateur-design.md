# Chocs de marché sur le simulateur — « quelle stratégie résiste ? » — spec

**Date** : 2026-09-02
**Contexte** : second des deux chantiers « chocs ». Le premier, livré, porte sur la Projection du
Cockpit et ses événements de vie. Celui-ci porte sur le **simulateur d'épargne salariale** de la
racine, qui compare six stratégies PEG/PER/PEA.

**Séquencement assumé.** L'utilisateur a retenu quatre chocs : krach daté, rendement dégradé,
changement de fiscalité, abondement supprimé ou réduit. Cette spec couvre les **deux premiers** —
ils partagent un seul mécanisme, le facteur de croissance par année — et la comparaison sur le
classement. Les deux autres feront l'objet d'une seconde spec : ils se **branchent** sur le moteur
daté livré ici plutôt que de le refaire. Rien n'est abandonné, tout est ordonné.

## 1. Problème

Le simulateur compare six stratégies sur un rendement **constant**. Il répond donc à « laquelle est
la meilleure si tout se passe bien », et c'est la seule question qu'il sait poser.

Or ces stratégies ne diffèrent pas seulement par leur rendement espéré : elles diffèrent par
**quand** l'argent est investi et par ce qu'elles recyclent. Un krach ne les frappe donc pas
également, et rien dans l'écran ne permet de le voir. La stratégie qui gagne dans le scénario central
n'est pas nécessairement celle qui résiste — et c'est précisément l'information qui manque pour
choisir.

## 2. Décisions de l'utilisateur

- **Deux chocs ici** : un krach daté (−X % sur les encours en année N) et une période de rendement
  dégradé (M années à un rendement plus faible à partir de l'année N).
- **Comparaison référence / choqué sur le classement** : le classement des six stratégies reste
  l'écran principal, chaque ligne portant son résultat choqué, son écart, et un marqueur quand elle
  change de rang. Un choc qui ne change pas le classement est une réponse tout aussi utile.

## 3. La contrainte décisive : le facteur de croissance des cohortes

Le moteur applique `rate` année par année (`P_peg * (1 + rate)`), ce qui rend un krach daté simple à
appliquer aux encours.

Mais il calcule aussi, **une fois pour toutes hors de la boucle** :

- `growth5y = (1 + rate) ** 5` — combien vaut une cohorte cinq ans après son dépôt ;
- `gainFrac5y = 1 − 1 / growth5y` — la part de plus-value dans cette cohorte, qui détermine la CSG
  prélevée au recyclage ;
- et `basisWithdrawn = W / growth5y` pour la base fiscale.

Avec un krach en année 3, une cohorte déposée en année 0 et recyclée en année 5 n'a pas crû de
`(1 + rate)^5` : elle a subi le **produit des facteurs réels**. Ces trois quantités deviennent donc
**propres à l'année de recyclage**, et c'est le vrai coût de ce chantier : il touche l'arithmétique du
recyclage, cœur des six stratégies.

### 3.1 Le chemin sans choc reste bit à bit identique

Sans choc, `growth5yAt(t)` rend le `growth5y` scalaire d'aujourd'hui, **pas** un produit de cinq
facteurs. Le produit donnerait un résultat différent des derniers bits, sans aucune raison.

Contrôle de la vérification : les snapshots de caractérisation de `lib/simulator.test.ts` arrondissent
au centime, donc ils ne verraient pas cet écart — ils ne suffisent pas à garantir l'identité. C'est
pourquoi la garantie est **structurelle** (le même scalaire est réutilisé) et non seulement testée.

Une seule branche, dans un seul point du code. Surtout pas deux boucles parallèles : deux chemins
finiraient par diverger.

## 4. Le calcul

### 4.1 Module `lib/market-shock.ts` (pur)

```ts
export type MarketShock =
  /** Les encours perdent `dropPct` à la fin de l'année `atYear`. */
  | { kind: "krach"; atYear: number; dropPct: number }
  /** Le rendement vaut `rate` pendant `years` ans à partir de `startYear`. */
  | { kind: "rendement"; startYear: number; years: number; rate: number };

/** Facteur de croissance appliqué à chaque année, index 0..years-1. */
export function yearFactors(input: {
  rate: number;
  years: number;
  shocks: MarketShock[];
}): number[];
```

- Sans choc, chaque facteur vaut **exactement** la valeur `1 + rate`, à l'identique.
- Un choc `rendement` **remplace** le rendement de base sur sa fenêtre — il ne s'y ajoute pas :
  « deux années à 0 % » veut dire 0 %, pas « rendement moins zéro ».
- Un choc `krach` **multiplie** le facteur de son année par `(1 − dropPct)`. Il se combine donc avec
  une fenêtre de rendement dégradé, et deux krachs la même année se multiplient l'un l'autre.
- Ces deux règles sont différentes à dessein : un rendement est un régime, un krach est un événement.

### 4.2 Ce que le simulateur consomme

`SimulationParams` gagne un champ optionnel `shocks?: MarketShock[]`. Dans `simulate` :

- `P_peg`, `P_per` et `peaBonus` capitalisent avec `factors[t]` au lieu de `(1 + rate)` ;
- `growth5yAt(t)` rend le scalaire actuel quand `shocks` est vide, sinon le produit des facteurs des
  cinq années précédant `t` ; `gainFrac5yAt(t)` en découle ;
- les trois usages de `growth5y` — valorisation de la cohorte mûre, CSG sur la plus-value, base
  fiscale retirée — passent par ces fonctions.

Aucune autre partie de la fiscalité ne bouge : c'est le sujet de la seconde spec.

## 5. L'écran

Le simulateur de la racine, sans nouvel onglet.

- **Dans le panneau de paramètres**, une section **« Scénario »** : la liste des chocs, chacun
  résumé en une ligne avec un bouton pour le retirer, et un bouton d'ajout ouvrant un petit
  formulaire (type, année, ampleur). Le scénario **n'est pas persisté** — c'est une exploration, et
  le panneau le dit.
- **Le classement** garde son ordre de référence et gagne, par ligne : le résultat choqué, l'écart en
  euros, et un marqueur de changement de rang (« 3ᵉ → 2ᵉ ») quand le classement choqué diffère.
- **Sans choc, l'écran est exactement celui d'aujourd'hui** : ni colonne vide, ni marqueur, ni
  section dépliée.
- Le graphique de comparaison et les tableaux **ne changent pas** dans ce chantier. Les y étendre
  serait un troisième travail, et le classement porte déjà la réponse.

## 6. Hors périmètre

- Les chocs fiscaux et l'abondement daté : seconde spec, sur ce moteur.
- Toute persistance du scénario, donc toute migration.
- Le graphique de comparaison, le détail par stratégie et les tableaux de données.
- Toute notion de probabilité : ce simulateur est déterministe et le reste. « Combien de chances
  qu'un krach survienne » n'est pas une question à laquelle il prétend répondre.

## 7. Tests

- `market-shock.test.ts` : sans choc, tous les facteurs valent `1 + rate` et sont **strictement
  égaux** entre eux ; un krach multiplie la seule année visée ; une fenêtre de rendement remplace le
  taux sur ses bornes exactes, vérifiées au bord ; un krach dans une fenêtre dégradée se combine ;
  deux krachs la même année se multiplient ; un choc daté hors de l'horizon ne fait rien.
- `simulator.test.ts` : les trois snapshots existants restent **inchangés** — ils sont la garantie
  que le chemin sans choc n'a pas bougé, et aucun ne doit être régénéré.
- Nouveaux cas sur `simulate` : un krach réduit le net de **chaque** stratégie ; le même krach en
  année 0 et en année 9 ne produit pas le même écart ; un krach entre le dépôt d'une cohorte et son
  recyclage réduit le montant recyclé — c'est le test qui prouve que le facteur est bien devenu
  propre à la cohorte, et il échouerait si `growth5y` était resté scalaire.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 8. Critère de succès

L'utilisateur pose « krach de 30 % en année 3 », et lit sur le classement lequel de ses six
scénarios encaisse le mieux — et si l'ordre change. Sans choc posé, l'écran et les chiffres sont
au centime ceux d'aujourd'hui.
