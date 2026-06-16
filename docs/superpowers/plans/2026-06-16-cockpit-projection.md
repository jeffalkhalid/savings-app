# Cockpit — Vue Projection (patrimoine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire l'onglet Projection patrimoine : projeter le patrimoine futur depuis le patrimoine actuel + le flux d'épargne mensuel réel (moyenne de income−expense), capitalisés sur un horizon et un rendement éditables, avec une coquille à onglets (l'onglet Simulateur PEG/PER reste un placeholder).

**Architecture:** Module pur testé `lib/cockpit/projection.ts` (`averageMonthlyNet`, `projectNetWorth`), un hook `useAllTransactions`, des composants présentationnels sous `components/cockpit/projection/`, et la page qui assemble. recharts pour la courbe.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, recharts, Vitest.

---

## File structure

```
lib/cockpit/
  projection.ts        # PUR + testé : averageMonthlyNet, projectNetWorth
  projection.test.ts   # Vitest
  hooks.ts             # MODIF : + useAllTransactions()

components/cockpit/projection/
  ProjectionTabs.tsx     # onglets (Projection actif | Simulateur bientôt)
  ProjectionHero.tsx     # valeur projetée + multiplicateur
  ProjectionChart.tsx    # recharts (aire emerald)
  ProjectionControls.tsx # flux mensuel + rendement + horizon

app/cockpit/projection/page.tsx   # MODIF (remplace placeholder) : assemble
```

Reuse: `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Txn`), `@/lib/cockpit/hooks` (`useAuth`, `usePatrimoineSummary`), `@/lib/cockpit/supabase` (`supabase`).

---

## Task 1: projection.ts (TDD)

**Files:**
- Create: `lib/cockpit/projection.ts`
- Test: `lib/cockpit/projection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { averageMonthlyNet, projectNetWorth } from "./projection";
import type { Txn } from "./types";

const tx = (type: Txn["type"], amount: number, date: string): Txn => ({
  id: date + type + amount,
  date,
  amount,
  description: "",
  type,
});

describe("averageMonthlyNet", () => {
  it("returns income - expense for a single month", () => {
    expect(
      averageMonthlyNet([
        tx("income", 3000, "2026-05-02"),
        tx("expense", -1000, "2026-05-10"),
      ])
    ).toBe(2000);
  });

  it("averages the monthly nets across months", () => {
    expect(
      averageMonthlyNet([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-04-10"), // April net 2000
        tx("income", 3000, "2026-05-02"),
        tx("expense", -2000, "2026-05-10"), // May net 1000
      ])
    ).toBe(1500);
  });

  it("ignores transfer and savings", () => {
    expect(
      averageMonthlyNet([
        tx("income", 1000, "2026-05-02"),
        tx("transfer", -500, "2026-05-03"),
        tx("savings", -300, "2026-05-04"),
      ])
    ).toBe(1000);
  });

  it("returns 0 for an empty list", () => {
    expect(averageMonthlyNet([])).toBe(0);
  });
});

describe("projectNetWorth", () => {
  it("starts at the initial value and has years+1 points", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0.05,
      years: 3,
    });
    expect(s[0]).toEqual({ year: 0, value: 10000 });
    expect(s).toHaveLength(4);
  });

  it("compounds initial and contribution", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0.05,
      years: 1,
    });
    expect(s[1].value).toBeCloseTo(11700); // 10000*1.05 + 1200
  });

  it("is linear when rate is 0", () => {
    const s = projectNetWorth({
      initial: 10000,
      annualContribution: 1200,
      rate: 0,
      years: 2,
    });
    expect(s.map((p) => p.value)).toEqual([10000, 11200, 12400]);
  });

  it("pure compounding when contribution is 0", () => {
    const s = projectNetWorth({
      initial: 1000,
      annualContribution: 0,
      rate: 0.1,
      years: 2,
    });
    expect(s[2].value).toBeCloseTo(1210); // 1000*1.1^2
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- projection`
Expected: FAIL — `Cannot find module './projection'`.

- [ ] **Step 3: Implement projection.ts**

Create `lib/cockpit/projection.ts`:

```ts
import type { Txn } from "./types";

// Moyenne, sur les mois présents, de (income - expense). transfer/savings neutres.
export function averageMonthlyNet(txns: Txn[]): number {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    const month = t.date.slice(0, 7);
    const amt = Math.abs(Number(t.amount));
    let delta = 0;
    if (t.type === "income") delta = amt;
    else if (t.type === "expense") delta = -amt;
    byMonth.set(month, (byMonth.get(month) ?? 0) + delta);
  }
  if (byMonth.size === 0) return 0;
  let sum = 0;
  for (const v of byMonth.values()) sum += v;
  return sum / byMonth.size;
}

// Capitalisation annuelle, annuité de fin de période.
// value(t) = initial*(1+r)^t + C*((1+r)^t - 1)/r ; r=0 => initial + C*t ; t=0 => initial.
export function projectNetWorth(input: {
  initial: number;
  annualContribution: number;
  rate: number;
  years: number;
}): { year: number; value: number }[] {
  const { initial, annualContribution, rate, years } = input;
  const series: { year: number; value: number }[] = [];
  for (let t = 0; t <= years; t++) {
    const value =
      rate === 0
        ? initial + annualContribution * t
        : initial * (1 + rate) ** t +
          annualContribution * (((1 + rate) ** t - 1) / rate);
    series.push({ year: t, value });
  }
  return series;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- projection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/projection.ts lib/cockpit/projection.test.ts
git commit -m "feat(projection): add pure projection module with tests"
```

---

## Task 2: useAllTransactions hook

**Files:**
- Modify: `lib/cockpit/hooks.ts` (append one hook)

- [ ] **Step 1: Append the hook**

Append to `lib/cockpit/hooks.ts` (the file already imports `useState`, `useEffect` from React, `supabase` from `./supabase`, and `Txn` from `./types`):

```ts
export function useAllTransactions() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("transactions")
      .select("id,date,amount,type")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setTxns((data as Txn[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  return { txns, loading, error };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/hooks.ts
git commit -m "feat(projection): add useAllTransactions hook"
```

---

## Task 3: Projection components

**Files:**
- Create: `components/cockpit/projection/ProjectionTabs.tsx`
- Create: `components/cockpit/projection/ProjectionHero.tsx`
- Create: `components/cockpit/projection/ProjectionChart.tsx`
- Create: `components/cockpit/projection/ProjectionControls.tsx`

- [ ] **Step 1: ProjectionTabs.tsx**

```tsx
"use client";

export function ProjectionTabs() {
  return (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        className="flex-1 text-center text-[13px] py-2 rounded-lg bg-ink text-paper"
      >
        Projection
      </button>
      <button
        type="button"
        disabled
        className="flex-1 text-center text-[13px] py-2 rounded-lg text-ink-muted border border-rule opacity-50"
      >
        Simulateur · bientôt
      </button>
    </div>
  );
}
```

- [ ] **Step 2: ProjectionHero.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";

export function ProjectionHero({
  projected,
  initial,
  years,
}: {
  projected: number;
  initial: number;
  years: number;
}) {
  const mult = initial > 0 ? projected / initial : null;
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine projeté · {years} ans
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(projected)}
      </div>
      {mult !== null && (
        <div className="font-mono-num text-sm mt-2 text-ink-muted">
          ×{mult.toFixed(1)} le patrimoine actuel
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: ProjectionChart.tsx**

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

export function ProjectionChart({
  series,
}: {
  series: { year: number; value: number }[];
}) {
  return (
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B5E40" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1B5E40" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: "#6B6E76" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(y: number) => `${y}a`}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => eur(v)}
            labelFormatter={(y) => `Année ${y}`}
            labelStyle={{ color: "#1A1B1F" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="url(#projGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: ProjectionControls.tsx**

```tsx
"use client";

import { eur } from "@/lib/cockpit/format";

export function ProjectionControls({
  monthlyFlow,
  onMonthlyFlow,
  avgFlow,
  rate,
  onRate,
  years,
  onYears,
}: {
  monthlyFlow: number;
  onMonthlyFlow: (v: number) => void;
  avgFlow: number;
  rate: number;
  onRate: (v: number) => void;
  years: number;
  onYears: (v: number) => void;
}) {
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";
  return (
    <section className="grid gap-5">
      <label className={labelCls}>
        Épargne mensuelle (€)
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base w-full"
          type="text"
          inputMode="decimal"
          value={String(Math.round(monthlyFlow))}
          onChange={(e) =>
            onMonthlyFlow(parseFloat(e.target.value.replace(",", ".")) || 0)
          }
        />
        <span className="text-[11px] text-ink-muted">
          Moyenne observée : {eur(avgFlow)}/mois
        </span>
      </label>
      <label className={labelCls}>
        Rendement annuel · {(rate * 100).toFixed(1)} %
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={rate * 100}
          onChange={(e) => onRate(Number(e.target.value) / 100)}
        />
      </label>
      <label className={labelCls}>
        Horizon · {years} ans
        <input
          type="range"
          min={1}
          max={40}
          step={1}
          value={years}
          onChange={(e) => onYears(Number(e.target.value))}
        />
      </label>
    </section>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/projection/ProjectionTabs.tsx components/cockpit/projection/ProjectionHero.tsx components/cockpit/projection/ProjectionChart.tsx components/cockpit/projection/ProjectionControls.tsx
git commit -m "feat(projection): add tabs, hero, chart and controls components"
```

---

## Task 4: Assemble the Projection page

**Files:**
- Modify (full rewrite): `app/cockpit/projection/page.tsx`

- [ ] **Step 1: Replace the placeholder**

Replace the entire contents of `app/cockpit/projection/page.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAuth,
  useAllTransactions,
  usePatrimoineSummary,
} from "@/lib/cockpit/hooks";
import { averageMonthlyNet, projectNetWorth } from "@/lib/cockpit/projection";
import { ProjectionTabs } from "@/components/cockpit/projection/ProjectionTabs";
import { ProjectionHero } from "@/components/cockpit/projection/ProjectionHero";
import { ProjectionChart } from "@/components/cockpit/projection/ProjectionChart";
import { ProjectionControls } from "@/components/cockpit/projection/ProjectionControls";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  const [monthlyFlow, setMonthlyFlow] = useState(0);
  const [flowTouched, setFlowTouched] = useState(false);
  const [rate, setRate] = useState(0.05);
  const [years, setYears] = useState(10);

  // Seed the monthly flow from the observed average once it loads, until edited.
  useEffect(() => {
    if (!flowTouched && avgFlow) setMonthlyFlow(avgFlow);
  }, [avgFlow, flowTouched]);

  const series = useMemo(
    () =>
      projectNetWorth({
        initial,
        annualContribution: monthlyFlow * 12,
        rate,
        years,
      }),
    [initial, monthlyFlow, rate, years]
  );
  const projected = series[series.length - 1].value;

  const setFlow = (v: number) => {
    setFlowTouched(true);
    setMonthlyFlow(v);
  };

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>

      <ProjectionTabs />

      {initial === 0 && (
        <p className="text-ink-muted text-sm mb-4">
          Ajoute des assets dans Patrimoine pour projeter sur une base réelle.
        </p>
      )}

      <ProjectionHero projected={projected} initial={initial} years={years} />
      <ProjectionChart series={series} />
      <ProjectionControls
        monthlyFlow={monthlyFlow}
        onMonthlyFlow={setFlow}
        avgFlow={avgFlow}
        rate={rate}
        onRate={setRate}
        years={years}
        onYears={setYears}
      />
    </main>
  );
}
```

- [ ] **Step 2: Type-check + confirm placeholder gone**

Run: `npx tsc --noEmit`
Expected: No errors.
Run: `git grep -n "Bientôt — branchement" -- app/cockpit/projection/page.tsx`
Expected: no matches (old placeholder text removed).

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/projection/page.tsx
git commit -m "feat(projection): assemble projection view with live controls"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — `format`, `metrics`, `patrimoine`, `transactions`, `projection` suites green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit/projection` present in the route output.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit/projection`. Verify:
1. The "Projection" tab is active; "Simulateur · bientôt" is visible but disabled.
2. The monthly flow input is pre-filled with the observed average (or 0 with no data); "Moyenne observée" line shows the computed average.
3. The hero shows the projected value at the horizon and "×N le patrimoine actuel" (when patrimoine > 0).
4. Dragging the rendement and horizon sliders, and editing the monthly flow, updates the hero and chart live.
5. With patrimoine = 0, the "Ajoute des assets…" hint shows and the curve still grows from 0 via contributions.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(projection): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** `averageMonthlyNet` + `projectNetWorth` pure & tested (Task 1); `useAllTransactions` (Task 2); flux mensuel pré-rempli + éditable, rendement, horizon (Task 3 Controls + Task 4 state/seeding effect); patrimoine de départ via `usePatrimoineSummary` (Task 4); coquille à onglets avec Simulateur désactivé (Task 3 Tabs); héros + multiplicateur (Task 3 Hero); courbe recharts (Task 3 Chart); état patrimoine=0 (Task 4); placeholder remplacé (Task 4); tests Vitest (Task 1); verification incl. route présente (Task 5). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `projectNetWorth` input/output `{ year, value }[]` used by Chart (Task 3) and page (Task 4); `averageMonthlyNet(txns: Txn[])` fed by `useAllTransactions().txns` (Task 2→4); Controls prop names (`monthlyFlow/onMonthlyFlow/avgFlow/rate/onRate/years/onYears`) match the page call site (Task 4); Hero props (`projected/initial/years`) match. `usePatrimoineSummary` returns `{ lines }` with `total_value` (existing hook) — summed in Task 4.
- **Branch note:** `projection-view` is from `main` (includes patrimoine; `usePatrimoineSummary` exists). Independent of the unmerged `txn-edit-delete` branch.
