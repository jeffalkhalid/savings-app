# Cockpit — Projection Monte Carlo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode Monte Carlo (rendement annuel log-normal, 1000 trajectoires, fourchette P10/P50/P90) à l'onglet Projection patrimoine, via un toggle Déterministe/Monte Carlo et des profils de risque.

**Architecture:** Moteur pur seedé `lib/cockpit/monte-carlo.ts` (PRNG + percentiles + simulation), composants `ProjectionModeToggle`/`RiskProfilePicker`/`MonteCarloChart`/`MonteCarloHero`, et `ProjectionView` qui bascule entre la vue déterministe (inchangée) et la vue Monte Carlo.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, recharts, Vitest.

---

## File structure

```
lib/cockpit/
  monte-carlo.ts        # PUR + testé : RISK_PROFILES, mulberry32, gaussian, percentile, simulateMonteCarlo
  monte-carlo.test.ts   # Vitest

components/cockpit/projection/
  ProjectionModeToggle.tsx  # Déterministe | Monte Carlo
  RiskProfilePicker.tsx     # 3 boutons profils
  MonteCarloChart.tsx       # bande P10–P90 + ligne P50
  MonteCarloHero.tsx        # P50 + fourchette à l'horizon
  ProjectionView.tsx        # MODIF : état mode/sigma/profile ; switch déterministe/MC
```

Reuse: `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/projection` (`projectNetWorth`), composants existants `ProjectionHero`/`ProjectionChart`/`ProjectionControls`.

---

## Task 1: monte-carlo pure engine (TDD)

**Files:**
- Create: `lib/cockpit/monte-carlo.ts`
- Test: `lib/cockpit/monte-carlo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/monte-carlo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mulberry32,
  percentile,
  simulateMonteCarlo,
} from "./monte-carlo";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("returns values in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("percentile", () => {
  it("returns the median of a known list", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  it("returns the bounds at p=0 and p=1", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });
});

describe("simulateMonteCarlo", () => {
  it("collapses to the deterministic compound when sigma=0 (flat band)", () => {
    const pts = simulateMonteCarlo({
      initial: 10000,
      annualContribution: 1200,
      mu: 0.05,
      sigma: 0,
      years: 1,
      runs: 50,
      seed: 42,
    });
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ year: 0, p10: 10000, p50: 10000, p90: 10000 });
    expect(pts[1].p50).toBeCloseTo(11700, 3); // 10000*1.05 + 1200
    expect(pts[1].p10).toBeCloseTo(11700, 3);
    expect(pts[1].p90).toBeCloseTo(11700, 3);
  });
  it("spreads p10 < p50 < p90 at the horizon when sigma>0", () => {
    const pts = simulateMonteCarlo({
      initial: 10000,
      annualContribution: 0,
      mu: 0.05,
      sigma: 0.15,
      years: 10,
      runs: 2000,
      seed: 42,
    });
    const last = pts[pts.length - 1];
    expect(last.p10).toBeLessThan(last.p50);
    expect(last.p50).toBeLessThan(last.p90);
  });
  it("has years+1 points and year 0 = initial", () => {
    const pts = simulateMonteCarlo({
      initial: 5000,
      annualContribution: 100,
      mu: 0.04,
      sigma: 0.1,
      years: 5,
      runs: 100,
      seed: 1,
    });
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ year: 0, p10: 5000, p50: 5000, p90: 5000 });
  });
  it("is reproducible for the same seed", () => {
    const args = {
      initial: 1000,
      annualContribution: 100,
      mu: 0.05,
      sigma: 0.12,
      years: 5,
      runs: 200,
      seed: 99,
    };
    expect(simulateMonteCarlo(args)).toEqual(simulateMonteCarlo(args));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- monte-carlo`
Expected: FAIL — `Cannot find module './monte-carlo'`.

- [ ] **Step 3: Implement monte-carlo.ts**

Create `lib/cockpit/monte-carlo.ts`:

```ts
export type McPoint = { year: number; p10: number; p50: number; p90: number };

export type RiskProfile = {
  key: string;
  label: string;
  mu: number;
  sigma: number;
};

export const RISK_PROFILES: RiskProfile[] = [
  { key: "prudent", label: "Prudent", mu: 0.03, sigma: 0.06 },
  { key: "equilibre", label: "Équilibré", mu: 0.05, sigma: 0.12 },
  { key: "dynamique", label: "Dynamique", mu: 0.07, sigma: 0.18 },
];

// PRNG déterministe 32 bits.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normale standard (Box-Muller) depuis un rng() uniforme [0,1).
export function gaussian(rng: () => number): number {
  let u1 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// p ∈ [0,1] sur un tableau trié croissant (interpolation linéaire).
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function simulateMonteCarlo(input: {
  initial: number;
  annualContribution: number;
  mu: number;
  sigma: number;
  years: number;
  runs: number;
  seed: number;
}): McPoint[] {
  const { initial, annualContribution, mu, sigma, years, runs, seed } = input;
  const rng = mulberry32(seed);
  const drift = Math.log(1 + mu) - (sigma * sigma) / 2;
  const valuesByYear: number[][] = Array.from(
    { length: years + 1 },
    () => []
  );

  for (let r = 0; r < runs; r++) {
    let v = initial;
    valuesByYear[0].push(v);
    for (let t = 1; t <= years; t++) {
      const factor = Math.exp(drift + sigma * gaussian(rng));
      v = v * factor + annualContribution;
      valuesByYear[t].push(v);
    }
  }

  return valuesByYear.map((vals, year) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      year,
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- monte-carlo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/monte-carlo.ts lib/cockpit/monte-carlo.test.ts
git commit -m "feat(monte-carlo): add seeded log-normal MC engine with tests"
```

---

## Task 2: Monte Carlo components

**Files:**
- Create: `components/cockpit/projection/ProjectionModeToggle.tsx`
- Create: `components/cockpit/projection/RiskProfilePicker.tsx`
- Create: `components/cockpit/projection/MonteCarloChart.tsx`
- Create: `components/cockpit/projection/MonteCarloHero.tsx`

- [ ] **Step 1: ProjectionModeToggle.tsx**

```tsx
"use client";

export function ProjectionModeToggle({
  mode,
  onMode,
}: {
  mode: "deterministe" | "montecarlo";
  onMode: (m: "deterministe" | "montecarlo") => void;
}) {
  const base = "flex-1 text-center text-[12px] py-1.5 rounded-lg";
  return (
    <div className="flex gap-2 mb-5">
      <button
        type="button"
        onClick={() => onMode("deterministe")}
        className={`${base} ${
          mode === "deterministe"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Déterministe
      </button>
      <button
        type="button"
        onClick={() => onMode("montecarlo")}
        className={`${base} ${
          mode === "montecarlo"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Monte Carlo
      </button>
    </div>
  );
}
```

- [ ] **Step 2: RiskProfilePicker.tsx**

```tsx
"use client";

import { RISK_PROFILES } from "@/lib/cockpit/monte-carlo";

export function RiskProfilePicker({
  activeKey,
  onSelect,
}: {
  activeKey: string | null;
  onSelect: (mu: number, sigma: number, key: string) => void;
}) {
  return (
    <section className="grid gap-1.5 text-[13px] text-ink-muted mb-5">
      Profil de risque
      <div className="flex gap-2">
        {RISK_PROFILES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p.mu, p.sigma, p.key)}
            className={`flex-1 text-center text-[12px] py-1.5 rounded-lg ${
              activeKey === p.key
                ? "bg-emerald text-paper"
                : "text-ink border border-rule"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: MonteCarloChart.tsx**

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
import type { McPoint } from "@/lib/cockpit/monte-carlo";

export function MonteCarloChart({ points }: { points: McPoint[] }) {
  return (
    <div className="h-56 mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
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
          {/* Bande P10–P90 : aire emerald jusqu'à p90, puis aire paper jusqu'à p10 pour découper le bas. */}
          <Area
            type="monotone"
            dataKey="p90"
            stroke="none"
            fill="#1B5E40"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p10"
            stroke="none"
            fill="#FAF8F4"
            fillOpacity={1}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="p50"
            stroke="#1B5E40"
            strokeWidth={2}
            fill="none"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: MonteCarloHero.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { McPoint } from "@/lib/cockpit/monte-carlo";

export function MonteCarloHero({
  points,
  years,
}: {
  points: McPoint[];
  years: number;
}) {
  const last = points[points.length - 1];
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
        Patrimoine médian (P50) · {years} ans
      </div>
      <div className="font-display text-emerald text-5xl leading-none">
        {eur(last.p50)}
      </div>
      <div className="font-mono-num text-sm mt-2 text-ink-muted">
        P10 {eur(last.p10)} – P90 {eur(last.p90)}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/projection/ProjectionModeToggle.tsx components/cockpit/projection/RiskProfilePicker.tsx components/cockpit/projection/MonteCarloChart.tsx components/cockpit/projection/MonteCarloHero.tsx
git commit -m "feat(monte-carlo): add mode toggle, risk picker, MC chart and hero"
```

---

## Task 3: Integrate into ProjectionView

**Files:**
- Modify (full rewrite): `components/cockpit/projection/ProjectionView.tsx`

- [ ] **Step 1: Rewrite ProjectionView.tsx**

Replace the entire contents of `components/cockpit/projection/ProjectionView.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { projectNetWorth } from "@/lib/cockpit/projection";
import { simulateMonteCarlo } from "@/lib/cockpit/monte-carlo";
import { ProjectionHero } from "./ProjectionHero";
import { ProjectionChart } from "./ProjectionChart";
import { ProjectionControls } from "./ProjectionControls";
import { ProjectionModeToggle } from "./ProjectionModeToggle";
import { RiskProfilePicker } from "./RiskProfilePicker";
import { MonteCarloChart } from "./MonteCarloChart";
import { MonteCarloHero } from "./MonteCarloHero";

export function ProjectionView({
  avgFlow,
  initial,
  txnError,
}: {
  avgFlow: number;
  initial: number;
  txnError: string | null;
}) {
  const [monthlyFlow, setMonthlyFlow] = useState(0);
  const [flowTouched, setFlowTouched] = useState(false);
  const [rate, setRate] = useState(0.05);
  const [years, setYears] = useState(10);
  const [mode, setMode] = useState<"deterministe" | "montecarlo">(
    "deterministe"
  );
  const [sigma, setSigma] = useState(0.12);
  const [profile, setProfile] = useState<string | null>(null);

  useEffect(() => {
    if (!flowTouched && avgFlow) setMonthlyFlow(avgFlow);
  }, [avgFlow, flowTouched]);

  const annualContribution = monthlyFlow * 12;

  const series = useMemo(
    () => projectNetWorth({ initial, annualContribution, rate, years }),
    [initial, annualContribution, rate, years]
  );
  const projected = series[series.length - 1].value;

  const points = useMemo(
    () =>
      simulateMonteCarlo({
        initial,
        annualContribution,
        mu: rate,
        sigma,
        years,
        runs: 1000,
        seed: 42,
      }),
    [initial, annualContribution, rate, sigma, years]
  );

  const setFlow = (v: number) => {
    setFlowTouched(true);
    setMonthlyFlow(v);
  };
  const applyProfile = (mu: number, sig: number, key: string) => {
    setRate(mu);
    setSigma(sig);
    setProfile(key);
  };

  return (
    <>
      {initial === 0 && (
        <p className="text-ink-muted text-sm mb-4">
          Ajoute des assets dans Patrimoine pour projeter sur une base réelle.
        </p>
      )}
      {txnError && (
        <p className="text-ink-muted text-xs mb-4">
          Transactions indisponibles — saisis l&apos;épargne mensuelle
          manuellement.
        </p>
      )}

      <ProjectionModeToggle mode={mode} onMode={setMode} />

      {mode === "deterministe" ? (
        <>
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
        </>
      ) : (
        <>
          <MonteCarloHero points={points} years={years} />
          <MonteCarloChart points={points} />
          <RiskProfilePicker activeKey={profile} onSelect={applyProfile} />
          <ProjectionControls
            monthlyFlow={monthlyFlow}
            onMonthlyFlow={setFlow}
            avgFlow={avgFlow}
            rate={rate}
            onRate={(r) => {
              setRate(r);
              setProfile(null);
            }}
            years={years}
            onYears={setYears}
          />
          <label className="grid gap-1.5 text-[13px] text-ink-muted mt-5">
            Volatilité annuelle · {(sigma * 100).toFixed(0)} %
            <input
              type="range"
              min={0}
              max={25}
              step={1}
              value={sigma * 100}
              onChange={(e) => {
                setSigma(Number(e.target.value) / 100);
                setProfile(null);
              }}
            />
          </label>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/projection/ProjectionView.tsx
git commit -m "feat(monte-carlo): wire deterministic/Monte Carlo toggle into projection view"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `monte-carlo` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit/projection` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit/projection`. Verify:
1. The Projection tab shows a "Déterministe | Monte Carlo" toggle; Déterministe is the default and unchanged (single line + hero).
2. Switching to Monte Carlo shows a P10–P90 band + P50 median line, and a hero with "P50 …" + "P10 … – P90 …".
3. The 3 risk-profile buttons set rendement + volatilité (the picked one highlights emerald); the band widens/narrows accordingly.
4. Adjusting the rendement, volatilité, horizon or monthly savings updates the band live; editing rendement or volatilité clears the profile highlight.
5. Setting volatilité to 0 collapses the band to a flat line equal to the deterministic projection.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(monte-carlo): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** seeded log-normal engine + percentiles + tests incl. sigma=0 parity and reproducibility (Task 1); RISK_PROFILES + ProjectionModeToggle + RiskProfilePicker + MonteCarloChart (band trick) + MonteCarloHero (Task 2); ProjectionView toggle wiring with μ=rate, σ slider, profile prefill+clear-on-manual-edit, deterministic mode unchanged (Task 3); verification incl. sigma=0 flat band and live updates (Task 4). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `McPoint`/`simulateMonteCarlo`/`RISK_PROFILES` from Task 1 consumed by Task 2 components and Task 3 view; `MonteCarloChart`/`MonteCarloHero` props (`points`, `years`) match the view; `ProjectionModeToggle` union `"deterministe"|"montecarlo"` matches the view state; `RiskProfilePicker.onSelect(mu, sigma, key)` matches `applyProfile`.
- **Behaviour parity:** deterministic branch reuses the exact existing `ProjectionHero`/`ProjectionChart`/`ProjectionControls` + `projectNetWorth`, so that mode is unchanged.
- **Branch note:** `monte-carlo` from `main` (has the projection tab + ProjectionView). `points` is computed via `useMemo` regardless of mode but deps-gated; 1000×≤40 iterations is cheap.
