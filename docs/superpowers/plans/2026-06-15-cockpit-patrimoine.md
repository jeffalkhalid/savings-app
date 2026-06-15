# Cockpit — Vue Patrimoine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la vue Patrimoine du cockpit — consolidation par type (via `v_patrimoine`), courbe d'évolution (reconstruite depuis `asset_valuations`) et liste d'assets — avec un CRUD minimal (créer/corriger/supprimer assets et valuations).

**Architecture:** Module pur testé `lib/cockpit/patrimoine.ts` (séries + parts + libellés), mutations Supabase isolées dans `lib/cockpit/patrimoine-api.ts`, lectures via hooks ajoutés à `lib/cockpit/hooks.ts`, composants présentationnels sous `components/cockpit/patrimoine/`, page `app/cockpit/patrimoine/page.tsx` qui assemble. recharts (déjà installé) pour la courbe.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, Tailwind 3, Supabase JS, recharts, lucide-react, Vitest.

---

## File structure

```
lib/cockpit/
  patrimoine.ts        # PUR + testé : Asset, AssetValuation, PatrimoineLine ;
                       #   latestValue, buildPatrimoineSeries, withShares, typeLabel
  patrimoine.test.ts   # Vitest
  patrimoine-api.ts    # mutations Supabase : create/update/deleteAsset,
                       #   add/update/deleteValuation (+ syncCurrentValue interne)
  hooks.ts             # (étendu) useAssets, useAssetValuations, usePatrimoineSummary

components/cockpit/patrimoine/
  PatrimoineHero.tsx   PatrimoineChart.tsx  TypeBreakdown.tsx
  AssetRow.tsx         AssetList.tsx
  AssetModal.tsx       ValuationModal.tsx

app/cockpit/patrimoine/page.tsx   # remplace le placeholder
```

Reuse existing: `@/lib/cockpit/format` (`eur`, `todayISO`), `@/lib/cockpit/types` (`Account`), `@/lib/cockpit/supabase` (`supabase`), `@/lib/cockpit/hooks` (`useAuth`, `useAccounts`), `@/components/cockpit/Fab`.

---

## Task 1: Pure patrimoine module (TDD)

**Files:**
- Create: `lib/cockpit/patrimoine.ts`
- Test: `lib/cockpit/patrimoine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/patrimoine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  latestValue,
  buildPatrimoineSeries,
  withShares,
  typeLabel,
} from "./patrimoine";
import type { Asset, AssetValuation } from "./patrimoine";

const asset = (id: string, type = "stock"): Asset => ({
  id,
  account_id: null,
  name: id,
  type,
  current_value: 0,
});
const val = (id: string, asset_id: string, date: string, value: number): AssetValuation => ({
  id,
  asset_id,
  date,
  value,
});

describe("latestValue", () => {
  it("returns 0 for an empty list", () => {
    expect(latestValue([])).toBe(0);
  });
  it("returns the value of the most recent date", () => {
    expect(
      latestValue([
        val("v1", "a", "2026-01-01", 100),
        val("v2", "a", "2026-03-01", 300),
        val("v3", "a", "2026-02-01", 200),
      ])
    ).toBe(300);
  });
});

describe("buildPatrimoineSeries", () => {
  it("returns one point per valuation date for a single asset", () => {
    const series = buildPatrimoineSeries(
      [asset("a")],
      [val("v1", "a", "2026-01-01", 100), val("v2", "a", "2026-02-01", 150)]
    );
    expect(series).toEqual([
      { date: "2026-01-01", total: 100 },
      { date: "2026-02-01", total: 150 },
    ]);
  });

  it("carries each asset's latest value forward (step behaviour)", () => {
    // asset a valued in Jan; asset b appears in Feb. Feb total = latest(a)+b.
    const series = buildPatrimoineSeries(
      [asset("a"), asset("b")],
      [
        val("v1", "a", "2026-01-01", 100),
        val("v2", "b", "2026-02-01", 50),
        val("v3", "a", "2026-02-01", 120),
      ]
    );
    expect(series).toEqual([
      { date: "2026-01-01", total: 100 },
      { date: "2026-02-01", total: 170 },
    ]);
  });

  it("ignores valuations belonging to unknown (deleted) assets", () => {
    const series = buildPatrimoineSeries(
      [asset("a")],
      [val("v1", "a", "2026-01-01", 100), val("vx", "ghost", "2026-01-01", 999)]
    );
    expect(series).toEqual([{ date: "2026-01-01", total: 100 }]);
  });

  it("returns an empty array when there are no valuations", () => {
    expect(buildPatrimoineSeries([asset("a")], [])).toEqual([]);
  });
});

describe("withShares", () => {
  it("computes each line's share of the total", () => {
    const rows = withShares([
      { type: "stock", n_assets: 1, total_value: 750 },
      { type: "savings", n_assets: 2, total_value: 250 },
    ]);
    expect(rows[0].share).toBeCloseTo(0.75);
    expect(rows[1].share).toBeCloseTo(0.25);
  });
  it("gives 0 shares when the total is 0", () => {
    const rows = withShares([{ type: "commodity", n_assets: 2, total_value: 0 }]);
    expect(rows[0].share).toBe(0);
  });
});

describe("typeLabel", () => {
  it("maps known types to FR labels", () => {
    expect(typeLabel("stock")).toBe("Actions");
    expect(typeLabel("savings")).toBe("Livrets");
    expect(typeLabel("cash")).toBe("Liquidités");
    expect(typeLabel("commodity")).toBe("Or");
  });
  it("falls back to the raw type when unknown", () => {
    expect(typeLabel("crypto")).toBe("crypto");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- patrimoine`
Expected: FAIL — `Cannot find module './patrimoine'`.

- [ ] **Step 3: Implement patrimoine.ts**

Create `lib/cockpit/patrimoine.ts`:

```ts
export type Asset = {
  id: string;
  account_id: string | null;
  name: string;
  type: string;
  current_value: number;
  ticker?: string | null;
  quantity?: number | null;
};

export type AssetValuation = {
  id: string;
  asset_id: string;
  date: string; // YYYY-MM-DD
  value: number;
};

export type PatrimoineLine = {
  type: string;
  n_assets: number;
  total_value: number;
};

// Most recent valuation by date; 0 if the list is empty.
export function latestValue(valuations: AssetValuation[]): number {
  if (!valuations.length) return 0;
  const latest = valuations.reduce((a, b) => (b.date > a.date ? b : a));
  return Number(latest.value);
}

// Net worth over time: for each date present in valuations (of known assets),
// sum over assets of the latest valuation on or before that date.
export function buildPatrimoineSeries(
  assets: Asset[],
  valuations: AssetValuation[]
): { date: string; total: number }[] {
  const known = new Set(assets.map((a) => a.id));
  const vals = valuations.filter((v) => known.has(v.asset_id));

  const byAsset = new Map<string, AssetValuation[]>();
  for (const v of vals) {
    const arr = byAsset.get(v.asset_id) ?? [];
    arr.push(v);
    byAsset.set(v.asset_id, arr);
  }

  const dates = [...new Set(vals.map((v) => v.date))].sort();
  return dates.map((date) => {
    let total = 0;
    for (const arr of byAsset.values()) {
      const upTo = arr.filter((v) => v.date <= date);
      total += latestValue(upTo);
    }
    return { date, total };
  });
}

export function withShares(
  lines: PatrimoineLine[]
): (PatrimoineLine & { share: number })[] {
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  return lines.map((l) => ({
    type: l.type,
    n_assets: Number(l.n_assets),
    total_value: Number(l.total_value),
    share: total > 0 ? Number(l.total_value) / total : 0,
  }));
}

const TYPE_LABELS: Record<string, string> = {
  stock: "Actions",
  savings: "Livrets",
  cash: "Liquidités",
  commodity: "Or",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- patrimoine`
Expected: PASS (all patrimoine tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/patrimoine.ts lib/cockpit/patrimoine.test.ts
git commit -m "feat(patrimoine): add pure patrimoine module with tests"
```

---

## Task 2: Mutations API

**Files:**
- Create: `lib/cockpit/patrimoine-api.ts`

No unit test (Supabase-bound); verified by `npx tsc --noEmit` and the smoke test in Task 7.

- [ ] **Step 1: Implement patrimoine-api.ts**

Create `lib/cockpit/patrimoine-api.ts`:

```ts
import { supabase } from "./supabase";
import { latestValue } from "./patrimoine";
import type { AssetValuation } from "./patrimoine";

// Recompute an asset's current_value from its remaining valuations.
async function syncCurrentValue(assetId: string): Promise<void> {
  const { data, error } = await supabase
    .from("asset_valuations")
    .select("id,asset_id,date,value")
    .eq("asset_id", assetId);
  if (error) throw new Error(error.message);
  const cv = latestValue((data as AssetValuation[]) ?? []);
  const { error: uErr } = await supabase
    .from("assets")
    .update({ current_value: cv })
    .eq("id", assetId);
  if (uErr) throw new Error(uErr.message);
}

export async function createAsset(input: {
  userId: string;
  name: string;
  type: string;
  accountId: string | null;
  ticker: string | null;
  quantity: number | null;
  initialValue: number;
  date: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      name: input.name,
      type: input.type,
      current_value: input.initialValue,
      ticker: input.ticker,
      quantity: input.quantity,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const assetId = (data as { id: string }).id;
  const { error: vErr } = await supabase.from("asset_valuations").insert({
    user_id: input.userId,
    asset_id: assetId,
    date: input.date,
    value: input.initialValue,
  });
  if (vErr) throw new Error(vErr.message);
  return assetId;
}

export async function updateAsset(input: {
  id: string;
  name: string;
  type: string;
  accountId: string | null;
  ticker: string | null;
  quantity: number | null;
}): Promise<void> {
  const { error } = await supabase
    .from("assets")
    .update({
      name: input.name,
      type: input.type,
      account_id: input.accountId,
      ticker: input.ticker,
      quantity: input.quantity,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteAsset(assetId: string): Promise<void> {
  // Delete valuations first (no reliance on ON DELETE CASCADE).
  const { error: vErr } = await supabase
    .from("asset_valuations")
    .delete()
    .eq("asset_id", assetId);
  if (vErr) throw new Error(vErr.message);
  const { error } = await supabase.from("assets").delete().eq("id", assetId);
  if (error) throw new Error(error.message);
}

export async function addValuation(input: {
  userId: string;
  assetId: string;
  date: string;
  value: number;
}): Promise<void> {
  const { error } = await supabase.from("asset_valuations").insert({
    user_id: input.userId,
    asset_id: input.assetId,
    date: input.date,
    value: input.value,
  });
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}

export async function updateValuation(input: {
  id: string;
  assetId: string;
  date: string;
  value: number;
}): Promise<void> {
  const { error } = await supabase
    .from("asset_valuations")
    .update({ date: input.date, value: input.value })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}

export async function deleteValuation(input: {
  id: string;
  assetId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("asset_valuations")
    .delete()
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  await syncCurrentValue(input.assetId);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/patrimoine-api.ts
git commit -m "feat(patrimoine): add Supabase mutations with current_value sync"
```

---

## Task 3: Read hooks

**Files:**
- Modify: `lib/cockpit/hooks.ts` (append three hooks)

- [ ] **Step 1: Add the imports**

In `lib/cockpit/hooks.ts`, add this import after the existing `import type { Txn, Category, Account } from "./types";` line:

```ts
import type { Asset, AssetValuation, PatrimoineLine } from "./patrimoine";
```

- [ ] **Step 2: Append the three hooks at the end of the file**

Append to `lib/cockpit/hooks.ts`:

```ts
export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("assets")
      .select("id,account_id,name,type,current_value,ticker,quantity")
      .order("name")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setAssets((data as Asset[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { assets, loading, error, refetch };
}

export function useAssetValuations() {
  const [valuations, setValuations] = useState<AssetValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("asset_valuations")
      .select("id,asset_id,date,value")
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setValuations((data as AssetValuation[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { valuations, loading, error, refetch };
}

export function usePatrimoineSummary(userId: string) {
  const [lines, setLines] = useState<PatrimoineLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("v_patrimoine")
      .select("type,n_assets,total_value")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setLines((data as PatrimoineLine[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { lines, loading, error, refetch };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/hooks.ts
git commit -m "feat(patrimoine): add useAssets/useAssetValuations/usePatrimoineSummary hooks"
```

---

## Task 4: Read components

**Files:**
- Create: `components/cockpit/patrimoine/PatrimoineHero.tsx`
- Create: `components/cockpit/patrimoine/PatrimoineChart.tsx`
- Create: `components/cockpit/patrimoine/TypeBreakdown.tsx`
- Create: `components/cockpit/patrimoine/AssetRow.tsx`
- Create: `components/cockpit/patrimoine/AssetList.tsx`

- [ ] **Step 1: PatrimoineHero.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";

export function PatrimoineHero({
  total,
  delta,
}: {
  total: number;
  delta: number | null;
}) {
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine total
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(total)}
      </div>
      {delta !== null && (
        <div
          className={`font-mono-num text-sm mt-2 ${
            delta >= 0 ? "text-emerald" : "text-strat-a"
          }`}
        >
          {delta >= 0 ? "▲" : "▼"} {eur(Math.abs(delta))} depuis la dernière
          valorisation
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PatrimoineChart.tsx**

```tsx
"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";

export function PatrimoineChart({
  series,
}: {
  series: { date: string; total: number }[];
}) {
  if (series.length < 2) {
    return (
      <p className="text-ink-muted text-sm py-8 text-center">
        Pas encore assez d&apos;historique pour tracer une courbe.
      </p>
    );
  }
  return (
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B5E40" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1B5E40" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#6B6E76" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => eur(v)}
            labelStyle={{ color: "#1A1B1F" }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="url(#patGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: TypeBreakdown.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import { withShares, typeLabel } from "@/lib/cockpit/patrimoine";
import type { PatrimoineLine } from "@/lib/cockpit/patrimoine";

export function TypeBreakdown({ lines }: { lines: PatrimoineLine[] }) {
  const rows = withShares(lines);
  if (!rows.length) return null;
  return (
    <section className="mb-6">
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Répartition
      </div>
      {rows.map((r) => (
        <div
          key={r.type}
          className="flex justify-between items-center py-2 border-b border-rule"
        >
          <div>
            <div className="text-sm">{typeLabel(r.type)}</div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {r.n_assets} ligne{r.n_assets > 1 ? "s" : ""} ·{" "}
              {Math.round(r.share * 100)}%
            </div>
          </div>
          <strong className="font-mono-num text-sm">{eur(r.total_value)}</strong>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: AssetRow.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import { typeLabel } from "@/lib/cockpit/patrimoine";
import type { Asset } from "@/lib/cockpit/patrimoine";

export function AssetRow({
  asset,
  accountName,
  onClick,
}: {
  asset: Asset;
  accountName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex justify-between items-center py-3 border-b border-rule text-left"
    >
      <div>
        <div className="text-sm">{asset.name}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {typeLabel(asset.type)}
          {accountName ? ` · ${accountName}` : ""}
        </div>
      </div>
      <strong className="font-mono-num text-sm">
        {eur(Number(asset.current_value))}
      </strong>
    </button>
  );
}
```

- [ ] **Step 5: AssetList.tsx**

```tsx
import type { Asset } from "@/lib/cockpit/patrimoine";
import type { Account } from "@/lib/cockpit/types";
import { AssetRow } from "./AssetRow";

export function AssetList({
  assets,
  accounts,
  loading,
  error,
  onSelect,
}: {
  assets: Asset[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  onSelect: (a: Asset) => void;
}) {
  const nameOf = (id: string | null) =>
    accounts.find((c) => c.id === id)?.name;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Lignes · {assets.length}
      </div>
      {error && <p className="text-strat-a text-sm py-4">{error}</p>}
      {loading && !assets.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !assets.length && (
        <p className="text-ink-muted text-sm py-4">
          Aucun asset — ajoute ta première ligne.
        </p>
      )}
      {assets.map((a) => (
        <AssetRow
          key={a.id}
          asset={a}
          accountName={nameOf(a.account_id)}
          onClick={() => onSelect(a)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/patrimoine/PatrimoineHero.tsx components/cockpit/patrimoine/PatrimoineChart.tsx components/cockpit/patrimoine/TypeBreakdown.tsx components/cockpit/patrimoine/AssetRow.tsx components/cockpit/patrimoine/AssetList.tsx
git commit -m "feat(patrimoine): add read components (hero, chart, breakdown, asset list)"
```

---

## Task 5: CRUD modals

**Files:**
- Create: `components/cockpit/patrimoine/AssetModal.tsx`
- Create: `components/cockpit/patrimoine/ValuationModal.tsx`

- [ ] **Step 1: AssetModal.tsx**

```tsx
"use client";

import { useState } from "react";
import { createAsset, updateAsset, deleteAsset } from "@/lib/cockpit/patrimoine-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Account } from "@/lib/cockpit/types";
import type { Asset } from "@/lib/cockpit/patrimoine";

const TYPES = [
  { v: "stock", label: "Actions (PEA, Natixis)" },
  { v: "savings", label: "Livrets" },
  { v: "cash", label: "Liquidités" },
  { v: "commodity", label: "Or / matières" },
];

export function AssetModal({
  userId,
  accounts,
  asset,
  onClose,
  onSaved,
}: {
  userId: string;
  accounts: Account[];
  asset: Asset | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!asset;
  const [name, setName] = useState(asset?.name ?? "");
  const [type, setType] = useState(asset?.type ?? "stock");
  const [accountId, setAccountId] = useState(asset?.account_id ?? accounts[0]?.id ?? "");
  const [ticker, setTicker] = useState(asset?.ticker ?? "");
  const [quantity, setQuantity] = useState(
    asset?.quantity != null ? String(asset.quantity) : ""
  );
  const [initialValue, setInitialValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    const qty = quantity.trim() ? parseFloat(quantity.replace(",", ".")) : null;
    setSaving(true);
    try {
      if (editing && asset) {
        await updateAsset({
          id: asset.id,
          name: name.trim(),
          type,
          accountId: accountId || null,
          ticker: ticker.trim() || null,
          quantity: qty,
        });
      } else {
        const v = parseFloat(initialValue.replace(",", "."));
        if (!isFinite(v)) {
          setError("Valeur initiale invalide");
          setSaving(false);
          return;
        }
        await createAsset({
          userId,
          name: name.trim(),
          type,
          accountId: accountId || null,
          ticker: ticker.trim() || null,
          quantity: qty,
          initialValue: v,
          date: todayISO(),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!asset) return;
    setError("");
    setSaving(true);
    try {
      await deleteAsset(asset.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">
            {editing ? "Modifier l'asset" : "Nouvel asset"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-3">
          <label className={labelCls}>
            Nom
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className={labelCls}>
            Type
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Compte
            <select
              className={field}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Ticker (optionnel)
            <input
              className={field}
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Quantité (optionnel)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {!editing && (
            <label className={labelCls}>
              Valeur actuelle (€)
              <input
                className={field}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={initialValue}
                onChange={(e) => setInitialValue(e.target.value)}
                required
              />
            </label>
          )}
          <button
            className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-strat-a text-sm py-2"
            >
              Supprimer cet asset
            </button>
          )}
          {error && <p className="text-strat-a text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ValuationModal.tsx**

```tsx
"use client";

import { useState } from "react";
import {
  addValuation,
  updateValuation,
  deleteValuation,
} from "@/lib/cockpit/patrimoine-api";
import { eur, todayISO } from "@/lib/cockpit/format";
import type { Asset, AssetValuation } from "@/lib/cockpit/patrimoine";

export function ValuationModal({
  userId,
  asset,
  valuations,
  onClose,
  onChanged,
  onEditAsset,
}: {
  userId: string;
  asset: Asset;
  valuations: AssetValuation[];
  onClose: () => void;
  onChanged: () => void;
  onEditAsset: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = [...valuations].sort((a, b) => (a.date < b.date ? 1 : -1));
  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const v = parseFloat(value.replace(",", "."));
    if (!isFinite(v)) {
      setError("Valeur invalide");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateValuation({ id: editId, assetId: asset.id, date, value: v });
      } else {
        await addValuation({ userId, assetId: asset.id, date, value: v });
      }
      setValue("");
      setEditId(null);
      setDate(todayISO());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
    setSaving(false);
  };

  const startEdit = (val: AssetValuation) => {
    setEditId(val.id);
    setDate(val.date);
    setValue(String(val.value));
  };

  const remove = async (val: AssetValuation) => {
    setError("");
    setSaving(true);
    try {
      await deleteValuation({ id: val.id, assetId: asset.id });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">{asset.name}</h2>
          <div className="flex items-center gap-3">
            <button
              className="text-ink-muted text-sm"
              onClick={onEditAsset}
              type="button"
            >
              Modifier la ligne
            </button>
            <button className="text-ink-muted text-sm" onClick={onClose} type="button">
              Fermer
            </button>
          </div>
        </header>

        <form
          onSubmit={submit}
          className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-5"
        >
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Date
            <input
              className={field}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Valeur (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </label>
          <button
            className="bg-emerald text-paper rounded-lg py-3 px-4 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {editId ? "OK" : "+"}
          </button>
        </form>
        {error && <p className="text-strat-a text-sm mb-3">{error}</p>}

        <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
          Historique
        </div>
        {!rows.length && (
          <p className="text-ink-muted text-sm py-2">Aucune valuation.</p>
        )}
        {rows.map((val) => (
          <div
            key={val.id}
            className="flex justify-between items-center py-2 border-b border-rule"
          >
            <div className="font-mono-num text-sm">{val.date}</div>
            <div className="flex items-center gap-3">
              <span className="font-mono-num text-sm">{eur(Number(val.value))}</span>
              <button
                type="button"
                onClick={() => startEdit(val)}
                className="text-ink-muted text-xs"
              >
                Éditer
              </button>
              <button
                type="button"
                onClick={() => remove(val)}
                className="text-strat-a text-xs"
              >
                Suppr.
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/patrimoine/AssetModal.tsx components/cockpit/patrimoine/ValuationModal.tsx
git commit -m "feat(patrimoine): add asset + valuation CRUD modals"
```

---

## Task 6: Assemble the Patrimoine page

**Files:**
- Modify (full rewrite): `app/cockpit/patrimoine/page.tsx`

- [ ] **Step 1: Replace the placeholder with the real view**

Replace the entire contents of `app/cockpit/patrimoine/page.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  useAuth,
  useAccounts,
  useAssets,
  useAssetValuations,
  usePatrimoineSummary,
} from "@/lib/cockpit/hooks";
import { buildPatrimoineSeries } from "@/lib/cockpit/patrimoine";
import type { Asset } from "@/lib/cockpit/patrimoine";
import { PatrimoineHero } from "@/components/cockpit/patrimoine/PatrimoineHero";
import { PatrimoineChart } from "@/components/cockpit/patrimoine/PatrimoineChart";
import { TypeBreakdown } from "@/components/cockpit/patrimoine/TypeBreakdown";
import { AssetList } from "@/components/cockpit/patrimoine/AssetList";
import { AssetModal } from "@/components/cockpit/patrimoine/AssetModal";
import { ValuationModal } from "@/components/cockpit/patrimoine/ValuationModal";
import { Fab } from "@/components/cockpit/Fab";

export default function PatrimoinePage() {
  const user = useAuth();
  const { assets, loading: aLoading, error: aError, refetch: refetchAssets } =
    useAssets();
  const { valuations, refetch: refetchVals } = useAssetValuations();
  const { lines, refetch: refetchSummary } = usePatrimoineSummary(user.id);
  const { accounts } = useAccounts();

  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);

  const series = useMemo(
    () => buildPatrimoineSeries(assets, valuations),
    [assets, valuations]
  );
  const total = lines.reduce((a, l) => a + Number(l.total_value), 0);
  const delta =
    series.length >= 2
      ? series[series.length - 1].total - series[series.length - 2].total
      : null;

  const refetchAll = () => {
    refetchAssets();
    refetchVals();
    refetchSummary();
  };

  const selectedValuations = selected
    ? valuations.filter((v) => v.asset_id === selected.id)
    : [];

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Patrimoine</h1>
      </header>

      <PatrimoineHero total={total} delta={delta} />
      <PatrimoineChart series={series} />
      <TypeBreakdown lines={lines} />
      <AssetList
        assets={assets}
        accounts={accounts}
        loading={aLoading}
        error={aError}
        onSelect={setSelected}
      />

      <Fab onClick={() => setShowCreate(true)} />

      {showCreate && (
        <AssetModal
          userId={user.id}
          accounts={accounts}
          asset={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            refetchAll();
            setShowCreate(false);
          }}
        />
      )}

      {editAsset && (
        <AssetModal
          userId={user.id}
          accounts={accounts}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSaved={() => {
            refetchAll();
            setEditAsset(null);
          }}
        />
      )}

      {selected && (
        <ValuationModal
          userId={user.id}
          asset={selected}
          valuations={selectedValuations}
          onClose={() => setSelected(null)}
          onChanged={refetchAll}
          onEditAsset={() => {
            setEditAsset(selected);
            setSelected(null);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/patrimoine/page.tsx
git commit -m "feat(patrimoine): assemble patrimoine view with CRUD wiring"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS — `format`, `metrics`, and `patrimoine` test files all green.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit/patrimoine` is listed in the route output.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit/patrimoine`. Verify:
1. Empty state shows "Aucun asset" and the chart's "pas assez d'historique" message.
2. FAB → create an asset (e.g. name "PEA", type Actions, value 1000) → it appears in the list, total updates, `v_patrimoine` row count grows.
3. Tap the asset → ValuationModal → add a second dated valuation → current_value updates to the latest; with ≥2 distinct dates the chart renders.
4. Edit a valuation, then delete it → current_value recomputes to the remaining latest.
5. "Modifier la ligne" → AssetModal edit → rename/save works; "Supprimer cet asset" removes it and its valuations.

**Note (type CHECK guardrail):** If creating an asset fails with a Postgres error like `violates check constraint` on `type`, the allowed `assets.type` values differ from `stock/savings/cash/commodity`. Capture the real values and update the `TYPES` array in `AssetModal.tsx` (and `TYPE_LABELS` in `patrimoine.ts`) accordingly, then re-test. Report this rather than guessing.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(patrimoine): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** sources & layer (Tasks 1-3), `v_patrimoine` filtered by user_id (Task 3 `usePatrimoineSummary`), curve from valuations (Task 1 `buildPatrimoineSeries` + Task 4 chart), consolidation by type with shares (Task 1 `withShares` + Task 4 `TypeBreakdown`), asset list (Task 4), CRUD assets + valuations incl. edit/delete (Tasks 2 + 5), current_value sync (Task 2 `syncCurrentValue`), fixed type set with CHECK guardrail (Task 5 + Task 7 note), pure-module tests (Task 1), empty/error states (Task 4 components), verification (Task 7). All covered.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type consistency:** `Asset`/`AssetValuation`/`PatrimoineLine` defined in Task 1 and imported everywhere; mutation input shapes in Task 2 match the call sites in Task 5 (`createAsset`/`updateAsset`/`deleteAsset`/`addValuation`/`updateValuation`/`deleteValuation`); hook return shapes in Task 3 match destructuring in Task 6; `onEditAsset` prop added in Task 5 ValuationModal and supplied in Task 6 page.
- **Writes outside hooks:** intentional — mutations live in `patrimoine-api.ts` (the clean version of the earlier "writes are action-scoped" deviation), reads stay in hooks.
