# Rattachement du salaire au mois suivant — spec

**Date** : 2026-08-31
**Contexte** : le salaire de l'utilisateur tombe le dernier jour ouvré du mois et finance le mois
suivant. L'app le compte aujourd'hui dans le mois où il est versé, ce qui fausse le taux d'épargne
et le reste à vivre de chaque mois.

## 1. Problème

L'app attribue chaque transaction au mois de sa date, sans exception. Un salaire versé le 29 août
gonfle les revenus d'août, alors qu'il finance septembre. Conséquences : le taux d'épargne d'août
paraît excellent et celui de septembre catastrophique, le reste à vivre est décalé d'un mois, et
les deux chiffres que l'utilisateur regarde en premier sur le Cockpit mentent tous les deux.

## 2. Objectif

Un revenu identifié comme salaire et versé en toute fin de mois compte pour le **mois suivant**,
partout où l'app agrège par mois. La date stockée n'est jamais modifiée : on ne réécrit pas
l'historique bancaire, on change seulement l'attribution.

**Décision utilisateur : seul le salaire se déplace.** Les dépenses restent sur leurs mois
calendaires. Le modèle alternatif — un mois budgétaire courant de paie à paie, qui déplacerait
aussi les dépenses — a été écarté : il redéfinirait chaque agrégat de l'app et changerait la valeur
de tout l'historique.

## 3. La règle

Une transaction bascule vers le mois suivant si, et seulement si, **les quatre conditions** sont
réunies :

1. son `type` est `income` ;
2. le `merchantKey` de son libellé figure dans la liste de **payeurs** configurée ;
3. sa `category_id` figure dans la liste de **catégories** configurée ;
4. sa date tombe dans les **N derniers jours du mois** (N configurable, défaut 4).

Sinon elle reste sur son mois calendaire.

Les conditions 2 et 3 sont cumulatives par choix de l'utilisateur : le payeur désigne le salaire,
la catégorie sert de garde-fou. Un remboursement de frais versé par le même employeur le 29 ne
bascule pas s'il est classé ailleurs que dans la catégorie marquée.

La condition 2 s'appuie sur `merchantKey` (`lib/cockpit/payee-key.ts`), déjà en place : le salaire
de l'utilisateur porte la clé `carrefour france`.

## 4. Module `lib/cockpit/budget-month.ts`

Module **pur**.

```ts
export type SalaryShift = {
  payeeKeys: string[];   // clés commerçant qui déclenchent le rattachement
  categoryIds: string[]; // garde-fou : catégories concernées
  days: number;          // taille de la fenêtre de fin de mois (défaut 4)
};

export const DEFAULT_SHIFT: SalaryShift;              // listes vides, days: 4
export function isShifted(t: Txn, s: SalaryShift): boolean;
export function budgetMonthOf(t: Txn, s: SalaryShift): string;  // "YYYY-MM"
export function shiftWindowStart(month: string, days: number): string; // date ISO
export function nextMonth(month: string): string;
```

- `isShifted` applique les quatre conditions. Une configuration aux listes vides ne déplace jamais
  rien : tant que l'utilisateur n'a rien réglé, le comportement est **exactement l'actuel**.
- `budgetMonthOf` renvoie `nextMonth(mois de la date)` si `isShifted`, sinon le mois de la date.
- `shiftWindowStart(month, days)` donne la date à partir de laquelle une transaction du mois
  **précédent** peut basculer vers `month` — c'est ce qui pilote l'élargissement de la requête.

Le calcul des « N derniers jours » se fait sur le **nombre réel de jours du mois** concerné, pas
sur une valeur fixe : février et août n'ont pas la même fin.

**Définition exacte de la fenêtre, pour éviter tout décalage d'un jour.** Pour un mois de `L` jours
et une fenêtre de `N` jours, les jours concernés sont ceux dont le numéro est
`> L − N`, soit les `N` derniers, bornes incluses :

| Mois | Jours | N=4 → jours qui basculent |
|---|---|---|
| août 2026 | 31 | 28, 29, 30, 31 |
| avril 2026 | 30 | 27, 28, 29, 30 |
| février 2026 | 28 | 25, 26, 27, 28 |
| février 2028 (bissextile) | 29 | 26, 27, 28, 29 |

`shiftWindowStart("2026-09", 4)` renvoie donc `"2026-08-28"` : le premier jour d'août dont une
transaction peut être rattachée à septembre.

**Transactions sans catégorie.** `Txn.category_id` peut être `null`. La condition 3 est alors
fausse : une transaction non catégorisée ne bascule jamais, même si le payeur correspond.

## 5. Lecture

`useTransactions(month)` interroge aujourd'hui `date >= début(M)` et `date < début(M+1)`. Il doit
désormais :

1. interroger `date >= shiftWindowStart(M, days)` et `date < début(M+1)` — une fenêtre élargie de
   `days` jours vers l'arrière ;
2. filtrer en JS sur `budgetMonthOf(t, shift) === M`.

Ce qui entre dans le mois M : les transactions datées en M qui ne basculent pas, plus celles des
`days` derniers jours de M−1 qui basculent. Ce qui en sort : celles des `days` derniers jours de M
qui basculent vers M+1.

`useTransactions` a **un seul consommateur**, `app/cockpit/page.tsx` — le périmètre est contenu.

## 6. Réglage

Colonne JSONB `user_settings.salary_shift`, même patron que `abondement_bareme` : `NULL` =
`DEFAULT_SHIFT`, donc aucun déplacement. Lecture par un parseur tolérant qui ne lève jamais, comme
`parseBareme`.

**Pourquoi pas un drapeau sur la catégorie.** Les catégories sont **communes**
(`categories.user_id is null`) depuis l'ouverture de l'app à plusieurs utilisateurs : un drapeau
posé là s'appliquerait à tout le monde. Le réglage est personnel, il vit donc dans `user_settings`.

**UI, dans Réglages** — une section « Salaire rattaché au mois suivant » :
- choix de la ou des catégories parmi les catégories de type `income` ;
- choix des payeurs, **proposés depuis l'historique** : les `merchantKey` distincts des
  transactions `income` de l'utilisateur, avec leur libellé le plus fréquent, pour qu'il coche
  « CARREFOUR FRANCE » plutôt que de taper `carrefour france` ;
- la fenêtre en jours, réglable, défaut 4 ;
- un aperçu du nombre de transactions que la configuration actuelle déplacerait, pour que le
  réglage soit vérifiable avant d'être subi.

## 7. Ce que l'utilisateur verra changer

Ces effets sont voulus, mais ils doivent être visibles et non subis :

- **Tous les taux d'épargne mensuels changent.** Chaque mois perd son salaire de fin de mois et
  récupère celui du mois précédent. En régime établi c'est neutre ; chaque valeur historique bouge
  néanmoins.
- **Le premier mois de l'historique se retrouve sans salaire** : rien ne bascule depuis avant lui.
  Son taux d'épargne paraîtra catastrophique. C'est mécanique.
- **La fenêtre de N jours peut manquer un mois** : si le mois se termine par un long week-end ou un
  férié, le dernier jour ouvré peut tomber avant la fenêtre. D'où le réglage.

Une ligne rattachée à un autre mois porte une **mention discrète** dans la liste des transactions
(« rattaché à septembre »), sans quoi l'utilisateur verrait une opération datée du 29 août dans son
mois de septembre sans explication.

## 8. Hors périmètre

- `averageMonthlyNet` (`lib/cockpit/projection.ts`) continue de grouper par mois calendaire. C'est
  une moyenne sur tous les mois : déplacer un salaire d'un mois au suivant ne change que les mois
  d'extrémité, pour un effet négligeable sur la valeur moyenne qui alimente le simulateur.
- La vue Postgres `v_monthly_by_category` n'est **pas** touchée. `analyzeCategories` ne lit que les
  lignes `type === "expense"` (vérifié), et seul un revenu se déplace : la vue est indifférente au
  changement. Sa définition n'est d'ailleurs pas dans le repo, seul un `alter … security_invoker`
  y figure.
- `recurring-detect` ignore les revenus (`if (t.type !== "expense") continue`) : non concerné.
- Aucun déplacement de dépense, aucun mois budgétaire glissant.

## 9. Tests

- `budget-month.test.ts` : les quatre conditions prises une par une (un revenu du bon payeur mais
  de la mauvaise catégorie ne bascule pas, et réciproquement) ; une configuration vide ne déplace
  rien ; la fenêtre calculée sur des mois de 28, 30 et 31 jours ; le passage décembre → janvier ;
  une année bissextile.
- Un test de partition : à partir d'un jeu de transactions couvrant deux mois, vérifier que chaque
  transaction apparaît dans exactement un mois budgétaire, et qu'aucune n'est perdue ni comptée
  deux fois.
- Parseur du JSONB : `null`, objet partiel, JSON étranger → `DEFAULT_SHIFT`, sans jamais lever.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 10. Critère de succès

L'utilisateur désigne son employeur et sa catégorie Salaire dans Réglages ; le salaire versé le
dernier jour ouvré d'août apparaît dans le Cockpit de septembre, avec une mention indiquant son
rattachement, et le taux d'épargne de septembre reflète enfin l'argent dont il disposait
réellement. Un utilisateur qui ne configure rien ne voit strictement aucun changement.
