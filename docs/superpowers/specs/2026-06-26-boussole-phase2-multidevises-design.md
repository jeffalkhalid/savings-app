# Boussole Phase 2 — Multi-devises

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : afficher le patrimoine (total, répartition, valeurs d'actifs) **converti** dans la devise de reporting (`user_settings.reporting_currency`), avec le montant natif en sous-ligne. Taux via l'API gratuite **frankfurter.app**. Le graphe d'évolution reste approximatif (hors périmètre de conversion).

## Décisions validées

- **Taux** : API `frankfurter.app` (`latest?from=EUR`, EUR base, sans clé) ; repli `{ EUR: 1 }` si échec.
- **Étendue** : conversion des **chiffres clés** (total, répartition, liste d'actifs). Le graphe d'évolution reste sur les valorisations brutes (approximation assumée).
- Devises supportées = `CURRENCIES` existant (EUR, USD, GBP, CHF, CAD) — toutes couvertes par frankfurter.
- Chaque actif a une **devise** (`assets.currency`, défaut EUR) ; `current_value` est exprimé dans cette devise.

## Données & sécurité

`supabase/2026-06-26-asset-currency.sql` (exécutée manuellement) :
```sql
alter table public.assets add column if not exists currency text not null default 'EUR';
```
RLS déjà active sur `assets`.

## Modules purs (testés)

### `lib/cockpit/fx.ts`
```ts
// ratesEUR : EUR -> devise (avec EUR = 1). Devise absente → facteur 1 (pas de conversion).
export function convert(
  amount: number,
  from: string,
  to: string,
  ratesEUR: Record<string, number>
): number;
export function money(amount: number, ccy: string): string;
```
- `convert` : `amount * (ratesEUR[to] ?? 1) / (ratesEUR[from] ?? 1)`.
- `money` : `new Intl.NumberFormat("fr-FR", { style: "currency", currency: ccy }).format(amount)`.

**Tests** : EUR→USD (rate 1.1 → ×1.1) ; USD→GBP croisé (via EUR) ; from===to → inchangé ; devise inconnue → ×1 ; `money(1000,"USD")` contient « $ »/« US ».

### `lib/cockpit/patrimoine.ts` (ajout)
```ts
import type { Asset } from "./patrimoine"; // déjà dans le fichier
export function convertedLines(
  assets: Asset[],
  ratesEUR: Record<string, number>,
  reporting: string
): PatrimoineLine[];
```
- Groupe les `assets` par `type` ; `total_value` = Σ `convert(current_value, asset.currency ?? "EUR", reporting, ratesEUR)` ; `n_assets` = nombre. Remplace la source `v_patrimoine` pour l'écran Patrimoine.

**Tests** : 2 actifs EUR + 1 actif USD → ligne par type avec sommes converties ; devise manquante traitée comme EUR ; reporting = EUR → valeurs natives.

## Données / hooks

- **`Asset`** (`patrimoine.ts`) += `currency?: string`. `useAssets` sélectionne `currency` (ajouter à la liste `select`).
- **`patrimoine-api.ts`** : `createAsset`/`updateAsset` acceptent et écrivent `currency` (défaut « EUR »).
- **`useFxRates()`** (`hooks.ts`) : `fetch("https://api.frankfurter.app/latest?from=EUR")` → `{ ratesEUR, date, refetch }` ; `ratesEUR` inclut `EUR: 1` ; en cas d'erreur/HS → `{ EUR: 1 }`, `date` null. (Lecture seule, pas de secret.)

## UI

- **`AssetModal`** : nouveau select **Devise** (`CURRENCIES`), défaut « EUR » ; init `asset?.currency ?? "EUR"`. Passé à `createAsset`/`updateAsset`.
- **`AssetRow`** : prop `ratesEUR` + `reporting`. Valeur affichée = `money(convert(current_value, currency, reporting, ratesEUR), reporting)` ; **sous-ligne** « {money(current_value, currency)} » en plus du type quand `currency !== reporting`.
- **`AssetList`** : relaie `ratesEUR` + `reporting` à `AssetRow`.
- **Page Patrimoine** (`app/cockpit/patrimoine/page.tsx`) :
  - `useFxRates()` → `ratesEUR`, `date` ; `useUserSettings(user.id)` → `reporting = settings.reporting_currency`.
  - `lines = useMemo(() => convertedLines(assets, ratesEUR, reporting), [assets, ratesEUR, reporting])` (remplace `usePatrimoineSummary` pour `lines`/total) ; `total = Σ lines.total_value`.
  - `TypeBreakdown` (via `withShares(lines)`) et `allocationRows(lines, targets)` consomment ces lignes converties.
  - `PatrimoineHero total={total}` ; petite note « Converti en {reporting} · taux du {date} » affichée quand `reporting !== "EUR"`.
  - `AssetList` reçoit `ratesEUR` + `reporting`.
  - Le graphe (`buildPatrimoineSeries`) reste inchangé (valorisations brutes) — approximation assumée.

## États & erreurs

- API FX indisponible : `ratesEUR = { EUR: 1 }` → les actifs EUR restent corrects ; les non-EUR s'affichent à ×1 (montant natif visible) ; pas de crash, pas de note de date.
- Devise d'actif inconnue des taux : facteur 1 (valeur native conservée), sous-ligne native visible.
- `reporting === "EUR"` : aucune conversion (×1), pas de sous-ligne native pour les actifs EUR, pas de note.
- `current_value` 0 / pas d'actifs : total 0, sections vides comme aujourd'hui.

## Hors périmètre

- Conversion de la courbe d'évolution (valorisations historiques) — approximation assumée.
- Devise par opération / conversion du Cockpit (revenus/dépenses) — patrimoine seulement.
- Mémorisation/historisation des taux (on lit le `latest` à chaque chargement ; repli EUR).
- Crypto ou devises hors frankfurter.

## Critères de succès

- Avec la devise de reporting ≠ EUR, le total, la répartition et les valeurs d'actifs s'affichent convertis ; le montant natif reste visible quand la devise diffère.
- Un actif en USD contribue au total converti correctement ; changer la devise de reporting (Réglages) met à jour l'affichage.
- API HS → l'app reste fonctionnelle (EUR correct, pas de crash).
- `npm run test` vert (incl. `fx`, `convertedLines`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-asset-currency.sql`.
