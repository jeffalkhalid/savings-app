# Cockpit — Onglet Simulateur PEG/PER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activer le second onglet de la page Projection — un simulateur PEG/PER compact mobile réutilisant `lib/simulator`, avec versement volontaire pré-rempli depuis l'épargne observée et le classement des 6 stratégies par net de sortie.

**Architecture:** Helpers purs `lib/cockpit/projection-sim.ts` (`buildSimParams`, `rankByNet`), une `SimulatorView` (contrôles + classement) qui appelle `simulateAll`, `ProjectionTabs` rendu interactif, et la page Projection qui bascule entre la vue projection (extraite en `ProjectionView`) et la vue simulateur.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Vitest. Réutilise `lib/simulator` + `lib/strategies` existants.

---

## File structure

```
lib/cockpit/
  projection-sim.ts        # PUR + testé : buildSimParams, rankByNet
  projection-sim.test.ts   # Vitest

components/cockpit/projection/
  SimulatorControls.tsx     # NOUVEAU : volontaire / rendement / horizon
  StrategyRankList.tsx      # NOUVEAU : liste classée des 6 stratégies
  SimulatorView.tsx         # NOUVEAU : assemble contrôles + classement
  ProjectionTabs.tsx        # MODIF : interactif (active + onSelect)
  ProjectionView.tsx        # NOUVEAU : contenu projection extrait de page.tsx

app/cockpit/projection/page.tsx   # MODIF : état tab ; ProjectionView | SimulatorView
```

Reuse: `@/lib/simulator` (`simulateAll`), `@/lib/strategies` (`DEFAULT_PARAMS`, `STRATEGIES`), `@/lib/types` (`SimulationParams`, `SimulationResult`), `@/lib/cockpit/projection` (`averageMonthlyNet`, `projectNetWorth`), `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/hooks`.

---

## Task 1: projection-sim pure helpers (TDD)

**Files:**
- Create: `lib/cockpit/projection-sim.ts`
- Test: `lib/cockpit/projection-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/projection-sim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSimParams, rankByNet } from "./projection-sim";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import type { SimulationResult } from "@/lib/types";

describe("buildSimParams", () => {
  it("applies the exposed overrides", () => {
    const p = buildSimParams({ volontaire: 5000, rate: 0.04, years: 20 });
    expect(p.volontaire).toBe(5000);
    expect(p.rate).toBe(0.04);
    expect(p.years).toBe(20);
  });
  it("keeps DEFAULT_PARAMS for non-exposed params", () => {
    const p = buildSimParams({ volontaire: 0, rate: 0.06, years: 30 });
    expect(p.plafondPEG).toBe(DEFAULT_PARAMS.plafondPEG);
    expect(p.tmi).toBe(DEFAULT_PARAMS.tmi);
    expect(p.interessement).toBe(DEFAULT_PARAMS.interessement);
  });
});

const mk = (strategy: string, net: number): SimulationResult =>
  ({
    strategy,
    annual: [],
    summary: { net_total: net, multiplier: net / 1000 },
  } as unknown as SimulationResult);

describe("rankByNet", () => {
  it("sorts by net_total descending", () => {
    const ranked = rankByNet([mk("A", 100), mk("B", 300), mk("C", 200)]);
    expect(ranked.map((r) => r.strategy)).toEqual(["B", "C", "A"]);
  });
  it("does not mutate the input", () => {
    const input = [mk("A", 100), mk("B", 300)];
    rankByNet(input);
    expect(input.map((r) => r.strategy)).toEqual(["A", "B"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- projection-sim`
Expected: FAIL — `Cannot find module './projection-sim'`.

- [ ] **Step 3: Implement projection-sim.ts**

Create `lib/cockpit/projection-sim.ts`:

```ts
import { DEFAULT_PARAMS } from "@/lib/strategies";
import type { SimulationParams, SimulationResult } from "@/lib/types";

// DEFAULT_PARAMS + les seuls paramètres exposés dans le cockpit.
export function buildSimParams(input: {
  volontaire: number;
  rate: number;
  years: number;
}): SimulationParams {
  return {
    ...DEFAULT_PARAMS,
    volontaire: input.volontaire,
    rate: input.rate,
    years: input.years,
  };
}

// Stratégies triées par net de sortie décroissant (sans muter l'entrée).
export function rankByNet(results: SimulationResult[]): SimulationResult[] {
  return [...results].sort(
    (a, b) => b.summary.net_total - a.summary.net_total
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- projection-sim`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/projection-sim.ts lib/cockpit/projection-sim.test.ts
git commit -m "feat(simulator): add buildSimParams/rankByNet helpers with tests"
```

---

## Task 2: Simulator components

**Files:**
- Create: `components/cockpit/projection/SimulatorControls.tsx`
- Create: `components/cockpit/projection/StrategyRankList.tsx`
- Create: `components/cockpit/projection/SimulatorView.tsx`

- [ ] **Step 1: SimulatorControls.tsx**

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

- [ ] **Step 2: StrategyRankList.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import { STRATEGIES } from "@/lib/strategies";
import type { SimulationResult } from "@/lib/types";

export function StrategyRankList({ ranked }: { ranked: SimulationResult[] }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Classement (net de sortie)
      </div>
      {ranked.map((r, i) => {
        const meta = STRATEGIES[r.strategy];
        const winner = i === 0;
        return (
          <div
            key={r.strategy}
            className={`py-3 border-b border-rule ${
              winner ? "border-l-2 border-l-emerald pl-3" : ""
            }`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <div className="text-sm font-medium">{meta.label}</div>
              <strong
                className={`font-mono-num text-sm ${
                  winner ? "text-emerald" : "text-ink"
                }`}
              >
                {eur(r.summary.net_total)}
              </strong>
            </div>
            <div className="flex justify-between items-baseline gap-2 mt-0.5">
              <div className="text-[11px] text-ink-muted">{meta.short}</div>
              <div className="font-mono-num text-[11px] text-ink-muted">
                ×{r.summary.multiplier.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 3: SimulatorView.tsx**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { simulateAll } from "@/lib/simulator";
import { DEFAULT_PARAMS } from "@/lib/strategies";
import { buildSimParams, rankByNet } from "@/lib/cockpit/projection-sim";
import { SimulatorControls } from "./SimulatorControls";
import { StrategyRankList } from "./StrategyRankList";

export function SimulatorView({ avgFlow }: { avgFlow: number }) {
  const [volontaire, setVolontaire] = useState(0);
  const [touched, setTouched] = useState(false);
  const [rate, setRate] = useState(DEFAULT_PARAMS.rate);
  const [years, setYears] = useState(DEFAULT_PARAMS.years);

  // Pré-remplit le volontaire depuis l'épargne mensuelle observée ×12, jusqu'à édition.
  useEffect(() => {
    if (!touched && avgFlow > 0) setVolontaire(Math.round(avgFlow * 12));
  }, [avgFlow, touched]);

  const ranked = useMemo(
    () => rankByNet(simulateAll(buildSimParams({ volontaire, rate, years }))),
    [volontaire, rate, years]
  );

  const setVol = (v: number) => {
    setTouched(true);
    setVolontaire(v);
  };

  return (
    <>
      <SimulatorControls
        volontaire={volontaire}
        onVolontaire={setVol}
        rate={rate}
        onRate={setRate}
        years={years}
        onYears={setYears}
      />
      <StrategyRankList ranked={ranked} />
      <p className="text-[11px] text-ink-muted mt-4">
        Hypothèses par défaut (abondement Carrefour). Réglage fin complet sur la
        page principale.
      </p>
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/projection/SimulatorControls.tsx components/cockpit/projection/StrategyRankList.tsx components/cockpit/projection/SimulatorView.tsx
git commit -m "feat(simulator): add simulator controls, ranking and view"
```

---

## Task 3: Interactive tabs + page wiring

**Files:**
- Modify (full rewrite): `components/cockpit/projection/ProjectionTabs.tsx`
- Create: `components/cockpit/projection/ProjectionView.tsx`
- Modify (full rewrite): `app/cockpit/projection/page.tsx`

- [ ] **Step 1: Rewrite ProjectionTabs.tsx (interactive)**

Replace the entire contents of `components/cockpit/projection/ProjectionTabs.tsx` with:

```tsx
"use client";

export function ProjectionTabs({
  active,
  onSelect,
}: {
  active: "projection" | "simulateur";
  onSelect: (t: "projection" | "simulateur") => void;
}) {
  const base = "flex-1 text-center text-[13px] py-2 rounded-lg";
  return (
    <div className="flex gap-2 mb-6">
      <button
        type="button"
        onClick={() => onSelect("projection")}
        className={`${base} ${
          active === "projection"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Projection
      </button>
      <button
        type="button"
        onClick={() => onSelect("simulateur")}
        className={`${base} ${
          active === "simulateur"
            ? "bg-ink text-paper"
            : "text-ink-muted border border-rule"
        }`}
      >
        Simulateur PEG/PER
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create ProjectionView.tsx (extracted projection body)**

Create `components/cockpit/projection/ProjectionView.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { projectNetWorth } from "@/lib/cockpit/projection";
import { ProjectionHero } from "./ProjectionHero";
import { ProjectionChart } from "./ProjectionChart";
import { ProjectionControls } from "./ProjectionControls";

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
  );
}
```

- [ ] **Step 3: Rewrite app/cockpit/projection/page.tsx**

Replace the entire contents of `app/cockpit/projection/page.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  useAuth,
  useAllTransactions,
  usePatrimoineSummary,
} from "@/lib/cockpit/hooks";
import { averageMonthlyNet } from "@/lib/cockpit/projection";
import { ProjectionTabs } from "@/components/cockpit/projection/ProjectionTabs";
import { ProjectionView } from "@/components/cockpit/projection/ProjectionView";
import { SimulatorView } from "@/components/cockpit/projection/SimulatorView";

export default function ProjectionPage() {
  const user = useAuth();
  const { txns, error: txnError } = useAllTransactions();
  const { lines } = usePatrimoineSummary(user.id);

  const avgFlow = useMemo(() => averageMonthlyNet(txns), [txns]);
  const initial = lines.reduce((a, l) => a + Number(l.total_value), 0);

  const [tab, setTab] = useState<"projection" | "simulateur">("projection");

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl">Projection</h1>
      </header>

      <ProjectionTabs active={tab} onSelect={setTab} />

      {tab === "projection" ? (
        <ProjectionView avgFlow={avgFlow} initial={initial} txnError={txnError} />
      ) : (
        <SimulatorView avgFlow={avgFlow} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (old `ProjectionHero/Chart/Controls` imports now live in `ProjectionView`; page no longer imports them directly).

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/projection/ProjectionTabs.tsx components/cockpit/projection/ProjectionView.tsx app/cockpit/projection/page.tsx
git commit -m "feat(simulator): wire interactive tabs (projection | simulateur)"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `projection-sim` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit/projection` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit/projection`. Verify:
1. Two tabs; "Projection" active by default and unchanged (hero + chart + controls).
2. Tapping "Simulateur PEG/PER" switches to the simulator: volontaire pre-filled (≈ observed monthly savings ×12), rate/horizon sliders.
3. The 6 strategies are listed ranked by net, the winner highlighted (emerald, left border).
4. Editing volontaire / rate / horizon re-ranks live.
5. Switching back to "Projection" preserves its own inputs (component state is independent).

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(simulator): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** `buildSimParams`/`rankByNet` pure + tested (Task 1); SimulatorControls + StrategyRankList + SimulatorView reusing `simulateAll`/`DEFAULT_PARAMS`/`STRATEGIES`, with volontaire seeded from `avgFlow*12` (Task 2); interactive `ProjectionTabs` + extracted `ProjectionView` + page tab state (Task 3); verification incl. re-rank + tab independence (Task 4). All spec points covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `buildSimParams` returns `SimulationParams` consumed by `simulateAll` (Task 2 SimulatorView); `rankByNet` returns `SimulationResult[]` consumed by `StrategyRankList` (`r.summary.net_total`, `r.summary.multiplier`, `STRATEGIES[r.strategy]`); `ProjectionTabs` new props (`active`/`onSelect` with the `"projection"|"simulateur"` union) match the page (Task 3); `ProjectionView` props (`avgFlow`/`initial`/`txnError`) match the page and reuse existing `ProjectionHero/Chart/Controls` unchanged.
- **Behaviour parity:** `ProjectionView` is a verbatim extraction of the current projection body (same state, seeding effect, hints), so the Projection tab is unchanged.
- **Branch note:** `projection-simulator` from `main` (has projection + simulator lib). The `SimulatorControls` numeric input mirrors `ProjectionControls` (rounded display) — consistent with the existing pattern.
