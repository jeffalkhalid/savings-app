# Dérive des abonnements — « qu'est-ce qui a augmenté sans que je le voie ? » — spec

**Date** : 2026-09-02
**Contexte** : quatrième et dernière des pistes d'analyse retenues avec l'utilisateur, après
l'analyse par commerçant, l'évolution dans le temps et la tenue du mois en cours. Elle avait été
gardée pour la fin parce qu'elle suppose des engagements correctement appariés ; la conception
ci-dessous lève en partie cette dépendance.

## 1. Problème

`matchMonth` calcule déjà un `driftPct`, mais il compare **le mois en cours à un montant que
l'utilisateur a saisi à la main**, pour les seuls engagements qu'il a confirmés. Cela répond à
« ce prélèvement est-il conforme ce mois-ci », pas à « qu'est-ce qui a augmenté sans que je le
voie ».

Trois manques, cumulés :

- **Le seuil est aveugle à la lenteur.** Une hausse de 3 % par trimestre n'atteint jamais les 15 %
  qui déclenchent le statut « en hausse ». C'est précisément la forme que prend une dérive qu'on ne
  voit pas.
- **Le référentiel est un chiffre saisi une fois.** Il ne bouge que si l'utilisateur le rouvre, donc
  il vieillit exactement au rythme de son inattention.
- **La couverture s'arrête aux engagements confirmés.** Les récurrences repérées mais non confirmées
  — la zone d'ombre — ne sont comparées à rien.

## 2. Décisions de l'utilisateur

- **Périmètre** : deux sections — les engagements confirmés d'abord, les récurrences détectées non
  confirmées en second rideau.
- **Méthode** : **régression linéaire** sur les totaux mensuels, retenue en connaissance de la
  réserve exprimée pendant la conception (voir §3.1).
- **Seuils** : qualité de l'ajustement **et** impact annuel, cumulés.
- **Emplacement** : sous-page `/cockpit/derive`.
- **Actions** : ouvrir la fiche commerçant, recaler le montant attendu d'un engagement, confirmer une
  récurrence détectée en engagement.

## 3. Le calcul — module `lib/cockpit/drift.ts`

Module **pur**.

```ts
export type DriftPoint = { month: string; total: number };

export type Drift = {
  key: string;            // clé commerçant
  label: string;          // libellé le plus fréquent du groupe
  monthsSeen: number;
  slope: number;          // € par mois
  r2: number;             // 0..1
  annualImpact: number;   // slope × 12
  recent: number;         // médiane des 3 derniers mois observés
  series: DriftPoint[];
};

export const MIN_MONTHS = 5;
export const MIN_R2 = 0.5;
export const MIN_ANNUAL = 20;

export function merchantDrifts(txns: Txn[], today: string): Drift[];
```

Quatre décisions qui ne sont pas neutres :

**L'axe des x est le mois calendaire, pas le rang du point.** Un abonnement vu en janvier, février,
puis juillet n'a pas trois mois d'historique : il en a sept, avec quatre trous. Prendre le rang
écraserait les trous et donnerait une pente fausse. `x` vaut donc le nombre de mois écoulés depuis le
premier mois observé du commerçant.

**Le mois en cours est exclu.** Il est partiel : un abonnement pas encore prélevé le 2 du mois vaut
0, ce qui fabriquerait une chute spectaculaire et fausse. C'est la même correction que celle déjà
appliquée aux courbes d'Évolution.

**Seules les dépenses comptent** (`type === "expense"`), en valeur absolue, agrégées par mois et par
clé commerçant — la même clé que partout ailleurs dans l'app (`merchantKey`).

**Seules les hausses sont listées.** Une baisse n'est pas « ce qui a augmenté sans que je le voie »,
et mélanger les deux dilue la réponse que l'écran existe pour donner.

### 3.1 Pourquoi la régression, et à quelle condition

La méthode retenue par l'utilisateur est la droite des moindres carrés. La réserve exprimée pendant
la conception tient : **la plupart des abonnements augmentent par paliers**, et une droite ajustée
sur un palier donne une pente qui ne correspond à aucun mois réel — 0,29 €/mois là où le prix a en
fait sauté de 2 € en juin.

Ce qui rend le choix exploitable est le **R²**, et c'est à ce titre qu'il est obligatoire, non
décoratif : sur un poste variable (courses, essence), la pente sera grande et le R² proche de zéro —
la droite ne décrit rien. Sur un palier propre, le R² reste élevé et la pente, même si elle lisse la
marche, classe correctement l'abonnement parmi ceux qui ont monté.

Conséquence assumée à connaître : la pente affichée est une **moyenne de dérive**, pas le montant de
la dernière hausse. C'est pourquoi la carte affiche aussi `recent`.

### 3.2 Les trois garde-fous

Une dérive n'est retenue que si les trois conditions tiennent ensemble :

| Condition | Valeur | Raison |
|---|---|---|
| `monthsSeen >= MIN_MONTHS` | 5 | En dessous, une droite passe par n'importe quoi. |
| `r2 > MIN_R2` | 0,5 | La droite doit décrire les points, sinon c'est du bruit. |
| `annualImpact >= MIN_ANNUAL` | 20 € | En dessous, la ligne n'appelle aucune action. |

Cas dégénérés à traiter explicitement : un commerçant dont tous les mois portent le même montant a
une variance nulle — `r2` vaut alors **0** par convention (sa pente est nulle, il est de toute façon
écarté par le seuil d'impact) plutôt que `NaN`. Un commerçant dont toutes les observations tombent
dans le même mois a une variance en `x` nulle : il est écarté, aucune pente n'est calculable.

### 3.3 `recent`

Médiane des trois derniers mois observés — **pas** la valeur ajustée par la droite. C'est le montant
proposé par les actions « recaler » et « suivre », et un montant attendu doit être un nombre qui
s'est réellement produit, pas une sortie de modèle. Il est écrit **tel quel, centimes compris, sans
arrondi** : `expected_amount` est une colonne `numeric`, et tous ses autres producteurs — la
confirmation manuelle dans `EngagementsModal`, dont le champ de saisie accepte des décimales —
stockent déjà ce qui s'est réellement produit, jamais un chiffre rond.

## 4. L'écran `/cockpit/derive`

En-tête sur le motif de `/cockpit/commercants` et `/cockpit/evolution` : lien « ‹ Cockpit », titre,
une ligne de contexte.

### 4.1 Section « Engagements suivis »

Les dérives dont la clé correspond à un `recurring_charges` actif. Chaque ligne porte :

- le libellé de l'engagement ;
- **`+X,XX € par mois`**, en `.font-mono-num` ;
- **`→ Y € sur un an`**, l'impact annuel, qui est ce qui décide d'agir ou non ;
- en discret, `N mois observés` et la qualité de l'ajustement ;
- les barres mensuelles (`MerchantSeriesBars`, déjà au projet) ;
- deux actions : **Fiche** et **Recaler à Z €**, Z étant `recent` tel quel, centimes compris et sans
  arrondi (voir §3.3).

### 4.2 Section « Récurrences non suivies »

Mêmes lignes, pour les commerçants que `detectRecurring` repère et qui ne sont dans aucun engagement
confirmé. Actions : **Fiche** et **Suivre** — qui crée l'engagement avec `recent` comme montant
attendu, exactement ce que fait déjà le panneau « Détectés ».

Cette section est ce qui lève la dépendance à la curation : les hausses qu'on n'a pas vues sont
précisément sur ce qu'on n'a pas pris le temps de confirmer.

**Limite connue.** `detectRecurring` ne regarde que les six derniers mois : un commerçant dont la
dérive franchit les trois seuils de §3.2 mais qu'il ne voit pas dans cette fenêtre — une charge
trimestrielle, un abonnement arrêté il y a quatre mois — n'apparaît dans **aucune** des deux
sections, sans qu'aucun message ne le signale. C'est un trou assumé de cette conception, pas un
défaut de l'implémentation : le combler demanderait une détection de récurrence propre à cet écran,
hors périmètre ici.

### 4.3 La fiche commerçant

L'action « Fiche » ouvre, **sur la même page**, la fiche déjà composée dans l'écran Commerçants :
`MerchantSeriesBars` + `OpsDrill` (recherche, sélection multiple, reclassement, suppression). Elle
est aujourd'hui écrite en ligne dans `app/cockpit/commercants/page.tsx` ; ce chantier l'extrait dans
un composant partagé plutôt que de la dupliquer. C'est une amélioration ciblée du code qu'on touche,
pas un refactoring opportuniste : la dupliquer garantirait que les deux copies divergent.

### 4.4 États vides

Chaque section a le sien, et il dit **pourquoi** c'est vide — « aucun abonnement n'a 5 mois
d'historique et 20 € d'écart annuel » — plutôt qu'un « rien à signaler » qui se lit comme une panne.

## 5. Accès

Un lien **« Dérive »** dans l'en-tête de la section « Par catégorie » du Cockpit, à côté de
« Commerçants », « Évolution » et « Budgets ». La barre de navigation reste à cinq onglets.

## 6. Ce que l'utilisateur verra

L'écran raisonne par **commerçant**, pas par catégorie : les lignes encore en « Autres » ne le
dégradent pas, contrairement à la vue par catégorie d'Évolution. Il est exploitable immédiatement.

Sur 13 mois d'historique et avec le seuil de 5 mois, seuls les commerçants réguliers apparaîtront —
ce qui est l'intention.

## 7. Hors périmètre

- Aucune alerte, aucune notification : l'écran informe quand on le consulte.
- Aucun réglage des seuils : 5 mois, 0,5 et 20 € sont des choix de conception. En faire des options
  obligerait à justifier chaque valeur à l'utilisateur pour un gain nul.
- Aucune détection de baisse, ni de résiliation à suggérer.
- Aucune nouvelle table, vue ou colonne Postgres, aucune migration.
- `matchMonth` et son `driftPct` mensuel ne changent pas : ils répondent à une autre question, dans
  la modale des engagements.

## 8. Tests

- `drift.test.ts` : pente et R² sur une série strictement croissante ; pente nulle sur une série
  plate ; R² faible sur une série bruitée ; les seuils de mois et d'impact testés au bord (retenu d'un côté, écarté de
  l'autre) et le seuil de R² encadré par un cas franchement bruité et un cas franchement régulier —
  fabriquer une série dont le R² vaut exactement 0,5 n'apprendrait rien de plus ; le mois en cours
  exclu ; l'axe en mois calendaires vérifié par un cas avec un mois manquant, dont le résultat diffère
  de celui qu'un axe en rang donnerait ; `recent` égal à la médiane des trois derniers mois observés ;
  variance nulle et mois unique ne produisant ni `NaN` ni exception ; classement par impact annuel
  décroissant.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 9. Critère de succès

L'utilisateur ouvre « Dérive » et voit, en haut, les abonnements qu'il suit dont le prix a monté,
avec ce que cela lui coûte sur un an et un bouton pour recaler le montant attendu ; en dessous, les
récurrences qu'il ne suit pas encore et qui ont monté aussi, avec un bouton pour se mettre à les
suivre. Ce qu'il ne voit pas : ses courses, son essence, et tout ce dont la variation n'est que du
bruit.
