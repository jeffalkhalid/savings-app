# Import BNP : parseur multi-format + classification automatique — spec

**Date** : 2026-08-31
**Contexte** : un export BNP « 13 mois » (996 opérations) est rejeté par l'app avec
« Format BNP non reconnu ou aucune transaction ». Diagnostic confirmé en exécutant le vrai
parseur sur le fichier : **996 lignes lues, 0 parsée**.

## 1. Problème

Deux défauts distincts, le second invisible tant que le premier n'est pas corrigé.

**1. Le parseur ne connaît qu'un seul format.** `lib/cockpit/bnp-import.ts` lit les colonnes par
index fixe et n'accepte que les dates `DD-MM-YYYY`. L'export 13 mois utilise `DD/MM/YYYY` et un
autre jeu de colonnes :

| | Attendu (export court) | Export 13 mois |
|---|---|---|
| Date | `12-06-2026` | `07/08/2025` |
| Col. 2 | `Categorie operation` → « Loisirs et Sorties » | `Libelle court` → « PAIEMENT CB » |
| Col. 3 | `Sous Categorie operation` → « Sport » | `Type operation` → « FACTURE CARTE » |
| Col. 5 | `Montant operation` | `Montant operation en euro` |

`toISODate` rejette les dates à slashes, chaque ligne est écartée, le résultat est vide et
l'utilisateur voit un message qui laisse croire que son fichier est corrompu.

**2. L'export 13 mois ne contient aucune catégorie.** Même parseur réparé, `mapBnpCategory` ne
trouve rien à mapper : vérifié, `mapBnpCategory("PAIEMENT CB", "FACTURE CARTE")` retombe sur le
défaut. Les 996 lignes atterriraient toutes dans une seule catégorie.

**3. Défaut latent** : `mapBnpCategory` vise des noms (« Imprévus & Santé », « Loisirs & Streaming »,
« Vêtements & Hygiène ») absents des catégories par défaut de l'app (« Santé », « Loisirs »,
« Vêtements », « Autres »). La page d'import échoue alors sur `Catégorie non résolue : …`.

## 2. Objectif

Un export BNP de n'importe quel format s'importe sans erreur, et chaque ligne arrive **déjà
catégorisée**, avec la trace de la façon dont elle l'a été. Corriger une ligne enseigne la règle à
l'app : chaque import est plus autonome que le précédent.

**Décision utilisateur : automatisation maximale.** Tout est classé, y compris par devinette ; on
corrige après coup plutôt que de valider ligne à ligne.

## 3. Partie A — parseur multi-format

`lib/cockpit/bnp-import.ts` :

- **Colonnes repérées par nom d'en-tête**, plus par index. La ligne d'en-tête reste détectée par
  la présence de « date operation ». On y cherche ensuite, sur le libellé normalisé (minuscules,
  accents retirés) :

  | Champ | En-tête recherché | Obligatoire |
  |---|---|---|
  | `date` | `date operation` | oui |
  | `label` | `libelle operation` | oui |
  | `amount` | commence par `montant operation` | oui |
  | `bnpCategory` | `categorie operation` | non |
  | `bnpSubCategory` | `sous categorie operation` | non |
  | `shortLabel` | `libelle court` | non |
  | `operationType` | `type operation` | non |

  Si une colonne obligatoire manque, `parseBnpSheet` renvoie `[]` comme aujourd'hui.
- **`toISODate` accepte `DD-MM-YYYY` et `DD/MM/YYYY`.**
- `ParsedRow` gagne `shortLabel: string` et `operationType: string` (chaîne vide si absents).
  `bnpCategory` / `bnpSubCategory` restent des chaînes, vides quand l'export ne les fournit pas.
- Les tests existants de `bnp-import.test.ts` (ancien format) doivent rester verts sans
  modification de valeur attendue.

## 4. Partie B — clé commerçant partagée

### 4.1 Pourquoi une nouvelle clé

`normalizePayee` ne retire que les chiffres, pas les lettres. Les références SEPA, qui changent à
chaque opération, survivent et éclatent un même commerçant en autant de clés. Mesuré sur le
fichier réel :

| Commerçant | Clés avec `normalizePayee` | Avec l'extracteur |
|---|---|---|
| Foncia (loyer) | 9 | **1** (11 lignes) |
| Wellness Training | 14 | **1** (12 lignes) |
| Bouygues Telecom | éparpillé | **1** (37 lignes) |

Sans cet extracteur, une règle mémorisée ne se rappliquerait jamais : la fonctionnalité serait
inerte. C'est le cœur technique de la partie B.

### 4.2 Module `lib/cockpit/payee-key.ts`

Module **pur**, exporte `merchantKey(description: string): string`. Motifs essayés dans l'ordre,
le premier qui matche gagne ; à défaut, repli sur `normalizePayee(description)` complet.

| Motif | Commerçant extrait |
|---|---|
| `PRLV SEPA <m> ECH/…` ou `PRLV SEPA <m> ID EMETTEUR…` | `<m>` |
| `FACTURE CARTE DU <6 chiffres> <m> CARTE …` | `<m>` |
| `VIR SEPA [INST] RECU DE <m>` jusqu'à `/MOTIF`, `/REF`, `MOTIF` ou `REF` | `<m>` |
| `VIR SEPA [INST] EMIS … /BEN <m>` | `<m>` (le bénéficiaire) |
| `VIREMENT FAVEUR TIERS <m>` | `<m>` |
| `RETRAIT DAB…` | `retrait dab` |

Le résultat passe toujours par `normalizePayee` pour la casse et les accents. Les libellés réels du
fichier de l'utilisateur servent de cas de test.

### 4.3 Partage avec les engagements récurrents

`recurring-detect.ts` utilise aujourd'hui `normalizePayee` complet. Il bascule sur `merchantKey` :
une seule notion de clé dans l'app, et les prélèvements mensuels aujourd'hui non détectés (Foncia,
Wellness Training, Generali, TotalEnergies, Navigo — 11 à 12 mois consécutifs chacun) le
deviennent.

**Migration des données existantes.** `recurring_charges` a une contrainte `unique (user_id,
payee_key)` et stocke `label`. Le recalcul se fait donc **côté application**, pas en SQL :

1. Lire toutes les `recurring_charges` de l'utilisateur.
2. Recalculer `merchantKey(label)` pour chacune.
3. **Fusionner les collisions** : plusieurs anciennes clés peuvent converger vers une seule (c'est
   l'effet recherché). On conserve la ligne la plus récente (`created_at` max), on lui affecte la
   nouvelle clé, et on supprime les autres — sinon la contrainte d'unicité rejette la mise à jour.
4. Opération idempotente : relancer ne change rien si les clés sont déjà à jour.

Déclenchement : bouton « Recalculer les clés d'engagement » dans Réglages, avec un compte rendu
(« 14 engagements, 9 fusionnés »). Pas de migration automatique au chargement : l'utilisateur doit
voir ce qui se passe sur ses données.

## 5. Partie B — cascade de classification

Module pur `lib/cockpit/classify.ts`. Pour chaque ligne, on prend **le premier niveau qui répond** :

| # | Niveau | Source | Provenance |
|---|---|---|---|
| 1 | Règle explicite | `category_rules` de l'utilisateur, sur `merchantKey` | `rule` |
| 2 | Historique | transactions déjà catégorisées : `merchantKey` → catégorie majoritaire | `history` |
| 3 | Catégories BNP | `mapBnpCategory`, quand l'export les fournit | `bnp` |
| 4 | Virement | `classifyTransfer` existant sur les libellés de virement | `transfer` |
| 5 | Devinette | par `operationType` / `shortLabel` | `guess` |

Table de devinettes (niveau 5) :

| Type d'opération | Catégorie |
|---|---|
| `COMMISSIONS` | Frais bancaires |
| tout le reste (`FACTURE CARTE`, `PRLV SEPA`, `RETRAIT DAB`, `CHEQUE`, `REMISE CHEQUES`, `VRST ESPECES AUTOMATE`, inconnu) | Autres |

Le niveau 5 est donc volontairement **timide** : il ne devine que les frais bancaires, dont le
libellé est sans ambiguïté, et verse tout le reste dans « Autres ». Un paiement carte chez un
commerçant jamais vu n'est pas rangé dans une catégorie plausible-mais-fausse — décision de
l'utilisateur, prise contre l'option « deviner par type d'opération » initialement envisagée : une
dépense mal rangée fausse un budget en silence, alors qu'une dépense en « Autres » se voit.
C'est ce qui rend l'automatisation maximale acceptable : le pire cas est une catégorie neutre,
jamais une catégorie trompeuse.

Chaque ligne repart avec `{ categoryName, provenance }`. La provenance n'est pas persistée en
base : elle ne sert qu'à l'écran de revue, le temps de l'import.

**Résolution des catégories.** La cascade produit un **nom** ; la page d'import le résout contre
les catégories réelles de l'utilisateur (communes comprises). Un nom non résolu retombe sur la
catégorie nommée « Autres » si elle existe, plutôt que de faire échouer tout l'import — ce qui
corrige au passage le défaut latent §1.3. Si « Autres » n'existe pas non plus dans le compte, la
ligne arrive **sans catégorie**, décochée par défaut et signalée dans l'écran de revue : jamais
d'échec global de l'import à cause d'une seule ligne, et jamais d'insertion silencieuse dans une
catégorie arbitraire.

### 5.1 Règles d'amorçage

Fournies par l'utilisateur, insérées par la migration pour son compte. Les catégories de ce compte
étant **communes** (`categories.user_id is null`) depuis l'ouverture multi-utilisateurs, la
migration les résout **par nom** au moment de l'insertion et **ignore silencieusement** toute règle
dont la catégorie cible n'existe pas — un `insert … select … where exists`, jamais un `id` codé en
dur, qui varierait d'une base à l'autre.

| `payee_key` | Catégorie |
|---|---|
| `carrefour banque` | Courses alimentaires |
| `elior entretris` | Restaurants & Sorties |
| `campus carrefou massy` | Restaurants & Sorties |
| `campus carrefou` | Restaurants & Sorties |
| `carrefour france` | Salaire |

## 6. Modèle de données

```sql
create table if not exists public.category_rules (
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, payee_key)
);
alter table public.category_rules enable row level security;
create policy "category_rules_per_user" on public.category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Clé primaire `(user_id, payee_key)` : corriger deux fois le même commerçant écrase la règle au lieu
d'en empiler. `on delete cascade` sur la catégorie : supprimer une catégorie retire ses règles.

`lib/cockpit/category-rules-api.ts` : `getCategoryRules(userId)`, `setCategoryRule(userId,
payeeKey, categoryId)`, `deleteCategoryRule(userId, payeeKey)`.

## 7. Écran de revue

- Chaque ligne affiche un **badge de provenance** discret (`règle`, `historique`, `BNP`,
  `virement`, `deviné`), icône lucide, tokens Boussole.
- Un filtre **« devinettes seulement »** en tête de tableau, avec le compte, pour attaquer
  directement ce qui est incertain.
- **Corriger la catégorie d'une ligne crée la règle** pour son `merchantKey` et **réaffecte
  immédiatement toutes les lignes du même commerçant** dans l'écran — c'est ce qui rend les 149
  lignes Carrefour Banque corrigeables d'un geste.
- Le reste de l'écran (doublons, inclusion, engagements, choix du compte) est inchangé.

## 8. Hors périmètre

- **Rattachement du salaire au mois suivant.** Le salaire tombe le dernier jour ouvré et devrait
  compter pour le budget du mois suivant. Cela touche l'agrégation mensuelle (`metrics.ts`,
  budgets, taux d'épargne, Cockpit), pas l'import : chantier séparé, avec son propre brainstorm.
- Apprentissage statistique ou classification par IA : la cascade déterministe suffit et reste
  auditable.
- Import d'autres banques que BNP.

## 9. Tests

- `payee-key.test.ts` : un cas par motif, avec les **vrais libellés** du fichier utilisateur ;
  vérifie explicitement que les 9 variantes Foncia et les 14 variantes Wellness Training
  produisent une clé unique.
- `bnp-import.test.ts` : suite existante verte sans modification, plus le nouveau format
  (en-têtes 13 mois, dates à slashes, colonnes catégorie absentes).
- `classify.test.ts` : priorité de la cascade (une règle bat l'historique, l'historique bat la
  devinette), provenance correcte, repli sur « Autres » quand le nom ne résout pas.
- Migration des engagements : test pur sur la fonction de fusion (collisions, idempotence).
- `npx tsc --noEmit`, `npm run test`, `npm run build`.

## 10. Critère de succès

L'export 13 mois de l'utilisateur (996 lignes) s'importe sans erreur ; les 149 Carrefour Banque
partent en Courses alimentaires, les 148 virements dans le tri de virements, les abonnements
récurrents sont reconnus ; ce qui reste atterrit en « Autres », identifiable par son badge
« deviné » et corrigeable par commerçant d'un seul geste. Après correction, un second import du
même fichier ne redemande rien.

Corollaire assumé : au premier import, « Autres » sera gros. C'est voulu — il vaut mieux une
catégorie visiblement à trier qu'un budget faussé sans qu'on le voie. Le filtre « devinettes
seulement » existe précisément pour vider ce tas commerçant par commerçant, chaque correction
valant pour toutes les lignes du même commerçant et pour tous les imports suivants.
