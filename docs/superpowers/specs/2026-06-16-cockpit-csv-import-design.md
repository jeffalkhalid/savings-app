# Cockpit — Import relevé BNP (.xls) (backlog #4)

**Date** : 2026-06-16
**Branche** : `csv-import` (depuis `main`, qui inclut désormais transactions-api + patrimoine + projection)
**Périmètre** : importer un export `.xls` BNP en transactions cockpit — parsing, catégorisation par mapping statique (catégories BNP → catégories cockpit), dédoublonnage, écran de revue éditable, insert en masse. **100 % client-side, sans IA ni serveur.**

## Contexte & découvertes

L'export fourni est un **vrai binaire Excel `.xls`** (OLE2/BIFF, encodage Windows-1252), pas un CSV. Structure réelle observée (253 lignes × 7 colonnes) :
- Ligne 0 : en-tête de compte (`Compte de chèques ****8172`, `Solde au …`, solde, `EUR`).
- Ligne 2 : en-têtes `Date operation | Categorie operation | Sous Categorie operation | Libelle operation | Montant operation | Pointage operation | Commentaire operation`.
- Lignes 3+ : transactions. Date **JJ-MM-AAAA**, **montant signé unique** (négatif = débit), libellé brut, + **catégorie & sous-catégorie BNP déjà renseignées**.

**Conséquences de cadrage :**
1. **BNP catégorise déjà** → pas besoin de Claude API. **Mapping statique** BNP→cockpit, déterministe, local. Décision validée : *mapping statique seul* (zéro IA, zéro donnée externe, zéro coût).
2. Le `type` cockpit **découle de la catégorie mappée** (Virements→transfer, Salaire/Intéressement→income, Épargne/Bourse Natixis→savings, le reste→expense). Pas d'heuristique de type séparée.
3. Les noms de catégories cockpit ne sont pas lisibles sans login (RLS) ; fournis par l'utilisateur (17 catégories, voir mapping). La résolution nom→`category_id` se fait à l'exécution via `useCategories` ; un **écran de revue avec catégorie éditable par ligne** rend le mapping non critique (défaut intelligent, corrigeable).

## Catégories cockpit (cibles du mapping)

`Salaire`(income), `Intéressement`(income), `Virements`(transfer), `Épargne`(savings), `Bourse / Natixis`(savings), `Logement`(expense), `Énergie`(expense), `Courses alimentaires`(expense), `Restaurants & Sorties`(expense), `Loisirs & Streaming`(expense), `Sport & Bien-être`(expense), `Transport`(expense), `Téléphonie`(expense), `Vêtements & Hygiène`(expense), `Assurance`(expense), `Frais bancaires`(expense), `Imprévus & Santé`(expense, catch-all).

## Décisions validées

- **Architecture** : tout client-side ; route dédiée `/cockpit/import` ; insert via `transactions-api`.
- **Parsing** : SheetJS (`xlsx`) — **nouvelle dépendance**. Lecture `ArrayBuffer` (FileReader), `sheet_to_json` header:1.
- **Montant** : on insère le **montant signé brut BNP** (autoritaire) → nouveau `createTransactionsBulk` qui ne repasse PAS par `signedAmount`.
- **Mapping** : clé sous-catégorie BNP d'abord, repli catégorie, défaut `Imprévus & Santé`. Cible = nom cockpit, résolu en `category_id` à l'exécution.
- **Dédoublonnage** : clé `(date ISO, montant)` contre les transactions existantes de la plage de dates ; doublons **marqués** (case « inclure »), pas supprimés.
- **Revue éditable** avant insert (catégorie ▾ par ligne, statut nouveau/doublon).
- **Compte cible** : sélecteur, défaut = compte contenant « BNP ».
- **Tests** : Vitest sur modules purs. Parsing xlsx/UI/insert vérifiés par tsc/build/smoke.
- **Design** : mobile-first, tokens cream/ink/emerald, Fraunces/Geist.

## Architecture des fichiers

```
lib/cockpit/
  bnp-import.ts        # PUR + testé :
                       #   parseBnpSheet(rows: string[][]) -> ParsedRow[]
                       #   mapBnpCategory(cat, subCat) -> cockpit category name
                       #   markDuplicates(rows, existingKeys: Set<string>) -> ReviewRow[]
                       #   rowKey(dateISO, amount) -> string
  bnp-import.test.ts   # Vitest
  transactions-api.ts  # MODIF : + createTransactionsBulk(userId, rows)

components/cockpit/import/
  ImportDropzone.tsx   # input file .xls
  ReviewTable.tsx      # tableau de revue + en-tête compteurs + bouton importer
  ReviewRow.tsx        # 1 ligne éditable (catégorie ▾, statut, inclure)

app/cockpit/import/page.tsx        # orchestre : parse -> map -> dedupe -> review -> insert
app/cockpit/page.tsx               # MODIF : bouton « Importer » dans l'en-tête
package.json                        # MODIF : + "xlsx"
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Category`, `Account`), `@/lib/cockpit/hooks` (`useAuth`, `useCategories`, `useAccounts`), `@/lib/cockpit/transactions-api`.

## Modules purs (testés)

```ts
export type ParsedRow = {
  date: string;          // ISO YYYY-MM-DD
  label: string;
  amount: number;        // signé (négatif = débit)
  bnpCategory: string;
  bnpSubCategory: string;
};

export type ReviewRow = ParsedRow & {
  categoryName: string;  // défaut issu du mapping
  duplicate: boolean;
};

// Trouve la ligne d'en-tête ("Date operation"), parse les lignes suivantes non vides.
// Date "JJ-MM-AAAA" -> ISO ; montant "-149.99" / "-149,99" -> number ; ignore l'en-tête de compte.
export function parseBnpSheet(rows: string[][]): ParsedRow[];

// sous-catégorie BNP (prioritaire) puis catégorie, sinon "Imprévus & Santé".
export function mapBnpCategory(category: string, subCategory: string): string;

export function rowKey(dateISO: string, amount: number): string; // `${dateISO}|${amount}`

// marque duplicate=true si rowKey ∈ existingKeys ; applique le mapping pour categoryName.
export function markDuplicates(rows: ParsedRow[], existingKeys: Set<string>): ReviewRow[];
```

Tests : `parseBnpSheet` (saut en-tête compte + ligne vide, date→ISO, montant signé, virgule décimale, ligne tronquée ignorée) ; `mapBnpCategory` (sous-cat connue, repli catégorie, défaut) ; `rowKey`/`markDuplicates` (marque les présents, laisse les nouveaux, applique le mapping).

## Écritures (`transactions-api.ts`)

```ts
export type ImportRow = {
  date: string;        // ISO
  amount: number;      // signé brut
  description: string; // libellé BNP
  categoryId: string;
  type: string;        // type de la catégorie résolue
  accountId: string;
};
// Un seul insert tableau ; source: "import". Préserve le montant signé tel quel.
export async function createTransactionsBulk(userId: string, rows: ImportRow[]): Promise<void>;
```

## Flux de la page `/cockpit/import`

1. `ImportDropzone` : `<input type="file" accept=".xls">` → `FileReader.readAsArrayBuffer` → `XLSX.read(buf, { type: "array" })` → `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })` → `string[][]`.
2. `parseBnpSheet` → `ParsedRow[]`.
3. Charger les transactions existantes de la plage `[min(date), max(date)]` (fetch `transactions?select=date,amount&gte&lte`) → `existingKeys = Set(rowKey)`.
4. `markDuplicates` → `ReviewRow[]` (categoryName depuis le mapping, duplicate flag).
5. `ReviewTable` : compteurs « N nouvelles · M doublons » ; par ligne `ReviewRow` (date, libellé, montant coloré, **catégorie ▾** depuis `useCategories`, badge doublon + case « inclure »). Sélecteur de compte cible.
6. « Importer les N lignes » : pour chaque ligne retenue, résoudre `category_id`/`type` depuis la catégorie choisie, construire `ImportRow[]`, `createTransactionsBulk` → message succès → retour `/cockpit`.

## États & erreurs

- Fichier illisible / mauvais format (pas de ligne d'en-tête trouvée) : message « Format BNP non reconnu ».
- 0 ligne : « Aucune transaction trouvée ».
- Erreur insert Supabase : message visible, rien n'est navigué.
- Doublons : exclus par défaut (case décochée), réintégrables.
- Catégorie non résolue (nom absent des catégories live) : ligne surlignée, insert bloqué tant qu'une catégorie n'est pas choisie.

## Hors périmètre

- Autres banques / autres formats.
- Catégorisation par IA (écartée : BNP catégorise déjà).
- Import multi-comptes dans un même fichier (l'export = un compte).
- Détection de doublons floue (libellés) — on s'en tient à (date, montant).

## Critères de succès

- Sélectionner l'export BNP `.xls` affiche un tableau de revue avec catégories pré-mappées et doublons marqués.
- Ajuster une catégorie / inclure un doublon fonctionne ; « Importer » insère les lignes retenues (montants signés préservés) et elles apparaissent au Dashboard.
- Réimporter le même fichier ne crée pas de doublons (tous marqués, exclus par défaut).
- `npm run test` vert (incl. `bnp-import.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK, route `/cockpit/import` présente.
