# Tenue du mois en cours — « Est-ce que je tiens jusqu'à la fin du mois ? » — spec

**Date** : 2026-09-01
**Contexte** : dernière des quatre pistes d'analyse retenues avec l'utilisateur, après l'analyse par
commerçant et l'évolution dans le temps. Reste ensuite la dérive des abonnements, mise de côté
parce qu'elle suppose des engagements correctement appariés.

## 1. Problème

Le Cockpit affiche un **reste à vivre** : le net signé de tous les flux du mois. Ce chiffre est
juste, mais il répond à « qu'est-ce que ce mois a laissé jusqu'ici », pas à « est-ce que je tiens
jusqu'au bout ».

Il lui manque deux choses :

- **Les engagements attendus mais pas encore prélevés n'en sont pas déduits.** Le reste à vivre
  paraît confortable le 5 du mois alors que le loyer n'est pas passé. L'app connaît pourtant ces
  montants : `matchMonth` classe chaque engagement en « payé » ou « à venir », et
  `engagementsTotals` en tire déjà un `pending`.
- **Il n'est pas rapporté au temps restant.** 400 € le 8 du mois et 400 € le 28 ne veulent pas dire
  la même chose, et rien à l'écran ne fait la différence.

Ces deux manques se combinent : la seule information qui manquerait pour décider d'une dépense
aujourd'hui est précisément celle que l'app pourrait calculer sans nouvelle donnée.

## 2. Décision de l'utilisateur

**Les deux chiffres** : le budget journalier disponible **et** la projection de fin de mois. Retenu
en connaissance de la différence de nature entre les deux — le premier est de l'arithmétique sur
des faits, le second une extrapolation.

## 3. Le calcul — module `lib/cockpit/pace.ts`

Module **pur**.

```ts
export type MonthPace = {
  /** Reste à vivre du mois moins les engagements attendus non encore prélevés. */
  disponible: number;
  joursEcoules: number;
  joursRestants: number;
  /** disponible / joursRestants, jamais négatif. */
  parJour: number;
  /** Dépenses variables du mois ÷ jours écoulés. */
  rythmeVariable: number;
  /** disponible − rythmeVariable × joursRestants. `null` avant le seuil. */
  finDeMois: number | null;
};

export function monthPace(input: {
  resteAVivre: number;
  pendingEngagements: number;
  variable: number;
  today: string;   // date ISO "YYYY-MM-DD"
}): MonthPace;
```

- **`disponible` = `resteAVivre − pendingEngagements`.** C'est l'apport principal de cette
  fonctionnalité : le reste à vivre affiché aujourd'hui ignore ce qui va être prélevé.
- **`joursRestants` inclut aujourd'hui** : on peut encore dépenser le jour même. Pour le 28 d'un
  mois de 31 jours, `joursRestants` vaut 4 et `joursEcoules` 28.
- **`parJour` est plancherisé à 0.** Un disponible négatif signifie que le mois est déjà dépassé ;
  afficher un budget journalier négatif n'apprendrait rien de plus que le disponible lui-même, qui
  porte déjà l'information.
- **`rythmeVariable`** ne porte que sur les dépenses **variables**, jamais sur les engagements : ces
  derniers sont déjà comptés une fois dans `pendingEngagements`, les extrapoler les compterait deux
  fois.

### 3.1 Le seuil de projection

`finDeMois` vaut **`null` avant le 8 du mois**, et le montant estimé à partir du 8.

Justification : sur trois jours écoulés, une grosse course multiplie par dix et annonce la ruine ;
le lendemain d'une journée sans dépense, l'abondance. Une projection qui oscille ainsi n'informe
pas, elle inquiète — et elle décrédibilise le chiffre voisin qui, lui, est fiable.

Coût assumé : l'utilisateur perd une semaine de projection par mois. En échange il ne voit jamais
un chiffre affolant sans fondement.

## 4. L'affichage

Une **carte sur le Cockpit**, placée près du reste à vivre dont elle est le prolongement. Pas
d'écran séparé : c'est une question qu'on se pose en regardant ses comptes, pas une analyse qu'on
va chercher. La barre de navigation compte de toute façon déjà cinq onglets.

La carte porte, par ordre d'importance visuelle :

1. **Le disponible**, en gros, en `.font-mono-num` — c'est un fait.
2. **Le budget journalier** : « X € par jour sur N jours ».
3. **La projection**, visuellement secondaire et explicitement libellée comme une estimation :
   « Fin de mois estimée : Y € ». Avant le 8, cette ligne est remplacée par « Estimation de fin de
   mois à partir du 8 ».

Quand `disponible` est négatif, la carte le dit franchement — le mois est dépassé — plutôt que
d'afficher un budget journalier de 0 € sans explication.

## 5. La contrainte du sélecteur de mois

Le Cockpit permet de naviguer entre les mois. **La carte ne s'affiche que lorsque le mois
sélectionné est le mois en cours.** « Est-ce que je tiens » n'a aucun sens pour mars dernier, et
afficher un budget journalier sur un mois clos serait absurde.

Le mois de référence est le mois calendaire courant. À ne pas confondre avec le rattachement du
salaire, qui déplace des transactions entre mois budgétaires mais ne change pas quel mois est en
cours.

## 6. Hors périmètre

- La dérive des abonnements — dernière piste de la feuille de route, à traiter séparément.
- Aucune notification ni alerte : la carte informe quand on regarde, elle ne poursuit pas
  l'utilisateur.
- Aucun réglage de seuil : le 8 est un choix de conception, pas une préférence. En faire une option
  demanderait de justifier chaque valeur à l'utilisateur, pour un gain nul.
- Aucune prise en compte du solde bancaire réel : l'app raisonne sur les flux du mois, pas sur un
  solde. Le reste à vivre a toujours eu cette définition et cette carte la prolonge sans la changer.
- Aucune nouvelle table ni vue Postgres, aucune migration.

## 7. Tests

- `pace.test.ts` : `disponible` déduit bien les engagements à venir ; `joursRestants` inclut le jour
  courant et vaut 1 le dernier jour du mois ; le calcul sur des mois de 28, 30 et 31 jours et sur un
  février bissextile ; `parJour` plancherisé à 0 quand le disponible est négatif ; `rythmeVariable`
  sur un jour écoulé ; `finDeMois` à `null` du 1er au 7 et calculé à partir du 8 ; `finDeMois`
  n'extrapole que le variable, jamais les engagements (un cas où un gros `pendingEngagements`
  n'augmente pas la dépense extrapolée).
- Un test vérifie que le disponible d'un mois sans engagement à venir égale exactement le reste à
  vivre — la continuité avec le chiffre déjà affiché par le Cockpit.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 8. Critère de succès

Le 12 du mois, l'utilisateur ouvre son Cockpit et voit, sous son reste à vivre, ce qu'il lui reste
réellement une fois le loyer et les abonnements à venir déduits, combien cela fait par jour jusqu'à
la fin du mois, et une estimation de ce avec quoi il finira s'il continue ainsi. Le 3 du mois, il
voit les deux premiers chiffres et une mention lui disant que l'estimation arrivera le 8.
