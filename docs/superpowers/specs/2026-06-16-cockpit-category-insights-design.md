# Cockpit — Analyse par catégorie (« où optimiser »)

**Date** : 2026-06-16
**Branche** : `category-insights` (depuis `fix-import-source`, qui contient le fix `source="manual"` de l'import ; cette branche en dépend pour ne pas régresser l'import)
**Périmètre** : remplacer la liste plate de transactions du Dashboard par une **répartition des dépenses par catégorie** (classée par montant + tendance vs habitude), avec drill-down vers les transactions d'une catégorie. Donne une vraie vision « où optimiser ».

## Contexte

Après l'import BNP (~250 transactions), la liste plate du Dashboard est illisible et ne montre pas où part l'argent. La vue `v_monthly_by_category` (`year_month, category_id, type, n_txns, total_abs, total_signed`) fournit déjà les agrégats par catégorie et par mois — idéale pour ranking + tendance sans requête lourde. Les noms de catégories viennent de `useCategories`.

## Décisions validées

- **Signal** : classement par taille **et** écart vs habitude (les deux combinés). Aucune nouvelle donnée (réutilise `v_monthly_by_category`).
- **Intégration** : la répartition par catégorie **remplace** la liste plate du Dashboard. Taper une catégorie → drill-down vers ses transactions du mois (réutilise `TxnList`/`TxnRow`, édition par tap conservée).
- **Périmètre** : dépenses uniquement (`type=expense`). Revenus/épargne/transferts restent dans `StatStrip`.
- **Tendance** : `deltaPct` = (mois courant − moyenne des mois précédents) / moyenne. `null` si pas d'historique (« nouveau »).
- **Tests** : Vitest sur la fonction pure. UI vérifiée par tsc/build/smoke.
- **Design** : tokens cream/ink/emerald, Fraunces/Geist ; ↑ dépense (hausse) en terracotta `strat-a`, ↓ en emerald.

## Architecture des fichiers

```
lib/cockpit/
  categories-analysis.ts        # PUR + testé : analyzeCategories ; types CategoryInsight
  categories-analysis.test.ts   # Vitest
  hooks.ts                      # MODIF : + useMonthlyByCategory()

components/cockpit/
  CategoryBreakdown.tsx   # liste classée des postes de dépense (+ barre + tendance)
  CategoryRow.tsx         # 1 ligne : nom, montant, part %, barre, chip tendance

app/cockpit/page.tsx      # MODIF : état drillCategory ; remplace TxnList plat par
                          #   CategoryBreakdown (ou drill = TxnList filtré)
```

Reuse : `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Category`, `Txn`), `@/lib/cockpit/hooks` (`useTransactions` pour le drill), `@/components/cockpit/TxnList`.

## Données

- **`useMonthlyByCategory()`** : `supabase.from("v_monthly_by_category").select("year_month,category_id,type,n_txns,total_abs").eq("user_id", user.id)` → `{ rows, loading, error }`. Type `MonthlyCategoryRow = { year_month: string; category_id: string; type: string; n_txns: number; total_abs: number }`.
- Drill-down : `useTransactions(month)` (déjà dans la page) filtré `t.category_id === drillCategory`.

## Module pur (testé)

```ts
import type { Category } from "./types";

export type MonthlyCategoryRow = {
  year_month: string;
  category_id: string;
  type: string;
  n_txns: number;
  total_abs: number;
};

export type CategoryInsight = {
  categoryId: string;
  name: string;
  total: number;       // dépense du mois
  nTxns: number;
  share: number;       // 0..1, part dans les dépenses du mois
  avgPrior: number;    // moyenne des mois précédents (0 si aucun)
  deltaPct: number | null; // (total-avgPrior)/avgPrior ; null si pas d'historique
};

// Postes de dépense du mois, triés par total décroissant, avec part et tendance.
export function analyzeCategories(
  rows: MonthlyCategoryRow[],
  month: string,            // "YYYY-MM"
  categories: Category[]
): CategoryInsight[];
```

**Algorithme** : ne garder que `type === "expense"`. `current` = lignes du mois ; `totalMonth` = Σ `total_abs` du mois. Pour chaque catégorie présente le mois courant : `total = total_abs` ; `share = totalMonth>0 ? total/totalMonth : 0` ; `avgPrior` = moyenne des `total_abs` des lignes de cette catégorie avec `year_month < month` (0 si aucune) ; `deltaPct = avgPrior>0 ? (total-avgPrior)/avgPrior : null` ; `name` via `categories`. Tri par `total` desc.

**Tests** :
- tri par `total` décroissant ;
- `share` cohérent (Σ ≈ 1) ;
- `deltaPct` correct vs moyenne des mois précédents (ex. mois courant 120, deux mois précédents 100 et 100 → +0.2) ;
- « nouveau » : pas de mois précédent ⇒ `deltaPct = null`, `avgPrior = 0` ;
- filtre dépenses : lignes `income`/`savings`/`transfer` ignorées.

## UI

**`CategoryBreakdown`** (remplace `TxnList` plat) : titre « Dépenses par poste · {mois} », puis une `CategoryRow` par insight (déjà triées). Si aucune dépense : « Aucune dépense ce mois ».

**`CategoryRow`** (tappable, `<button>`) :
- ligne 1 : nom (gauche) · montant `−{eur}` (mono, terracotta) · part `{share%}` · **chip tendance** ;
- ligne 2 : **barre de proportion** (largeur = `share`, fond `rule`, remplissage `ink`/emerald).
- Chip : `deltaPct === null` → « nouveau » (muted) ; `> +0.05` → `↑ +{x}%` (terracotta) ; `< −0.05` → `↓ −{x}%` (emerald) ; sinon « stable » (muted).
- `onClick` → drill sur la catégorie.

**Drill-down** : quand `drillCategory` est posé, la page affiche un en-tête « ‹ Retour · {nom} » + `TxnList` filtré aux transactions de cette catégorie pour le mois (réutilise le composant, `onSelect` ouvre toujours `TxnModal` pour éditer). Le `HeroBand` + `StatStrip` restent affichés.

## Intégration page

`app/cockpit/page.tsx` : ajoute `const [drillCategory, setDrillCategory] = useState<string|null>(null)`. Après `StatStrip` :
- si `drillCategory` : bouton retour (`setDrillCategory(null)`) + nom + `TxnList` filtré `txns.filter(t => t.category_id === drillCategory)` ;
- sinon : `CategoryBreakdown` (insights via `analyzeCategories(useMonthlyByCategory().rows, month, categories)`), `onSelect={setDrillCategory}`.
Le FAB + `TxnModal` (ajout/édition) restent. Changer de mois réinitialise `drillCategory`.

## États & erreurs

- Pas de données catégorie (`v_monthly_by_category` vide / erreur) : message discret ; le reste du Dashboard fonctionne.
- Catégorie sans nom résolu (id absent de `categories`) : fallback sur l'id ou « Autre » (on affiche `categoryId` si non trouvé).
- Drill-down d'une catégorie sans transaction chargée : « Aucune transaction ».

## Hors périmètre

- Budgets par catégorie (signal « budget vs réel » écarté pour cette passe).
- Analyse multi-mois / graphes de tendance par catégorie (juste un chip de delta ici).
- Sous-catégories (BNP en a, le cockpit non).

## Critères de succès

- Le Dashboard montre les dépenses **par poste, classées**, avec part % et tendance vs habitude — plus de liste de 250 lignes.
- Taper un poste affiche ses transactions du mois ; le retour revient à la répartition.
- Les chips de tendance flaggent les postes en hausse (cibles d'optimisation).
- `npm run test` vert (incl. `categories-analysis.test.ts`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
