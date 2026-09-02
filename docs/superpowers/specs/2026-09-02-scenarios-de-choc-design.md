# Scénarios de choc — « est-ce que j'encaisse ? » — spec

**Date** : 2026-09-02
**Contexte** : premier des deux chantiers « chocs » retenus avec l'utilisateur. Celui-ci porte sur la
**Projection du Cockpit**, sur ses chiffres réels. Le second, sur le simulateur d'épargne salariale
de la racine, traitera des chocs de marché et de fiscalité et fera l'objet de sa propre spec.

## 1. Problème

La Projection répond à « où j'en serai si tout continue ainsi ». Elle a deux modes : une trajectoire
déterministe, et un Monte-Carlo qui applique une volatilité annuelle.

Ce qu'aucun des deux ne dit : **ce qui se passe si un événement daté frappe**. La volatilité modélise
un aléa permanent et régulier ; elle ne dit rien d'une perte d'emploi de six mois, d'une toiture à
15 000 €, ni d'un loyer qui monte de 250 € et ne redescend jamais. Un −30 % ponctuel au mauvais moment
ne produit d'ailleurs pas le même résultat qu'une volatilité équivalente étalée : la séquence compte.

## 2. Décisions de l'utilisateur

- **Résolution mensuelle**, pour pouvoir donner une date de creux et un délai de rétablissement.
- **Quatre chocs** : perte de revenu sur N mois, dépense exceptionnelle, hausse durable des charges,
  krach de marché.
- **Cumulables** : un scénario est une liste de chocs.
- **Deux courbes et un bilan chiffré** : référence, trajectoire choquée, puis creux / délai / écart.

## 3. La conséquence assumée : la courbe de référence bouge

`projectNetWorth` capitalise **annuellement**, contribution déposée en fin d'année. Pour qu'une perte
de revenu de six mois creuse un trou visible, il faut que quelque chose entre **chaque mois** — sinon
le choc ne se manifeste qu'au dépôt de fin d'année, et la date de creux promise n'existe pas.

Le moteur devient donc mensuel : capitalisation au taux mensuel équivalent, flux déposé chaque mois.
C'est plus fidèle à la réalité — l'utilisateur épargne tous les mois — mais **les chiffres actuels de
la Projection changeront**, d'environ 1 % à la hausse sur dix ans, parce que déposer chaque mois
rapporte davantage que déposer une fois l'an. L'utilisateur a validé ce déplacement en connaissance
de cause.

`projectNetWorth` et ses neuf tests **restent en place** : la fonction devient la référence contre
laquelle le moteur mensuel est épinglé (voir §6), et non plus une dépendance de l'écran.

## 4. Le calcul — module `lib/cockpit/shock.ts`

Module **pur**.

```ts
export type Shock =
  /** Le flux mensuel perd `monthlyIncome × (1 − keepPct)` pendant `months` mois. */
  | { kind: "revenu"; startMonth: number; months: number; keepPct: number }
  /** Retrait ponctuel du capital. */
  | { kind: "depense"; atMonth: number; amount: number }
  /** Le flux mensuel baisse de `monthly` € à partir de `startMonth`, définitivement. */
  | { kind: "charges"; startMonth: number; monthly: number }
  /** Le capital perd `dropPct` d'un coup. */
  | { kind: "krach"; atMonth: number; dropPct: number };

export type MonthPoint = { month: number; value: number };

export function projectMonthly(input: {
  initial: number;
  monthlyFlow: number;
  monthlyIncome: number;
  rate: number;            // annuel
  years: number;
  shocks: Shock[];
}): MonthPoint[];

export type ShockSummary = {
  trough: MonthPoint;
  /** Mois écoulés entre le premier choc et le retour au niveau d'avant lui. */
  recoveryMonths: number | null;
  deltaAtHorizon: number;
};

export function summarise(
  base: MonthPoint[],
  shocked: MonthPoint[],
  firstShockMonth: number | null
): ShockSummary;
```

### 4.1 Le moteur

`month` vaut 0 pour aujourd'hui et va jusqu'à `years × 12`. `value[0] = initial`. Pour chaque mois
suivant, dans cet ordre :

1. le capital est capitalisé au **taux mensuel équivalent** `(1 + rate)^(1/12) − 1` — et non
   `rate / 12`, qui surestimerait le rendement composé ;
2. le **flux du mois** est ajouté : `monthlyFlow`, diminué des chocs actifs (voir §4.2) ;
3. les chocs **ponctuels** datés de ce mois s'appliquent : `depense` retranche son montant,
   `krach` multiplie le capital par `(1 − dropPct)`.

Les **deux** courbes sortent de cette même fonction : la référence est `projectMonthly` avec
`shocks: []`. Il n'existe pas deux moteurs, donc aucun écart entre les courbes ne peut venir de
l'arithmétique — tout écart affiché vient des chocs.

Le capital **peut devenir négatif** et la série le montre telle quelle. C'est délibéré : un scénario
qui épuise l'épargne est précisément l'information recherchée, et l'écrêter à zéro la masquerait.

### 4.2 Comment chaque choc agit sur le flux

- **`revenu`** retranche `monthlyIncome × (1 − keepPct)` du flux, pour les mois
  `[startMonth, startMonth + months)`. C'est bien le revenu perdu qui est soustrait, pas le flux :
  quand le revenu s'arrête, les dépenses continuent, donc le flux devient négatif et le capital se
  vide. C'est ce qui rend le scénario instructif.
- **`charges`** retranche `monthly` du flux à partir de `startMonth`, **sans fin**.
- Les chocs se **cumulent additivement** sur le flux d'un mois donné : deux chocs actifs en même mois
  retranchent chacun leur part.

`monthlyIncome` vient d'une nouvelle fonction de `lib/cockpit/projection.ts` mesurant le revenu
mensuel moyen sur l'historique. Elle est indépendante du flux net que l'utilisateur peut avoir
ajusté à la main : perdre son salaire retranche le salaire mesuré, quel que soit le flux affiché.

### 4.3 Le bilan

- **`trough`** : le mois de valeur minimale de la trajectoire choquée, et cette valeur.
- **`recoveryMonths`** : soit `L` la valeur de la trajectoire choquée au mois précédant le premier
  choc. Le délai est le nombre de mois entre le premier choc et le premier mois ultérieur où la
  trajectoire repasse au-dessus de `L`. Deux cas particuliers, tous deux à afficher franchement :
  - si la trajectoire ne redescend jamais sous `L` (une hausse de charges ne fait que ralentir la
    croissance), le délai vaut **0** ;
  - si elle n'y revient pas avant l'horizon, il vaut **`null`** — et l'écran dit « pas de retour au
    niveau d'avant sur l'horizon », ce qui est une réponse, pas une absence de réponse.
- **`deltaAtHorizon`** : `shocked[N] − base[N]`, donc négatif dans le cas normal.

Quand `firstShockMonth` vaut `null` — aucun choc posé — le bilan n'a rien à dire : l'écran ne
l'affiche pas du tout. `summarise` reste appelable et rend alors un délai de **0** et un écart de
**0**, plutôt que d'obliger l'appelant à un cas particulier.

## 5. L'écran

Tout se passe dans la Projection existante, en mode déterministe.

- Sous les commandes actuelles, une section **« Scénario »** : la liste des chocs posés, chacun
  résumé en une ligne avec sa date et son ampleur, et un bouton pour le retirer. Un bouton
  **« Ajouter un choc »** ouvre une feuille où l'on choisit le type puis ses deux ou trois
  paramètres.
- Le graphique porte **deux courbes** : la référence en trait plein, la trajectoire choquée en trait
  distinct. Sans chocs, il n'y en a qu'une — l'écran d'aujourd'hui, inchangé.
- Sous le graphique, le **bilan** : creux et sa date, délai de rétablissement, écart à l'horizon.
- Les dates sont exprimées en **mois calendaires** (« août 2027 »), pas en numéro de mois.

**Le scénario n'est pas persisté.** C'est une exploration, pas un réglage : le persister demanderait
une migration pour un gain nul. Il disparaît en quittant l'écran, et l'écran le dit dans la section.

**Le mode Monte-Carlo est hors périmètre** et reste annuel. Incohérence assumée : le déterministe
devient mensuel et le Monte-Carlo garde son pas annuel, donc les deux modes divergeront légèrement
davantage qu'aujourd'hui. Ils sont dans deux onglets distincts, jamais côte à côte, et ils n'étaient
déjà pas identiques. Aligner le Monte-Carlo est un chantier à part, à faire si l'écart gêne.

## 6. Tests

- `shock.test.ts` :
  - **caractérisation** : sans aucun choc et avec `monthlyFlow = 0`, la série mensuelle vaut
    exactement `projectNetWorth` à chaque anniversaire — la capitalisation pure est la même dans les
    deux moteurs. C'est ce test qui garantit que le passage au mensuel n'a pas changé la loi de
    capitalisation, seulement le calendrier des dépôts ;
  - avec `monthlyFlow > 0` et sans choc, la série mensuelle est **supérieure** à `projectNetWorth`
    aux anniversaires, et l'écart croît avec l'horizon — le déplacement documenté au §3, épinglé
    plutôt que subi ;
  - `revenu` : le flux devient négatif quand `keepPct = 0` et que les dépenses dépassent le revenu ;
    la fenêtre est bien `[start, start + months)`, bornes vérifiées au mois près ;
  - `depense` et `krach` : effet au mois exact, et rien avant ni après ;
  - `charges` : effet permanent, jamais résorbé ;
  - cumul : deux chocs actifs le même mois retranchent chacun leur part ;
  - le capital devient négatif et n'est pas écrêté ;
  - `summarise` : creux et sa date ; délai de rétablissement ; le cas « jamais descendu » (0) ; le cas
    « pas de retour avant l'horizon » (`null`) ; l'écart à l'horizon.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 7. Hors périmètre

- Le second chantier : chocs de marché et de fiscalité sur le simulateur d'épargne salariale.
- L'alignement du Monte-Carlo sur le pas mensuel.
- Toute persistance du scénario, donc toute migration.
- Toute suggestion automatique de scénario (« votre épargne de précaution couvre 4 mois ») : l'écran
  répond à la question qu'on lui pose, il n'en pose pas.
- Toute prise en compte de la fiscalité ou d'indemnités de chômage : `keepPct` est le levier prévu
  pour approximer une indemnité, et il est assumé comme une approximation.

## 8. Critère de succès

L'utilisateur pose « perte de revenu, 6 mois, dans un an » et « toiture, 15 000 €, dans deux ans »,
et lit sur un seul écran : le creux et sa date, le temps qu'il lui faut pour revenir au niveau
d'avant, et ce que l'épisode lui coûte à dix ans. S'il n'y revient jamais, l'écran le dit.
