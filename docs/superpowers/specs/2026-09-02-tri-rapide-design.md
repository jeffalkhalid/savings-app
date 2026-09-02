# Tri rapide — vider « Autres » en une session — spec

**Date** : 2026-09-02
**Contexte** : l'utilisateur a environ 847 lignes en « Autres ». Ce n'est pas un défaut d'analyse,
c'est le goulot d'étranglement de toute l'app : la vue par catégorie d'Évolution, les budgets, les
alertes de dépassement et les futurs scénarios de choc en dépendent tous.

## 1. Problème

Reclasser est déjà possible : Cockpit → catégorie → sélection multiple → catégoriser, avec création
automatique d'une règle. Le geste n'est pas en cause.

Ce qui l'est, c'est le **cadrage** :

- **Le Cockpit est mensuel.** 847 lignes réparties sur 13 mois obligent à refaire l'opération treize
  fois, en retrouvant à chaque mois les mêmes commerçants.
- **L'écran Commerçants couvre tout l'historique mais n'a aucun filtre « non classé ».** Il est conçu
  pour explorer, pas pour vider une file : rien n'y dit ce qu'il reste, ni n'amène au suivant.

Personne ne finit un travail dont il ne voit pas la fin.

## 2. Décisions de l'utilisateur

- **Une file par commerçant**, pas par opération : classer un commerçant règle toutes ses lignes de
  tout l'historique d'un geste, et enseigne quelque chose à l'app. 847 lignes se replient en quelques
  dizaines de commerçants.
- **Sortie de file** : une vraie catégorie, **ou** une règle explicite — y compris une règle vers
  « Autres », qui est la façon de faire taire définitivement un commerçant qui relève légitimement de
  cette catégorie.
- **Suggestion en tête**, puis les catégories les plus utilisées, puis la liste complète.
- Accès depuis l'en-tête de l'écran Commerçants.

## 3. Ce que l'app peut réellement suggérer

Correction d'une erreur commise pendant la conception : la cascade de classification lit les
catégories fournies par l'export BNP, mais **elles ne sont pas stockées** — aucune colonne ne les
porte. Pour les lignes déjà en base, cette source n'existe pas.

Les sources réellement disponibles, dans l'ordre d'essai :

1. **L'historique partiel du commerçant.** Si certaines de ses lignes portent déjà une vraie
   catégorie, c'est le signal le plus fort : la plus fréquente est proposée.
2. **Le motif de virement** — libellé commençant par `VIR` ou `VIREMENT` → « Virements reçus » si le
   montant est positif, « Virements émis » sinon. Reprend `isTransferLabel` de `classify.ts`.
3. **`COMMISSION` dans le libellé** → « Frais bancaires ». Reprend la devinette timide existante.
4. **Sinon, aucune suggestion.** Une suggestion fausse coûte plus cher qu'une absence de suggestion :
   elle sera acceptée d'un tap au vingtième commerçant.

## 4. Le module — `lib/cockpit/triage.ts`

Module **pur**.

```ts
export type TriageMerchant = {
  key: string;
  label: string;              // libellé le plus fréquent
  count: number;              // opérations NON classées
  total: number;              // somme en valeur absolue des non classées
  firstDate: string;
  lastDate: string;
  samples: string[];          // jusqu'à 4 libellés distincts
  suggestion: string | null;  // nom de catégorie
};

export function triageQueue(input: {
  txns: Txn[];
  categoryNameById: Map<string, string>;
  ruledKeys: Set<string>;
  fallbackName?: string;      // défaut « Autres »
}): TriageMerchant[];

export function frequentCategories(
  txns: Txn[],
  categoryNameById: Map<string, string>,
  n: number,
  fallbackName?: string
): string[];
```

- **Une ligne est « non classée »** si sa catégorie est absente (`category_id` nul, ou inconnu de la
  table des catégories) ou si elle porte le nom de repli « Autres ». Une ligne rangée dans une
  catégorie **archivée** n'est **pas** non classée : la catégorie existe toujours, l'archivage n'est
  qu'un choix d'affichage (les transactions gardent leur `category_id`). Le prédicat lit donc TOUTES
  les catégories, actives et archivées ; seules les catégories actives sont proposées à l'utilisateur
  (chips, sélecteur, suggestion).
- **Un commerçant entre dans la file** s'il a au moins une ligne non classée **et** que sa clé n'est
  couverte par aucune règle. La règle est la mémoire du « j'ai tranché » — c'est ce qui permet de se
  passer d'une migration.
- **Tri par `total` décroissant** : on traite d'abord ce qui pèse. Un utilisateur qui abandonne à
  mi-parcours a quand même classé l'essentiel de son argent.
- **`samples`** porte jusqu'à quatre libellés **distincts**, les plus fréquents d'abord. Ils ne sont
  pas décoratifs : `merchantKey` regroupe des variantes, et c'est en les lisant qu'on repère un
  regroupement abusif avant de classer 23 lignes d'un coup.
- **Les montants sont sommés en valeur absolue**, comme partout ailleurs dans l'app — ce total classe
  la file, mais il masque un commerçant qui à la fois paie et est payé (ex. virements reçus/émis vers
  le même tiers) : une décision réécrit le `type` de chaque ligne, donc la carte doit aussi montrer la
  répartition par type quand les lignes non classées n'en ont pas qu'un seul.
- **Tous les types d'opération sont concernés**, pas seulement les dépenses : une ligne de revenu ou
  de virement sans catégorie est tout aussi non classée, et c'est souvent là que se cachent les
  virements internes mal rangés.
- `frequentCategories` classe les catégories par nombre de transactions déjà classées, en excluant le
  repli, et rend les `n` premières. Sur un historique vierge elle rend une liste vide — l'écran doit
  s'en accommoder.

## 5. L'écran `/cockpit/tri`

Un commerçant à la fois.

### 5.1 Ce que porte la carte

- Le libellé du commerçant, en tête.
- **`N opérations · X €`**, et la période (« de mars 25 à sept. 25 » — toujours avec l'année, car sur
  un historique de 13 mois ou plus le mois seul est ambigu).
- Quand les lignes non classées ne sont pas toutes du même type, une seconde ligne donne leur
  répartition (« 3 dépenses · 2 revenus ») : le total ci-dessus est en valeur absolue et le cacherait
  sinon.
- Les libellés d'exemple, en petit et en `.font-mono-num` s'ils contiennent des montants — au plus
  quatre, pour repérer un regroupement abusif.
- **La suggestion**, si elle existe, en premier et explicitement marquée comme telle.
- Puis les catégories les plus utilisées, puis une chip **« Laisser dans Autres »** — la forme visible
  de la règle explicite vers « Autres » du §2 —, puis **« Toutes les catégories… »** qui ouvre le
  sélecteur déjà utilisé par la sélection multiple (`CategoryPickerSheet`).
- **« Passer »**, qui remet le commerçant à plus tard sans rien écrire.

### 5.2 Ce que fait un choix

Choisir une catégorie applique cette catégorie **à toutes les lignes non classées de ce commerçant,
sur tout l'historique**, et crée la règle correspondante — le même mécanisme que la sélection
multiple (`updateTransactionsCategory` + `setCategoryRules`), pas un second chemin d'écriture.

Les lignes déjà classées dans une vraie catégorie ne sont **pas** touchées : elles portent une
décision antérieure, que ce tri n'a pas à défaire.

Le `type` de chaque ligne suit celui de la catégorie choisie, comme partout ailleurs :
`updateTransactionsCategory` s'en charge déjà, y compris pour détacher un objectif d'épargne quand la
ligne quitte l'épargne. Ne pas repasser par cette fonction ferait diverger le tri du reste de l'app.

Après chaque écriture réussie, les transactions **et** les règles sont rechargées : la file est
recalculée à partir de la base, jamais retirée de l'affichage à la main. Une file entretenue
localement finirait par mentir dès la première écriture partiellement échouée.

En cas d'échec, le message est affiché sur la carte elle-même et le commerçant reste en place. Passer
au suivant après un échec silencieux ferait croire à un tri qui n'a pas eu lieu.

### 5.3 La progression

En tête d'écran, en permanence : **« Reste N commerçants · X € »**. C'est la seule chose qui
transforme une corvée sans fin en tâche finie. Le compteur décroît à chaque décision, y compris pour
un « Autres » explicite.

Quand la file est vide : un état franc — tout est trié — et un lien vers l'écran Commerçants.

### 5.4 « Passer »

Purement local à la session : rien n'est écrit, et le commerçant réapparaîtra à la prochaine visite.
C'est délibéré — « je ne sais pas maintenant » n'est pas une décision, et la persister demanderait le
marqueur en base que cette conception cherche justement à éviter.

Le commerçant passé est retiré de la file courante ; le compteur affiche donc le reste **hors
passés**, sans quoi il stagnerait et l'écran perdrait sa seule promesse.

## 6. Accès

Un lien **« Trier »** dans l'en-tête de l'écran Commerçants. L'en-tête « Par catégorie » du Cockpit
porte déjà quatre liens ; un cinquième le rendrait illisible.

## 7. Hors périmètre

- Aucune migration, aucune table, aucune colonne : la table `category_rules` porte déjà la mémoire.
- Aucune suppression ni fusion de commerçants depuis cet écran — la fiche commerçant existe pour ça.
- Aucun apprentissage automatique : les quatre sources du §3 sont explicites et vérifiables. Une
  suggestion qu'on ne peut pas expliquer sera acceptée à tort.
- Aucun traitement par lot du type « classer les 30 restants en Autres » : ce serait défaire d'un
  geste le travail que l'écran existe pour permettre.
- La détection des doublons de clé commerçant (`merchantKey` trop large ou trop étroite) reste ce
  qu'elle est ; les `samples` la rendent visible, ils ne la corrigent pas.

## 8. Tests

- `triage.test.ts` : une ligne sans catégorie et une ligne « Autres » entrent toutes deux dans la
  file ; une ligne dans une vraie catégorie n'y entre pas ; un commerçant partiellement classé entre
  dans la file avec son `count` limité aux lignes non classées ; une clé couverte par une règle est
  exclue même si ses lignes sont en « Autres » ; tri par total décroissant ; `samples` distincts et
  plafonnés à quatre ; `firstDate`/`lastDate` ; les quatre sources de suggestion, dont le cas « aucune
  suggestion » ; `frequentCategories` (classement, `n` respecté, repli exclu, historique vierge).
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 9. Critère de succès

L'utilisateur ouvre « Trier », voit « Reste 34 commerçants · 612 € », et traite la file du plus lourd
au plus léger sans jamais changer d'écran ni repasser deux fois sur le même commerçant. À la fin de
la session, le compteur a diminué d'autant, et la vue par catégorie d'Évolution dit enfin quelque
chose.
