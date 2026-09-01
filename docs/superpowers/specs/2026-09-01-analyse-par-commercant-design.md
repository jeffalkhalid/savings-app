# Analyse par commerçant — « Où part vraiment mon argent ? » — spec

**Date** : 2026-09-01
**Contexte** : première des quatre pistes d'analyse retenues avec l'utilisateur. Les trois autres
(évolution dans le temps, dérive des abonnements, tenue du mois en cours) feront chacune leur
propre cycle.

## 1. Problème

Toute l'analyse de l'app est **mono-mois et par catégorie** : le Cockpit montre le mois courant
(taux d'épargne, reste à vivre, engagements vs variable, répartition par catégorie). Rien ne
répond à « combien ai-je laissé chez ce commerçant sur l'année ».

Deux raisons rendent la question urgente maintenant :

- l'utilisateur vient d'importer 13 mois d'historique (996 opérations) ;
- la clé commerçant (`lib/cockpit/payee-key.ts`) identifie enfin un commerçant à travers des
  libellés bancaires qui changent à chaque opération. L'agrégation par commerçant devient possible.

Un troisième argument décide de l'ordre : **cette analyse ne dépend d'aucune catégorie.** 847 des
996 lignes importées sont en « Autres », donc toute analyse par catégorie est aujourd'hui faussée.
L'analyse par commerçant fonctionne malgré cela — et aide à réparer la catégorisation.

## 2. Prérequis bloquant : `useAllTransactions` est tronqué

```ts
supabase.from("transactions").select("id,date,amount,type,description,category_id")
```

Ni `range()`, ni `limit()`, ni `order()`. **Supabase plafonne par défaut à 1000 lignes**, et sans
tri, *quelles* 1000 lignes reviennent n'est pas déterministe. Avec 996 lignes importées plus
l'historique antérieur, le plafond est déjà atteint.

Conséquence pour cette fonctionnalité : les totaux par commerçant seraient calculés sur un
échantillon arbitraire et seraient faux, **sans aucun message d'erreur**. C'est le pire mode de
défaillance possible pour un écran d'analyse.

Conséquence déjà réelle : ce hook alimente `buildHistoryMap` (apprentissage des catégories à
l'import) et `detectRecurring` (détection des engagements). Les deux sont donc déjà tronqués en
silence, ce qui explique vraisemblablement pourquoi « Détectés » ne propose que 3 candidats alors
que l'historique contient une douzaine de prélèvements mensuels évidents.

**La pagination est donc la première tâche du chantier**, et elle vaut correctif à part entière.

Pourquoi ne pas déporter l'agrégation dans une vue Postgres, comme `v_monthly_by_category` : la
clé commerçant est calculée en TypeScript (regex sur le libellé). La reproduire en SQL créerait
deux implémentations à maintenir en parallèle, et c'est exactement le genre de divergence qui a
déjà coûté deux séances de débogage sur ce projet.

## 3. Décisions de l'utilisateur

- **Toutes les opérations, tous types confondus** dans le classement — pas seulement les dépenses.
  L'utilisateur a choisi cela en connaissance de la contrepartie : le salaire (44 538 € cumulés) et
  les virements d'épargne dominent le haut de liste. **Mitigation retenue, qui ne retire rien** :
  des puces de filtre par type en tête de liste (Tout / Dépenses / Virements / Épargne / Revenus),
  sur « Tout » par défaut. C'est le motif déjà employé par les puces de catégorie du drill.
- **Classement + fiche par commerçant** : le classement seul laisserait l'utilisateur repartir
  chercher à la main dans le Cockpit pour comprendre un montant.

## 4. Module `lib/cockpit/merchants.ts`

Module **pur**.

```ts
export type MerchantStat = {
  key: string;      // clé commerçant (merchantKey)
  label: string;    // libellé d'affichage : le plus fréquent du groupe
  total: number;    // somme des montants en valeur absolue
  count: number;    // nombre d'opérations
  lastDate: string; // date la plus récente, ISO
};

export function aggregateByMerchant(txns: Txn[]): MerchantStat[];
export function merchantSeries(txns: Txn[], key: string): { month: string; total: number }[];
```

- `aggregateByMerchant` regroupe par `merchantKey(t.description)`, ignore les clés vides, somme les
  montants en **valeur absolue** (le classement répond à « quel volume passe par là », pas à un
  solde signé), et trie par total décroissant.
- Le **libellé d'affichage** est le libellé brut le plus fréquent du groupe — comme
  `detectRecurring` le fait déjà pour les engagements. En cas d'égalité, le premier rencontré.
- `merchantSeries` renvoie les totaux mensuels d'un commerçant, mois croissants, **sans trous
  comblés** : un mois sans opération est absent de la série plutôt que présent à zéro, pour ne pas
  inventer une donnée.
- Le filtrage par type se fait **en amont**, par l'appelant : le module ne connaît pas les puces.

## 5. Écran `/cockpit/commercants`

- En-tête : titre, nombre de commerçants, total de la période affichée.
- **Puces de type** : Tout (défaut) / Dépenses / Virements / Épargne / Revenus.
- **Recherche** par libellé, comme dans le drill.
- Liste : `libellé · N opérations` et le montant cumulé en `.font-mono-num`.
- Un appui ouvre la **fiche du commerçant**.

**Périmètre temporel** : tout l'historique disponible. Pas de sélecteur de période — l'utilisateur
a écarté cette option, et un second sélecteur entrerait en concurrence avec celui du Cockpit.

## 6. Fiche commerçant

La fiche **réutilise `OpsDrill`** en lui passant les opérations du commerçant. C'est le cœur de la
conception : l'utilisateur récupère ainsi, sans code nouveau, la recherche, les libellés dépliables
et surtout la **sélection en masse avec création de règle**.

Conséquence pratique majeure : depuis « Elior · 1 380 € · 35 opérations », il peut tout
sélectionner et tout reclasser en Restaurants d'un geste — l'outil exact dont il a besoin pour
vider ses 847 lignes en « Autres ». L'analyse et la correction se rejoignent dans le même écran.

Au-dessus de la liste, la fiche ajoute : total, nombre d'opérations, date de la dernière, et
l'**évolution mois par mois**. Décision : des barres en CSS (de simples `div` de hauteur
proportionnelle), pas `recharts`. La série fait au plus une quinzaine de points, un graphique
complet serait disproportionné et alourdirait un écran déjà dense.

**Le handler de reclassement en masse doit être partagé, pas recopié.** `OpsDrill` reçoit
aujourd'hui son `onBulkCategorise` de `app/cockpit/page.tsx`, qui écrit les transactions, crée les
règles et rafraîchit. La fiche commerçant a besoin exactement du même comportement : on extrait
donc ce handler dans un hook `useBulkRecategorise(userId, onDone)` consommé par les deux écrans.
Le recopier ferait diverger deux chemins d'écriture qui doivent rester identiques — notamment la
remise à zéro de `goal_id`, dont l'oubli avait déjà été rattrapé en relecture.

## 7. Accès

La barre de navigation compte déjà 5 onglets (Cockpit, Patrimoine, Projection, Épargne,
Objectifs) ; un sixième tasserait le menu sur mobile. L'écran est donc une **sous-page**, atteinte
par un lien **« Commerçants »** dans l'en-tête de la section « Par catégorie » du Cockpit,
symétrique du lien « Budgets » qui s'y trouve déjà.

## 8. Hors périmètre

- Les trois autres pistes d'analyse (évolution dans le temps, dérive des abonnements, tenue du mois
  en cours) : chacune son cycle.
- Aucun sélecteur de période.
- Aucune nouvelle table ni vue Postgres.
- Aucune fusion manuelle de deux commerçants. Les cas connus où BNP nomme un même tiers
  différemment selon l'export (`NAVIGO` vs `NAVIGO ANNUEL COMUTITRES SAS`, `GENERALI IARD` vs
  `GENERALI IARD SA`, `ELIOR (FRANCE)` vs `ELIOR ENTRETRIS`) apparaîtront donc en double dans le
  classement, sans mention particulière à l'écran. C'est une limite assumée : une fusion d'alias
  suppose de stocker des correspondances choisies par l'utilisateur, et c'est un chantier à part.

## 9. Tests

- `merchants.test.ts` : agrégation (regroupement, somme en valeur absolue, comptage) ; choix du
  libellé le plus fréquent ; tri par total décroissant ; clés vides ignorées ; entrée vide ;
  `merchantSeries` (ordre croissant, mois manquants absents, commerçant inconnu → série vide).
- Pagination : test du module pur de découpage des plages, et vérification manuelle qu'un jeu de
  plus de 1000 lignes revient entier.
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 10. Critère de succès

L'utilisateur ouvre « Commerçants », voit son classement complet sur 13 mois — totaux **justes**,
c'est-à-dire calculés sur toutes ses transactions et non sur les 1000 premières —, filtre sur
« Dépenses » d'un geste pour écarter salaire et virements, ouvre Elior, et reclasse ses 35
opérations en Restaurants en une sélection.
