# Boussole Phase 2 — Multi-devises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher le patrimoine (total, répartition, valeurs d'actifs) converti dans la devise de reporting via frankfurter.app, avec le montant natif en sous-ligne. Chaque actif a une devise.

**Architecture:** colonne `assets.currency` + modules purs `fx.ts` (convert/money) et `convertedLines` (patrimoine) + `useFxRates` (frankfurter) + devise dans `AssetModal` + conversion dans `AssetRow`/page Patrimoine.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement**. Devises = `CURRENCIES` (EUR, USD, GBP, CHF, CAD).
- Taux via `https://api.frankfurter.app/latest?from=EUR` (EUR base, sans clé) ; repli `{ EUR: 1 }` si échec — l'app reste fonctionnelle pour EUR.
- Conversion des **chiffres clés** (total, répartition, liste d'actifs) ; le graphe d'évolution reste brut (approximation assumée).
- Modules purs sans I/O ; le fetch FX vit dans le hook.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `assets.currency`

**Files:** Create `supabase/2026-06-26-asset-currency.sql`

- [ ] **Step 1: Create the file**

```sql
-- Multi-devises (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.assets add column if not exists currency text not null default 'EUR';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-asset-currency.sql
git commit -m "feat(fx): SQL migration — assets.currency"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `fx.ts` pure module (TDD)

**Files:** Create `lib/cockpit/fx.ts`, `lib/cockpit/fx.test.ts`

**Interfaces:**
- Produces: `convert(amount, from, to, ratesEUR): number`; `money(amount, ccy): string`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/fx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convert, money } from "./fx";

const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };

describe("convert", () => {
  it("converts EUR to USD", () => {
    expect(convert(100, "EUR", "USD", rates)).toBeCloseTo(110);
  });
  it("converts USD to GBP via EUR", () => {
    expect(convert(110, "USD", "GBP", rates)).toBeCloseTo(85);
  });
  it("leaves same-currency unchanged", () => {
    expect(convert(50, "USD", "USD", rates)).toBe(50);
  });
  it("uses factor 1 for an unknown currency", () => {
    expect(convert(50, "JPY", "EUR", rates)).toBe(50);
  });
});

describe("money", () => {
  it("formats with the given currency", () => {
    expect(money(1000, "USD")).toMatch(/\$|US/);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- fx` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/fx.ts`:

```ts
// ratesEUR : taux EUR -> devise (EUR = 1). Devise absente → facteur 1.
export function convert(
  amount: number,
  from: string,
  to: string,
  ratesEUR: Record<string, number>
): number {
  const rf = ratesEUR[from] ?? 1;
  const rt = ratesEUR[to] ?? 1;
  return amount * (rt / rf);
}

export function money(amount: number, ccy: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: ccy,
  }).format(amount);
}
```

- [ ] **Step 4: Run** `npm run test -- fx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/fx.ts lib/cockpit/fx.test.ts
git commit -m "feat(fx): convert + money pure module with tests"
```

---

## Task 3: `Asset.currency` + `convertedLines` (TDD)

**Files:** Modify `lib/cockpit/patrimoine.ts`, `lib/cockpit/patrimoine.test.ts`

**Interfaces:**
- Consumes: `convert` from `./fx` (Task 2).
- Produces: `Asset.currency?: string`; `convertedLines(assets, ratesEUR, reporting): PatrimoineLine[]`.

- [ ] **Step 1: Add the failing test** — append to `lib/cockpit/patrimoine.test.ts` (add `convertedLines` to the existing `./patrimoine` import):

```ts
describe("convertedLines", () => {
  const rates = { EUR: 1, USD: 1.1 };
  it("groups by type and sums converted values", () => {
    const assets = [
      { id: "1", account_id: null, name: "A", type: "stock", current_value: 100, currency: "EUR" },
      { id: "2", account_id: null, name: "B", type: "stock", current_value: 100, currency: "USD" },
      { id: "3", account_id: null, name: "C", type: "savings", current_value: 50, currency: "EUR" },
    ];
    const lines = convertedLines(assets, rates, "EUR");
    const stock = lines.find((l) => l.type === "stock")!;
    expect(stock.n_assets).toBe(2);
    expect(stock.total_value).toBeCloseTo(100 + 100 / 1.1);
  });
  it("treats a missing currency as EUR", () => {
    const lines = convertedLines(
      [{ id: "1", account_id: null, name: "A", type: "cash", current_value: 200 }],
      { EUR: 1 },
      "EUR"
    );
    expect(lines[0].total_value).toBe(200);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- patrimoine` → FAIL.

- [ ] **Step 3: Implement** — in `lib/cockpit/patrimoine.ts`:

(a) Add `currency?: string;` to the `Asset` type (after `quantity`).
(b) Add the import at the top: `import { convert } from "./fx";`
(c) Append:
```ts
export function convertedLines(
  assets: Asset[],
  ratesEUR: Record<string, number>,
  reporting: string
): PatrimoineLine[] {
  const byType: Record<string, { n: number; total: number }> = {};
  for (const a of assets) {
    const v = convert(
      Number(a.current_value),
      a.currency ?? "EUR",
      reporting,
      ratesEUR
    );
    const slot = byType[a.type] ?? { n: 0, total: 0 };
    slot.n += 1;
    slot.total += v;
    byType[a.type] = slot;
  }
  return Object.entries(byType).map(([type, s]) => ({
    type,
    n_assets: s.n,
    total_value: s.total,
  }));
}
```

- [ ] **Step 4: Run** `npm run test -- patrimoine` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/patrimoine.ts lib/cockpit/patrimoine.test.ts
git commit -m "feat(fx): Asset.currency + convertedLines with tests"
```

---

## Task 4: Asset currency — hook select, API, AssetModal

**Files:** Modify `lib/cockpit/hooks.ts`, `lib/cockpit/patrimoine-api.ts`, `components/cockpit/patrimoine/AssetModal.tsx`

**Interfaces:**
- Produces: `useAssets` returns `currency`; `createAsset`/`updateAsset` accept `currency`; `AssetModal` has a currency select.

- [ ] **Step 1: `useAssets` select** — in `lib/cockpit/hooks.ts`, in `useAssets`, change the select string to include `currency`:
```ts
      .select("id,account_id,name,type,current_value,ticker,quantity,currency")
```

- [ ] **Step 2: `patrimoine-api.ts`** — add `currency` to both inputs and writes:

In `createAsset`, add `currency: string;` to the input type and `currency: input.currency,` to the `.insert({...})` object.
In `updateAsset`, add `currency: string;` to the input type and `currency: input.currency,` to the `.update({...})` object.

- [ ] **Step 3: `AssetModal.tsx`** — add the currency select.

(a) Add import: `import { CURRENCIES } from "@/lib/cockpit/settings";`
(b) Add state (after `accountId`):
```tsx
  const [currency, setCurrency] = useState(asset?.currency ?? "EUR");
```
(c) Add `currency,` to BOTH the `updateAsset({...})` and `createAsset({...})` calls.
(d) Add the select in the form, after the Type `<label>` block:
```tsx
          <label className={labelCls}>
            Devise
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
```
(Use the existing class const names in that file — `field` and `labelCls`.)

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/hooks.ts lib/cockpit/patrimoine-api.ts components/cockpit/patrimoine/AssetModal.tsx
git commit -m "feat(fx): asset currency (select + persisted)"
```

---

## Task 5: `useFxRates` + converted `AssetRow`/`AssetList`

**Files:** Modify `lib/cockpit/hooks.ts`, `components/cockpit/patrimoine/AssetRow.tsx`, `components/cockpit/patrimoine/AssetList.tsx`

**Interfaces:**
- Produces: `useFxRates(): { ratesEUR, date, refetch }`; `AssetRow`/`AssetList` gain `ratesEUR` + `reporting`.

- [ ] **Step 1: `useFxRates` in `hooks.ts`** — append:

```ts
export function useFxRates() {
  const [ratesEUR, setRatesEUR] = useState<Record<string, number>>({ EUR: 1 });
  const [date, setDate] = useState<string | null>(null);

  const refetch = useCallback(() => {
    fetch("https://api.frankfurter.app/latest?from=EUR")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fx"))))
      .then((j: { rates?: Record<string, number>; date?: string }) => {
        setRatesEUR({ EUR: 1, ...(j.rates ?? {}) });
        setDate(j.date ?? null);
      })
      .catch(() => {
        setRatesEUR({ EUR: 1 });
        setDate(null);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ratesEUR, date, refetch };
}
```

- [ ] **Step 2: `AssetRow.tsx`** — convert the value, show native sub-line.

Replace the file with:
```tsx
import { typeLabel } from "@/lib/cockpit/patrimoine";
import { assetIcon } from "@/lib/cockpit/asset-icon";
import { convert, money } from "@/lib/cockpit/fx";
import type { Asset } from "@/lib/cockpit/patrimoine";

export function AssetRow({
  asset,
  accountName,
  ratesEUR,
  reporting,
  onClick,
}: {
  asset: Asset;
  accountName?: string;
  ratesEUR: Record<string, number>;
  reporting: string;
  onClick: () => void;
}) {
  const Icon = assetIcon(asset.type);
  const ccy = asset.currency ?? "EUR";
  const converted = convert(Number(asset.current_value), ccy, reporting, ratesEUR);
  const sub = [typeLabel(asset.type), accountName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 border-b border-rule text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={18} className="text-ink2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{asset.name}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>
      </div>
      <div className="text-right shrink-0">
        <strong className="font-mono-num text-sm">{money(converted, reporting)}</strong>
        {ccy !== reporting && (
          <div className="font-mono-num text-[11px] text-ink-muted mt-0.5">
            {money(Number(asset.current_value), ccy)}
          </div>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 3: `AssetList.tsx`** — relay `ratesEUR` + `reporting`.

Add `ratesEUR: Record<string, number>;` and `reporting: string;` to the props type + destructure, and pass them to each `<AssetRow … ratesEUR={ratesEUR} reporting={reporting} />`.

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit`. Expected: an error only in `app/cockpit/patrimoine/page.tsx` (AssetList now needs `ratesEUR`/`reporting`) — fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/hooks.ts components/cockpit/patrimoine/AssetRow.tsx components/cockpit/patrimoine/AssetList.tsx
git commit -m "feat(fx): useFxRates + converted asset rows (native sub-line)"
```

---

## Task 6: Wire the Patrimoine page

**Files:** Modify `app/cockpit/patrimoine/page.tsx`

- [ ] **Step 1: Imports + hooks**

- In the hooks import block, **remove** `usePatrimoineSummary` and **add** `useFxRates`, `useUserSettings`.
- Add `import { convertedLines } from "@/lib/cockpit/patrimoine";` (alongside the existing `buildPatrimoineSeries` import — combine into one import line).
- Add `import { money } from "@/lib/cockpit/fx";`

- [ ] **Step 2: Replace the data derivation**

Remove the line:
```tsx
  const { lines, refetch: refetchSummary } = usePatrimoineSummary(user.id);
```
Add (near the other hooks):
```tsx
  const { ratesEUR, date: fxDate } = useFxRates();
  const { settings } = useUserSettings(user.id);
  const reporting = settings.reporting_currency;
```
Replace the `total`/`lines` derivation. Add after `series`:
```tsx
  const lines = useMemo(
    () => convertedLines(assets, ratesEUR, reporting),
    [assets, ratesEUR, reporting]
  );
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
```
(Delete the old `const total = lines.reduce(...)` comment block that referenced v_patrimoine, and the old `total` line.)

In `refetchAll`, remove the `refetchSummary();` call (keep `refetchAssets`/`refetchVals`).

- [ ] **Step 3: Header note + AssetList props**

Under the `<header>` (after the `<h1>`), add a conversion note when reporting ≠ EUR:
```tsx
        {reporting !== "EUR" && (
          <p className="text-[11px] text-ink-muted mt-1">
            Converti en {reporting}
            {fxDate ? ` · taux du ${fxDate}` : ""}
          </p>
        )}
```
Pass the new props to `<AssetList … />`:
```tsx
        ratesEUR={ratesEUR}
        reporting={reporting}
```

- [ ] **Step 4: Type-check + build** — Run `npx tsc --noEmit` → clean ; `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/cockpit/patrimoine/page.tsx
git commit -m "feat(fx): Patrimoine converted to reporting currency"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `fx`, `convertedLines`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-asset-currency.sql` first.** Then:
  1. Add/edit an asset → a **Devise** select (EUR/USD/GBP/CHF/CAD) is present; set one to USD.
  2. With reporting = EUR (Réglages), the USD asset shows its EUR-converted value + a native « … $ » sub-line; total/répartition include the converted amount.
  3. Switch reporting currency in Réglages → Patrimoine total, répartition and asset values re-convert; the « Converti en … · taux du … » note appears.
  4. Block the network (or offline) → app still loads, EUR assets correct, no crash (rates fall back to EUR only).
  5. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(fx): Phase 2 multi-currency verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; fx pure (2) ; Asset.currency + convertedLines (3) ; currency select/persist (4) ; useFxRates + converted rows (5) ; page conversion + note (6) ; verification incl. SQL-first + offline fallback + light/dark (7). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `convert`/`money` (2) used by patrimoine (3), AssetRow (5), page (6) ; `Asset.currency` (3) read by convertedLines/AssetRow ; `convertedLines` (3) used by page (6) ; `useFxRates` returns `{ ratesEUR, date, refetch }` consumed by page (6) ; `AssetList`/`AssetRow` gain `ratesEUR`+`reporting` supplied by page (6).
- **v_patrimoine:** the page stops using `usePatrimoineSummary`; `lines` now come from `convertedLines(assets, …)`. The hook/view remain in the codebase, just unused by this screen.
- **Resilience:** FX fetch failure → `{ EUR: 1 }`; unknown currency → factor 1 (native preserved). No secret/key (frankfurter is open).
- **Branch note:** continues `boussole-redesign`; docs on the branch.
