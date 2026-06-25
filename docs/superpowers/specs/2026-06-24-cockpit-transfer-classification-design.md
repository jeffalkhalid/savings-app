# Cockpit — Classification automatique des virements

**Date** : 2026-06-24
**Branche** : `transfers-triage` (poursuite — contient déjà le reste à vivre net signé + l'outil de tri manuel)
**Périmètre** : remplacer le fourre-tout `transfer` par une **auto-classification** des virements en Revenus / Dépenses / Épargne (règle signe + libellé), appliquée à l'import et en rattrapage de l'existant. Retirer la case « Transferts » du Dashboard ; garder l'outil de tri manuel comme correction ponctuelle.

## Contexte

Le type `transfer` est un fourre-tout : il gonfle « Transferts », sous-compte « Épargne » et fausse le taux d'épargne. Un virement est en réalité toujours : de l'argent **reçu** (revenu), **dépensé** (dépense), ou **mis de côté** (épargne). On supprime donc la 4ᵉ case et on classe chaque virement dans les 3 vraies natures.

## Décisions validées

- **Règle** (donnée par l'utilisateur) :
  - montant **≥ 0** (reçu) → **income**
  - montant **< 0** (émis) → **expense**, **sauf** si le libellé vise un compte d'épargne/invest → **savings**
  - mots-clés épargne : `natixis`, `bourse`, `pea`, `livret`, `ldds`, `or & argent`, `épargne` (insensible casse/accents).
- **Catégories cibles** : revenu → **« Virements reçus »** (income) ; dépense → **« Virements émis »** (expense) ; épargne → **« Bourse / Natixis »** si natixis/bourse/pea sinon **« Épargne »**. Les deux catégories « Virements reçus/émis » sont créées si absentes.
- **Application** : (1) à l'import BNP (les virements arrivent classés) ; (2) action **« Classer les virements »** (rattrapage) sur les `type=transfer` existants.
- **UI** : `StatStrip` montre **Revenus / Dépenses / Épargne** (Transferts retiré). Un **rappel « N virement(s) à classer »** apparaît s'il reste des `transfer`, avec « Classer automatiquement » (règle) et « À la main » (ouvre le tri manuel conservé). Le rappel disparaît quand la pile est vide.
- **Reste à vivre** : inchangé (net signé — converge vers Revenus − Dépenses − Épargne une fois tout classé).
- **Outil de tri manuel** : conservé (correction ponctuelle / override).
- **Tests** : Vitest sur la règle pure. Reste vérifié par tsc/build/smoke.

## Architecture des fichiers

```
lib/cockpit/
  classify-transfer.ts        # PUR + testé : classifyTransfer, targetCategoryName, SAVINGS_KEYWORDS
  classify-transfer.test.ts   # Vitest
  transfers-api.ts            # ensureTransferCategories(userId, categories), classifyAllTransfers(...)
  defaults.ts                 # MODIF : + "Virements reçus" (income), "Virements émis" (expense)

components/cockpit/
  StatStrip.tsx               # MODIF : retire la case Transferts (3 cases) ; plus de prop onTransfers
  TransferNudge.tsx           # NOUVEAU : "N à classer" + boutons auto / manuel

app/cockpit/page.tsx          # MODIF : nudge + action auto-classer ; tri manuel via le nudge
app/cockpit/import/page.tsx   # MODIF : applique classifyTransfer aux lignes virement à l'import
```

Reuse : `@/lib/cockpit/types` (`Txn`, `Category`), `@/lib/cockpit/transactions-api` (`updateTransaction`), `@/lib/cockpit/transfers` (`pendingTransfers`), `@/lib/cockpit/supabase`.

## Module pur (testé)

```ts
export const SAVINGS_KEYWORDS = ["natixis", "bourse", "pea", "livret", "ldds", "or & argent", "épargne"];

export type TransferClass = "income" | "expense" | "savings";

// Normalise (minuscule, sans accents) et applique la règle signe + mots-clés.
export function classifyTransfer(amount: number, label: string): TransferClass;

// Nom de catégorie cible pour un résultat de classification + le libellé.
export function targetCategoryName(cls: TransferClass, label: string): string;
```

- `classifyTransfer` : `amount >= 0` → `"income"` ; sinon, si `normalize(label)` contient un `SAVINGS_KEYWORDS` → `"savings"` ; sinon `"expense"`.
- `targetCategoryName` :
  - `"income"` → `"Virements reçus"`
  - `"savings"` → `"Bourse / Natixis"` si label contient natixis/bourse/pea, sinon `"Épargne"`
  - `"expense"` → `"Virements émis"`

**Tests** : reçu (+) → income ; émis (−) générique → expense ; émis vers chaque mot-clé (NATIXIS, "Bourse", PEA, "Livret A", LDDS) → savings ; insensibilité casse/accents (`ÉPARGNE`, `epargne`) ; `targetCategoryName` pour chaque cas (income→Virements reçus ; natixis→Bourse / Natixis ; livret→Épargne ; expense→Virements émis).

## Écritures (`transfers-api.ts`)

```ts
// Crée "Virements reçus" (income) et "Virements émis" (expense) si absentes ; renvoie la liste à jour.
export async function ensureTransferCategories(
  userId: string,
  categories: Category[]
): Promise<Category[]>;

// Classe toutes les transactions type=transfer de `txns` via la règle, en updateTransaction.
// Renvoie le nombre traité. Les catégories cibles sont résolues dans `categories`
// (suppose ensureTransferCategories déjà appelé). Une cible absente → ignore la ligne (comptée à part).
export async function classifyAllTransfers(
  userId: string,
  txns: Txn[],
  categories: Category[]
): Promise<number>;
```

- `ensureTransferCategories` : pour chaque nom manquant (`"Virements reçus"` type income, `"Virements émis"` type expense), `insert` dans `categories` (avec `user_id`, `color` neutre `#6B6E76`). Pas de doublon.
- `classifyAllTransfers` : pour chaque `t` de `pendingTransfers(txns)` : `cls = classifyTransfer(t.amount, t.description)` ; `name = targetCategoryName(cls, t.description)` ; `cat = categories.find(c => c.name === name)` ; si trouvé → `updateTransaction(t.id, { date, absAmount: Math.abs(amount), description, categoryId: cat.id, categoryName: cat.name, accountId: account_id ?? "", categoryType: cat.type })`.

## UI

- **`StatStrip`** : passe à 3 cellules `Revenus / Dépenses / Épargne`. Retire la cellule `Transferts` et la prop `onTransfers` (plus de cellule tappable).
- **`TransferNudge({ count, onAuto, onManual, busy })`** : barre discrète « {count} virement(s) à classer » + bouton « Classer automatiquement » (`onAuto`, désactivé si `busy`) + « À la main » (`onManual`). Rendue seulement si `count > 0`.

## Intégration page (`app/cockpit/page.tsx`)

- Garde l'état `showTransfers` (ouvre le tri manuel) + un état `classifying`.
- `pendingTransfers(txns)` → `transfers` ; le `TransferNudge` (count = `transfers.length`) s'affiche au-dessus de la zone principale en vue par défaut (pas en drill).
- `onAuto` : `await ensureTransferCategories(user.id, categories)` (récupère la liste à jour) → `await classifyAllTransfers(user.id, txns, listeMAJ)` → `refetch()`. `onManual` : `setShowTransfers(true)`.
- Le tri manuel (`TransferTriage`) reste branché sur `showTransfers`. Sa liste de catégories inclut désormais « Virements reçus/émis ».
- `StatStrip` n'a plus `onTransfers`. `changeMonth` réinitialise `showTransfers`.

## Import (`app/cockpit/import/page.tsx`)

Lors de la construction des lignes de revue, pour une `ParsedRow` dont le `mapBnpCategory` renvoie une catégorie de type `transfer` (ou dont la catégorie BNP est un virement), **surcharger** la catégorie par `targetCategoryName(classifyTransfer(amount, label), label)`. Ainsi les virements importés arrivent déjà classés (revenu/dépense/épargne). La résolution nom→catégorie à l'insert utilise les catégories live ; si « Virements reçus/émis » manquent, l'import les crée (réutiliser `ensureTransferCategories` au chargement de la page d'import).

## États & erreurs

- Catégorie cible absente et non créable : la ligne reste `transfer` (comptée dans le nudge) ; l'utilisateur peut la classer à la main.
- Erreur Supabase pendant l'auto-classification : message visible ; les lignes déjà traitées restent classées (idempotent : re-cliquer reprend les restantes).
- Aucun virement : pas de nudge, Dashboard inchangé.

## Hors périmètre

- Apprentissage / règles personnalisées par destinataire (au-delà des mots-clés épargne).
- Suppression du type `transfer` au niveau base (il reste l'état « à classer »).
- Multi-mois en une vue (auto-classer opère sur le mois affiché ; on change de mois pour le reste).

## Critères de succès

- Après « Classer automatiquement » (ou import), les virements du mois deviennent Revenus / Dépenses / Épargne selon la règle ; « Transferts » a disparu du StatStrip ; taux d'épargne et reste à vivre deviennent fidèles.
- Un virement vers Natixis/Bourse/PEA/Livret/LDDS compte en épargne ; un reçu en revenu ; le reste des émis en « Virements émis » (dépense).
- L'outil de tri manuel reste accessible (via le nudge) pour corriger un cas.
- `npm run test` vert (incl. `classify-transfer.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
