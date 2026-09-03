# Chocs fiscaux et d'abondement — « et si la règle change ? » — spec

**Date** : 2026-09-02
**Contexte** : troisième et dernier chantier « chocs », et la seconde moitié de celui annoncé dans
`2026-09-02-chocs-marche-simulateur-design.md`. Le moteur daté y a été posé pour les chocs de
marché ; celui-ci s'y branche pour les deux chocs restants retenus par l'utilisateur : **changement de
fiscalité** et **abondement supprimé ou réduit**.

## 1. Problème

Le simulateur compare six stratégies PEG/PER/PEA sur dix à quarante ans, et toute leur différence
tient à la fiscalité : quand l'impôt est prélevé, sur quelle assiette, à quel taux. Or ces taux sont
**figés pour toute la durée**.

Sur un horizon de dix ans, une modification du PFU, de la CSG ou du barème d'abondement de l'employeur
est plus probable qu'un krach. Et elle ne frappe pas les six stratégies également : celles qui vivent
de l'abondement s'effondrent s'il disparaît, celles qui capitalisent en PER encaissent le PFU une
seule fois à la sortie. C'est exactement le genre de bascule que le classement existe pour montrer, et
qu'il ne sait pas poser.

## 2. Décisions de l'utilisateur

- **Portée d'un changement fiscal daté** : il s'applique **aux flux dès l'année N**, et la fiscalité
  de sortie utilise **le taux en vigueur à l'horizon**. C'est ce que fait le droit : une CSG relevée
  en 2029 frappe les recyclages de 2029 et suivants, et la plus-value latente est taxée au barème du
  jour de la sortie.
- **Forme du choc fiscal** : un **remplacement daté de n'importe lequel des cinq taux** que le
  simulateur connaît déjà, par sous-ensemble — on ne change que ce qu'on nomme.
- **Forme du choc d'abondement** : un **facteur daté** appliqué au barème — `0` le supprime, `0,5` le
  divise par deux, `1,2` l'améliore. Pas de barème à tranches à ressaisir.

## 3. Le point délicat : trois quantités figées hors de la boucle

Le moteur calcule **une fois pour toutes**, avant sa boucle annuelle :

```ts
const baseAbondPEG = computeAbondement(p.bareme.peg, I, P, V);
const baseAbondPER = computeAbondement(p.bareme.per, I, P, V);
const K_PEG_net = I + P + V + baseAbondPEG * (1 - csgAb);
const K_PER_net = I + P + V + Math.min(baseAbondPER, plafondPER) * (1 - csgAb);
```

Un abondement daté ou une CSG d'entrée datée rendent ces quatre quantités **propres à l'année**. Elles
sont consommées à trois endroits de la boucle : le versement de l'année, le plafond de recyclage
(`plafondPEG − abondPEG_t`) et la CSG sur l'abondement recyclé.

### 3.1 La base du bonus PEA — le piège de ce chantier

À la sortie, le moteur calcule :

```ts
const peaBasisNominal = tmi * volCumul;
const tax_PER_IR = tmi * volCumul;
```

`volCumul` est le cumul des versements volontaires. Multiplier **un** taux par ce cumul suppose que la
TMI n'a jamais bougé. Avec une TMI datée, c'est faux : chaque versement a été déduit **au taux de son
année**, et la base du bonus PEA doit donc s'accumuler année par année, `Σ tmi_t × vol_t`, comme
`peaBonus` accumule déjà les mêmes montants capitalisés.

`tax_PER_IR`, lui, reste un produit — mais **au taux en vigueur à l'horizon** : la sortie est imposée
au barème du jour où l'on sort, pas à celui des versements.

**Conséquence à respecter** : `Σ tmi × vol_t` **n'est pas** bit à bit égal à `tmi × Σ vol_t`. Le
chemin sans choc doit donc conserver l'expression scalaire, exactement comme `growth5yAt` conserve son
scalaire. C'est la même discipline, pour la même raison, et c'est ce qui garantit que les trois
snapshots de caractérisation ne bougent pas.

## 4. Le calcul — module `lib/fiscal-shock.ts` (pur)

```ts
export type FiscalRates = {
  csgPlusValue: number;
  csgAbondement: number;
  tmi: number;
  pfuPER: number;
  csgPEA: number;
};

export type PolicyShock =
  /** À partir de `fromYear`, les taux nommés remplacent les précédents. */
  | { kind: "fiscalite"; fromYear: number; rates: Partial<FiscalRates> }
  /** À partir de `fromYear`, l'abondement calculé est multiplié par `factor`. */
  | { kind: "abondement"; fromYear: number; factor: number };

/** Un jeu de taux par année, index 0..years-1. */
export function ratesByYear(
  base: FiscalRates,
  years: number,
  shocks: PolicyShock[]
): FiscalRates[];

/** Un facteur d'abondement par année, index 0..years-1. */
export function abondementFactors(years: number, shocks: PolicyShock[]): number[];

/** Les taux en vigueur à la sortie : ceux de la dernière année simulée. */
export function exitRates(rates: FiscalRates[], base: FiscalRates): FiscalRates;
```

- **Sans choc**, chaque année porte **exactement** les valeurs de `base` — les mêmes flottants, non
  recalculés — et chaque facteur d'abondement vaut exactement `1`.
- Les chocs sont appliqués **par année croissante**, chacun **remplaçant** ce qui précède à partir de
  son année. Deux chocs fiscaux se composent donc naturellement : le second n'écrase que les taux
  qu'il nomme, ceux du premier survivent au-delà.
- Un facteur d'abondement **remplace** lui aussi, il ne se multiplie pas au précédent : « divisé par
  deux en année 4 » puis « supprimé en année 8 » donne 0,5 puis 0, jamais 0. Chaque facteur se lit par
  rapport au barème d'origine, ce qui rend la liste lisible sans calcul mental.
- Un choc daté **hors de l'horizon** ne fait rien, comme pour les chocs de marché.
- `exitRates` rend les taux de l'année `years − 1`, et `base` quand l'horizon est nul.

## 5. Ce que le simulateur consomme

- `SimulationParams` gagne `policyShocks?: PolicyShock[]`, à côté de `shocks?: MarketShock[]`. Les
  deux familles sont **indépendantes et cumulables** : un krach et une hausse de CSG la même année
  s'appliquent chacun sur son terrain.
- Par année : `abondPEG_t`, `abondPER_t`, `K_PEG_net_t`, `K_PER_net_t`, et les taux `csgAb_t`,
  `csgPV_t`, `tmi_t`.
- À la sortie : `csgPV`, `pfuPER`, `csgPEA` et `tmi` pris dans `exitRates`.
- `peaBasisNominal` devient un accumulateur `Σ tmi_t × vol_t`, **sauf** quand aucun choc ne fait varier
  la TMI, auquel cas l'expression scalaire d'aujourd'hui est conservée telle quelle (§3.1).

### 5.1 Le chemin sans choc reste bit à bit identique — sous condition

Même garantie et même méthode que le chantier précédent : **structurelle**, pas seulement testée. Les
trois snapshots de caractérisation de `lib/simulator.test.ts` doivent passer **inchangés**, et
`vitest --update` reste interdit sur toute la branche.

Cette garantie vaut pour `plafondPEG >= abondement` (l'abondement effectivement calculé, celui du
barème une fois un éventuel facteur de choc appliqué). En dessous, `M_cap_gross =
plafondPEG − abondPEG_t` deviendrait négatif, et le moteur clampe désormais ce plancher à zéro — y
compris **sans aucun choc posé**, dès que le curseur de plafond seul descend sous l'abondement du
barème par défaut. Ce n'est pas une régression du bit-à-bit : c'est la correction délibérée d'un bug
préexistant où un plafond bas faisait « reprendre » de l'argent au salarié sur le recyclage, ce qui
n'a pas de sens économique. Au-dessus du seuil, rien ne change au bit près.

## 6. L'écran

Le panneau « Scénario » existe déjà et porte les chocs de marché. Il gagne les deux nouveaux types
dans le même sélecteur, la même liste et le même bouton de retrait.

- Un choc fiscal se résume en une ligne nommant **les taux modifiés et eux seuls** : « Fiscalité dès
  l'année 5 · PFU 30 → 35 % ».
- Un choc d'abondement se résume par son effet : « Abondement × 0,5 dès l'année 4 », et « Abondement
  supprimé dès l'année 4 » quand le facteur vaut zéro — un facteur nul mérite des mots, pas un
  chiffre.
- Le classement ne change pas de forme : mêmes colonnes choquées, même marqueur de rang. Un choc
  fiscal et un krach produisent la même sorte de réponse, et c'est voulu.
- Le marquage « hors horizon » s'applique aux nouveaux chocs comme aux anciens.

## 7. Hors périmètre

- Toute persistance du scénario, donc toute migration.
- Le graphique de comparaison, le détail par stratégie et les tableaux : inchangés, comme au chantier
  précédent.
- Tout barème d'abondement de remplacement à tranches : le facteur couvre le besoin exprimé.
- Toute progressivité réelle de l'impôt sur le revenu : `tmi` reste un taux marginal unique, comme
  aujourd'hui. Le dater ne le rend pas progressif.
- Les plafonds annuels (`plafondPEG`, `plafondPER`) ne sont pas datables dans ce chantier.

## 8. Tests

- `fiscal-shock.test.ts` : sans choc, chaque année porte exactement les valeurs de base et chaque
  facteur vaut `1`, en égalité **stricte** ; un choc ne remplace que les taux qu'il nomme ; deux chocs
  se composent, le second n'écrasant que les siens ; un facteur d'abondement remplace et ne multiplie
  pas ; un choc hors horizon ne fait rien ; `exitRates` rend bien la dernière année, et `base` sur un
  horizon nul.
- `simulator.test.ts` : les trois snapshots restent **inchangés**. Nouveaux cas : un PFU relevé réduit
  le net des stratégies PER et **laisse le PEG pur inchangé** — c'est le test qui prouve que le choc
  frappe la bonne assiette ; un abondement supprimé en année 0 ramène le versement annuel à
  `I + P + V` exactement, vérifié sur `annual[t].K_PEG` — et non « laisse PER pur inchangée », que
  j'avais écrit à tort : `K_PER_net` capte lui aussi un abondement, donc la stratégie PER pure est
  touchée comme les autres ; une TMI datée change le résultat, et la base du bonus
  PEA n'est plus le produit scalaire — le test qui échouerait si l'accumulateur n'existait pas ; un
  choc fiscal et un krach la même année se cumulent.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 9. Critère de succès

L'utilisateur pose « PFU à 35 % dès l'année 5 » et « abondement divisé par deux dès l'année 4 », et
lit sur le classement laquelle de ses six stratégies encaisse le mieux un changement de règle — et si
l'ordre bascule. Sans choc posé, ses chiffres sont au centime ceux d'aujourd'hui.
