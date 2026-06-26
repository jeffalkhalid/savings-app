# Boussole Phase 1 — Reskin Projection + onglet Épargne Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ré-habiller l'écran Projection au look Boussole et extraire le Simulateur PEG/PER dans un onglet de nav dédié « Épargne » (`/cockpit/epargne`).

**Architecture:** split routing (5ᵉ onglet + nouvelle route) + restyle Tailwind des composants Projection et Simulateur. Logique inchangée (déjà testée). Aucun backend.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, recharts, lucide-react.

## Global Constraints

- Iso-fonctionnel : ne pas toucher `projection.ts`, `projection-sim.ts`, `monte-carlo.ts`, `lib/strategies.ts`, `lib/simulator.ts`.
- Tokens Boussole ; montants `.font-mono-num` ; titres `.font-display`. Graphes recharts : couleurs littérales (médian `#3E7D5A`, p90/optimiste `#C9A24B`, p10/prudent `#B0805F`, axes `#9A8E7C`).
- Pas de nouveau test unitaire (logique déjà couverte) ; vérif `tsc`/`build`/smoke.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK (routes `/cockpit/projection` et `/cockpit/epargne`).

---

## Task 1: Split routing — onglet Épargne + pages

**Files:** Modify `components/cockpit/TabBar.tsx`, `app/cockpit/projection/page.tsx`; Create `app/cockpit/epargne/page.tsx`; Delete `components/cockpit/projection/ProjectionTabs.tsx`

- [ ] **Step 1: TabBar — 5ᵉ onglet Épargne**

In `components/cockpit/TabBar.tsx`, change the lucide import to add `Sprout`:
```tsx
import { LayoutGrid, Landmark, TrendingUp, Target, Sprout } from "lucide-react";
```
Replace the `ITEMS` array with:
```tsx
const ITEMS = [
  { href: "/cockpit", label: "Cockpit", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
  { href: "/cockpit/epargne", label: "Épargne", Icon: Sprout },
  { href: "/cockpit/objectifs", label: "Objectifs", Icon: Target },
];
```

- [ ] **Step 2: Projection page — drop tabs + simulator**

Replace the entire `app/cockpit/projection/page.tsx` with:
```tsx
"use client";

import { useMemo } from "react";
import { useAuth, useAllTransactions, usePatrimoineSummary } from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { ProjectionView } from "@/components/cockpit/projection/ProjectionView";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns, error: txnError } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>
      <ProjectionView avgFlow={avgFlow} initial={initial} txnError={txnError} />
    </main>
  );
}
```

- [ ] **Step 3: New Épargne page**

Create `app/cockpit/epargne/page.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { useAllTransactions } from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { SimulatorView } from "@/components/cockpit/projection/SimulatorView";

export default function EpargnePage() {
  const { txns } = useAllTransactions();
  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Stratégies d&apos;épargne</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          PEG · PER — net de sortie
        </p>
      </header>
      <SimulatorView avgFlow={avgFlow} />
    </main>
  );
}
```

- [ ] **Step 4: Delete the obsolete sub-tabs component**

```bash
git rm components/cockpit/projection/ProjectionTabs.tsx
```

- [ ] **Step 5: Type-check + build**

Run: `npx tsc --noEmit` → no errors (nothing imports `ProjectionTabs` anymore).
Run: `npm run build` → succeeds; `/cockpit/projection` and `/cockpit/epargne` present.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/TabBar.tsx app/cockpit/projection/page.tsx app/cockpit/epargne/page.tsx
git commit -m "feat(projection): split Épargne into its own nav tab"
```

---

## Task 2: Reskin Projection heroes, charts, mode toggle

**Files:** Modify `components/cockpit/projection/ProjectionHero.tsx`, `MonteCarloHero.tsx`, `ProjectionChart.tsx`, `MonteCarloChart.tsx`, `ProjectionModeToggle.tsx`

- [ ] **Step 1: `ProjectionHero.tsx`** (card)

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
    <div className="bg-card rounded-[26px] p-6 mb-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-muted mb-2">
        Patrimoine projeté · {years} ans
      </div>
      <div className="font-display text-emerald text-4xl leading-none">
        {eur(projected)}
      </div>
      {mult !== null && (
        <div className="font-mono-num text-sm mt-2 text-ink2">
          ×{mult.toFixed(1)} le patrimoine actuel
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `MonteCarloHero.tsx`** (card)

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
    <div className="bg-card rounded-[26px] p-6 mb-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-muted mb-2">
        Patrimoine médian (P50) · {years} ans
      </div>
      <div className="font-display text-emerald text-4xl leading-none">
        {eur(last.p50)}
      </div>
      <div className="font-mono-num text-sm mt-2 text-ink2">
        P10 {eur(last.p10)} – P90 {eur(last.p90)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ProjectionChart.tsx`** (card + Boussole colors)

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
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(y: number) => `${y}a`}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(y) => `Année ${y}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#projGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `MonteCarloChart.tsx`** (card + envelope, theme-safe — no background cutout)

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
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(y: number) => `${y}a`}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(y) => `Année ${y}`}
            />
            <Area
              type="monotone"
              dataKey="p90"
              stroke="#C9A24B"
              strokeWidth={1.3}
              strokeDasharray="3 3"
              fill="#3E7D5A"
              fillOpacity={0.14}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="p10"
              stroke="#B0805F"
              strokeWidth={1.3}
              strokeDasharray="3 3"
              fill="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="p50"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 mt-2 text-[10.5px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full bg-emerald inline-block" />
          Médian
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full bg-gold inline-block" />
          Favorable (p90)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full inline-block" style={{ background: "#B0805F" }} />
          Prudent (p10)
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `ProjectionModeToggle.tsx`** (segmented)

```tsx
"use client";

export function ProjectionModeToggle({
  mode,
  onMode,
}: {
  mode: "deterministe" | "montecarlo";
  onMode: (m: "deterministe" | "montecarlo") => void;
}) {
  const opt = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-[13px] font-medium ${
      active ? "bg-card text-ink" : "text-ink-muted"
    }`;
  return (
    <div className="flex gap-1 bg-seg rounded-xl p-1 mb-5">
      <button type="button" onClick={() => onMode("deterministe")} className={opt(mode === "deterministe")}>
        Déterministe
      </button>
      <button type="button" onClick={() => onMode("montecarlo")} className={opt(mode === "montecarlo")}>
        Monte-Carlo
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/projection/ProjectionHero.tsx components/cockpit/projection/MonteCarloHero.tsx components/cockpit/projection/ProjectionChart.tsx components/cockpit/projection/MonteCarloChart.tsx components/cockpit/projection/ProjectionModeToggle.tsx
git commit -m "feat(projection): Boussole heroes/charts/toggle"
```

---

## Task 3: Reskin controls + risk picker

**Files:** Modify `components/cockpit/projection/ProjectionControls.tsx`, `RiskProfilePicker.tsx`

- [ ] **Step 1: `ProjectionControls.tsx`** (values in accent)

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
  const valueCls = "text-accent font-semibold";
  return (
    <section className="grid gap-5 mt-5">
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
        <span className="flex justify-between">
          <span>Rendement annuel</span>
          <span className={valueCls}>{(rate * 100).toFixed(1)} %</span>
        </span>
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
        <span className="flex justify-between">
          <span>Horizon</span>
          <span className={valueCls}>{years} ans</span>
        </span>
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

- [ ] **Step 2: `RiskProfilePicker.tsx`** (pills)

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
    <section className="grid gap-1.5 text-[13px] text-ink-muted mt-5">
      Profil de risque
      <div className="flex gap-2">
        {RISK_PROFILES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p.mu, p.sigma, p.key)}
            className={`flex-1 text-center text-[12px] py-2 rounded-xl font-medium ${
              activeKey === p.key
                ? "bg-accent text-[#FBF3EC]"
                : "bg-seg text-ink-muted"
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

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/projection/ProjectionControls.tsx components/cockpit/projection/RiskProfilePicker.tsx
git commit -m "feat(projection): Boussole controls + risk pills"
```

---

## Task 4: Reskin Épargne (simulator)

**Files:** Modify `components/cockpit/projection/SimulatorControls.tsx`, `StrategyRankList.tsx`

- [ ] **Step 1: `SimulatorControls.tsx`** (values in accent)

```tsx
"use client";

export function SimulatorControls({
  volontaire,
  onVolontaire,
  rate,
  onRate,
  years,
  onYears,
}: {
  volontaire: number;
  onVolontaire: (v: number) => void;
  rate: number;
  onRate: (v: number) => void;
  years: number;
  onYears: (v: number) => void;
}) {
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";
  const valueCls = "text-accent font-semibold";
  return (
    <section className="grid gap-5 mb-6">
      <label className={labelCls}>
        Versement volontaire annuel (€)
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base w-full"
          type="text"
          inputMode="decimal"
          value={String(Math.round(volontaire))}
          onChange={(e) =>
            onVolontaire(parseFloat(e.target.value.replace(",", ".")) || 0)
          }
        />
      </label>
      <label className={labelCls}>
        <span className="flex justify-between">
          <span>Rendement annuel</span>
          <span className={valueCls}>{(rate * 100).toFixed(1)} %</span>
        </span>
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
        <span className="flex justify-between">
          <span>Horizon</span>
          <span className={valueCls}>{years} ans</span>
        </span>
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

- [ ] **Step 2: `StrategyRankList.tsx`** (cards + rank badge + Top)

```tsx
import { eur } from "@/lib/cockpit/format";
import { STRATEGIES } from "@/lib/strategies";
import type { SimulationResult } from "@/lib/types";

export function StrategyRankList({ ranked }: { ranked: SimulationResult[] }) {
  return (
    <section>
      <div className="font-display text-[15px] mb-2">Classement (net de sortie)</div>
      <div className="grid gap-2">
        {ranked.map((r, i) => {
          const meta = STRATEGIES[r.strategy];
          const winner = i === 0;
          return (
            <div key={r.strategy} className="bg-card rounded-2xl p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0 ${
                    winner ? "bg-emerald text-[#FBF3EC]" : "bg-tile text-ink-muted"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">
                      {meta.label}
                    </span>
                    {winner && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.06em] bg-emerald text-[#FBF3EC] px-1.5 py-0.5 rounded">
                        Top
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    {meta.short} · ×{r.summary.multiplier.toFixed(2)}
                  </div>
                </div>
                <strong className="font-mono-num text-base shrink-0">
                  {eur(r.summary.net_total)}
                </strong>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/projection/SimulatorControls.tsx components/cockpit/projection/StrategyRankList.tsx
git commit -m "feat(epargne): Boussole simulator controls + strategy cards"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (existing suite, unchanged logic).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds; routes `/cockpit/projection` + `/cockpit/epargne` present.
- [ ] **Step 4: Manual smoke (`npm run dev`)**:
  1. Bottom nav now has 5 tabs: Cockpit · Patrimoine · Projection · Épargne · Objectifs.
  2. Projection: segmented Déterministe/Monte-Carlo toggle; hero card with big projected amount (Fraunces, emerald); chart in a card with Boussole colors; sliders with accent values; Monte-Carlo shows the median + p10/p90 envelope + legend; risk-profile pills.
  3. Épargne: « Stratégies d'épargne » header; controls; ranked strategy cards with rank badge + Top badge + net amount.
  4. No leftover sub-tabs; both screens legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(projection): reskin verification fixes"
```

---

## Self-review notes

- **Spec coverage:** routing split + 5th tab (1) ; heroes/charts/toggle (2) ; controls/risk (3) ; simulator/strategies (4) ; verification incl. 5 tabs + det/MC + light/dark (5). All covered.
- **Placeholder scan:** none; full code in every step.
- **Logic untouched:** only components/pages/TabBar restyled; sim libs unchanged; no test changes.
- **MC chart theme-safety:** replaced the old background-color cutout (`#FAF8F4`) with a green envelope fill + dashed p10/p90 lines — renders correctly in dark mode (no hardcoded light background).
- **Charts colors:** literal hex (recharts requirement) — `#3E7D5A`/`#C9A24B`/`#B0805F`/`#9A8E7C`, consistent across det + MC + Patrimoine.
- **Branch note:** continues `boussole-redesign`.
