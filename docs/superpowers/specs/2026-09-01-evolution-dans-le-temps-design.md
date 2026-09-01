# Évolution dans le temps — « Est-ce que je dérive ? » — spec

**Date** : 2026-09-01
**Contexte** : deuxième des quatre pistes d'analyse retenues avec l'utilisateur, après l'analyse par
commerçant. Restent ensuite la dérive des abonnements et la tenue du mois en cours.

## 1. Problème

L'app ne montre l'historique nulle part. Le Cockpit affiche un mois à la fois ; la Projection
regarde devant, sur des hypothèses. La seule notion de tendance existante est une comparaison
chiffrée de chaque catégorie à la moyenne de ses mois précédents — un pourcentage, jamais une
pente.

L'utilisateur dispose désormais de 13 mois d'historique importé. Il ne peut toujours pas voir si
ses dépenses montent, si son taux d'épargne s'érode, ni quelle catégorie dérive.

## 2. Contrainte décisive : quel découpage mensuel

Il existe une vue Postgres `v_monthly_by_category` qui pré-agrège par mois (`year_month`,
`category_id`, `type`, `n_txns`, `total_abs`) — tentante, et déjà consommée par
`analyzeCategories`.

**Elle ne peut pas servir ici.** Elle groupe par **mois calendaire**, alors que l'app rattache
désormais un salaire de fin de mois au mois suivant (`budgetMonthOf`). Une courbe bâtie dessus
afficherait, pour un mois donné, des revenus différents de ceux que le Cockpit affiche pour ce
même mois. Deux écrans qui se contredisent sur le même chiffre valent moins que pas de courbe du
tout.

L'agrégation se fera donc **côté client**, depuis `useAllTransactions` — désormais paginé, donc
portant sur tout l'historique et non sur 1000 lignes arbitraires — en passant chaque transaction
par `budgetMonthOf`. Le coût est un parcours O(n) sur quelques milliers de lignes, négligeable.

Corollaire assumé : la vue Postgres reste en place pour `analyzeCategories`, qui ne lit que les
dépenses et n'est donc pas affectée par le rattachement du salaire.

## 3. Décision de l'utilisateur

**Les deux vues, avec un sélecteur** : vue d'ensemble et vue par catégorie. L'utilisateur a
retenu cette option en connaissance de la contrepartie — c'est un chantier plus long, et la moitié
par catégorie ne sera pleinement exploitable qu'après son travail de recatégorisation.

## 4. Module `lib/cockpit/timeline.ts`

Module **pur**.

```ts
export type MonthTotals = {
  month: string;      // "YYYY-MM"
  revenus: number;
  depenses: number;
  epargne: number;
  tauxEpargne: number; // 0..1, 0 quand revenus === 0
};

export function monthlyTotals(txns: Txn[], shift: SalaryShift): MonthTotals[];

export function monthlyByCategory(
  txns: Txn[],
  shift: SalaryShift,
  categoryIds: string[]
): { month: string; totals: Record<string, number> }[];

export function topCategories(
  txns: Txn[],
  shift: SalaryShift,
  n: number
): string[];
```

- Les montants sont sommés en **valeur absolue** par type, comme `computeMetrics` le fait déjà pour
  un mois : `revenus` = somme des `income`, `depenses` = somme des `expense`, `epargne` = somme des
  `savings`. Les `transfer` sont **exclus** des trois séries : ce sont des mouvements entre comptes,
  les compter gonflerait artificiellement les courbes.
- `tauxEpargne` reprend exactement la définition de `computeMetrics` : `epargne / revenus`, et **0**
  quand `revenus === 0`. Aligner la définition est ce qui garantit que la courbe passe par le
  chiffre que le Cockpit affiche pour le même mois.
- Les mois sont rendus par ordre **croissant**. Un mois sans aucune transaction est **absent** de la
  série plutôt que présent à zéro : on n'invente pas de donnée, et un zéro se lirait comme un mois
  à dépenses nulles.
- `monthlyByCategory` ne renvoie que les catégories demandées, pour que l'appelant décide de ce
  qu'il trace. **Dans chaque mois rendu, toute catégorie demandée est présente, à 0 si elle n'a
  aucune opération ce mois-là.** C'est la différence avec la règle du point précédent : un mois
  entièrement vide est absent de la série, mais dans un mois qui existe, une catégorie sans
  dépense vaut 0 — sinon sa courbe se briserait en segments au lieu de retomber à zéro, et une
  interruption de tracé se lit comme une absence de donnée, pas comme une absence de dépense.
- `topCategories` classe les catégories par dépense cumulée décroissante et renvoie les `n`
  premières — il alimente la sélection par défaut de la vue par catégorie.

## 5. Écran `/cockpit/evolution`

Un segmenté en tête : **Vue d'ensemble** (défaut) / **Par catégorie**, sur le motif du segmenté
thème de `ReglagesModal`.

### 5.1 Vue d'ensemble

- Une carte avec trois courbes — revenus, dépenses, épargne — sur un axe commun en euros.
- Une seconde carte avec la seule courbe du **taux d'épargne**, en pourcentage. Elle a sa propre
  échelle : la superposer aux euros la rendrait plate et illisible.

### 5.2 Vue par catégorie

- Les **cinq catégories les plus lourdes** sont tracées par défaut (`topCategories(…, 5)`).
  Tracer les vingt catégories produirait un enchevêtrement illisible.
- Sous le graphique, la liste des catégories avec une case par catégorie, pour en ajouter ou en
  retirer. L'utilisateur garde l'accès à tout sans que l'écran soit inutilisable à l'ouverture.
- Une case cochée ajoute la courbe ; tout décocher affiche un état vide explicite plutôt qu'un
  graphique vide.

### 5.3 Graphique

`recharts`, déjà au projet et déjà utilisé par Projection et Patrimoine. Contrairement aux quinze
barres CSS de la fiche commerçant, une série temporelle multi-courbes avec axes, légende et
infobulle le justifie. Les couleurs des courbes de catégorie reprennent `categories.color`, déjà
stockée — pas de palette nouvelle à inventer.

## 6. Accès

La barre de navigation compte déjà 5 onglets. L'écran est une **sous-page**, atteinte par un lien
**« Évolution »** dans l'en-tête de la section « Par catégorie » du Cockpit, à côté des liens
« Commerçants » et « Budgets » qui s'y trouvent déjà.

## 7. Ce que l'utilisateur verra, et la limite à connaître

Tant que 847 lignes restent en « Autres », la vue par catégorie affichera surtout une grosse courbe
« Autres », les autres catégories étant sous-évaluées d'autant. Elle deviendra juste au fur et à
mesure du travail de recatégorisation depuis l'écran Commerçants.

**La vue d'ensemble, elle, est exacte immédiatement** : elle ne dépend d'aucune catégorie, seulement
du `type` de chaque transaction.

Second effet à connaître : le premier mois de l'historique n'a pas de salaire rattaché depuis le
mois précédent — son taux d'épargne paraîtra anormal. C'est la même mécanique que celle déjà
documentée pour le rattachement du salaire, pas un défaut de cette fonctionnalité.

## 8. Hors périmètre

- Les deux pistes d'analyse restantes (dérive des abonnements, tenue du mois en cours).
- Aucun sélecteur de période : la courbe couvre tout l'historique disponible. Sur 13 mois l'axe
  reste lisible ; si l'historique grandit beaucoup, un sélecteur sera un chantier à part.
- Aucune projection ni tendance calculée (droite de régression, moyenne mobile) : l'écran montre le
  réel, la Projection montre l'hypothétique, et mélanger les deux brouillerait les deux.
- Aucune nouvelle table ni vue Postgres.

## 9. Tests

- `timeline.test.ts` : `monthlyTotals` (regroupement par mois budgétaire, sommes par type,
  exclusion des `transfer`, `tauxEpargne` à 0 quand les revenus sont nuls, ordre croissant, mois
  sans transaction absent, passage d'année) ; cohérence avec `computeMetrics` sur un mois donné ;
  `monthlyByCategory` (ne renvoie que les catégories demandées, catégorie absente d'un mois à 0) ;
  `topCategories` (classement par dépense cumulée, `n` respecté, moins de `n` catégories
  disponibles).
- Un test vérifie explicitement qu'une transaction rattachée au mois suivant tombe dans le bon
  mois de la série — c'est le lien avec le Cockpit que toute la conception cherche à préserver.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 10. Critère de succès

L'utilisateur ouvre « Évolution » et voit, sur 13 mois, si ses dépenses montent et si son taux
d'épargne s'érode — avec, pour chaque mois, exactement les chiffres que le Cockpit affiche pour ce
mois-là. Il bascule sur « Par catégorie », voit ses cinq plus gros postes, et peut en cocher
d'autres.
