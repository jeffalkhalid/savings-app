# Scénarios de choc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser des événements datés — perte de revenu, dépense exceptionnelle, hausse durable des charges, krach — sur la Projection du Cockpit, et lire le creux, le délai de rétablissement et le coût à l'horizon.

**Architecture :** un moteur mensuel pur produit les deux trajectoires (la référence n'est que le scénario sans choc, donc aucun écart affiché ne peut venir de l'arithmétique) ; un second module pur en tire le bilan ; l'écran existant gagne une liste de chocs, une seconde courbe et un bloc de bilan.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Vitest 4, recharts, lucide-react.

**Spec :** `docs/superpowers/specs/2026-09-02-scenarios-de-choc-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts`, `hooks.ts` et `use-*.ts`.
- Aucune migration SQL dans ce chantier : le scénario n'est pas persisté.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **Un seul moteur.** Référence et trajectoire choquée sortent du même `projectMonthly`, la première avec `shocks: []`.
- **Le capital n'est jamais écrêté à zéro** : un scénario qui épuise l'épargne doit se voir.
- **Le mode Monte-Carlo n'est pas touché** : il reste annuel, dans son onglet.

---

### Task 1: Le moteur et le bilan

**Files:**
- Create: `lib/cockpit/shock.ts`
- Test: `lib/cockpit/shock.test.ts`
- Modify: `lib/cockpit/projection.ts`
- Test: `lib/cockpit/projection.test.ts`

**Interfaces:**
- Consumes: `Txn` (`lib/cockpit/types.ts`), `projectNetWorth` (`lib/cockpit/projection.ts`) — **dans les tests uniquement**, comme référence de caractérisation.
- Produces:
  - `type Shock` (union à quatre membres), `type MonthPoint = { month: number; value: number }`
  - `function projectMonthly(input: { initial, monthlyFlow, monthlyIncome, rate, years, shocks }): MonthPoint[]`
  - `type ShockSummary = { trough: MonthPoint; recoveryMonths: number | null; deltaAtHorizon: number }`
  - `function summarise(base, shocked, firstShockMonth): ShockSummary`
  - `function firstShockMonth(shocks: Shock[]): number | null`
  - dans `projection.ts` : `function averageMonthlyIncome(txns: Txn[]): number`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/shock.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { projectMonthly, summarise, firstShockMonth } from "./shock";
import type { Shock } from "./shock";
import { projectNetWorth } from "./projection";

const base = {
  initial: 10000,
  monthlyFlow: 0,
  monthlyIncome: 3000,
  rate: 0.05,
  years: 10,
  shocks: [] as Shock[],
};

const at = (points: { month: number; value: number }[], month: number) =>
  points.find((p) => p.month === month)?.value as number;

describe("projectMonthly — la loi de capitalisation", () => {
  it("reproduit exactement projectNetWorth sans contribution", () => {
    // La capitalisation pure doit être identique dans les deux moteurs : c'est
    // ce qui prouve que le passage au mensuel n'a changé que le calendrier des
    // dépôts, pas la loi.
    const monthly = projectMonthly(base);
    const annual = projectNetWorth({
      initial: 10000,
      annualContribution: 0,
      rate: 0.05,
      years: 10,
    });
    for (const { year, value } of annual) {
      expect(at(monthly, year * 12)).toBeCloseTo(value, 6);
    }
  });

  it("part du capital initial au mois 0", () => {
    expect(at(projectMonthly(base), 0)).toBe(10000);
  });

  it("rend un point par mois, horizon compris", () => {
    const out = projectMonthly({ ...base, years: 3 });
    expect(out).toHaveLength(37);
    expect(out[out.length - 1].month).toBe(36);
  });

  it("dépasse la formule annuelle dès qu'on cotise, et l'écart croît", () => {
    // Le déplacement documenté : déposer chaque mois rapporte davantage que
    // déposer une fois l'an. On épingle le sens et la croissance de l'écart,
    // pas une valeur exacte.
    const monthly = projectMonthly({ ...base, monthlyFlow: 500 });
    const annual = projectNetWorth({
      initial: 10000,
      annualContribution: 6000,
      rate: 0.05,
      years: 10,
    });
    const gapAt = (y: number) => at(monthly, y * 12) - annual[y].value;
    expect(gapAt(1)).toBeGreaterThan(0);
    expect(gapAt(10)).toBeGreaterThan(gapAt(1));
  });

  it("capitalise au taux mensuel équivalent, pas au douzième du taux annuel", () => {
    // (1+r)^(1/12) et non r/12 : sur un an, sans flux, on doit retomber sur
    // exactement (1+r).
    const out = projectMonthly({ ...base, years: 1 });
    expect(at(out, 12)).toBeCloseTo(10000 * 1.05, 6);
  });
});

describe("projectMonthly — perte de revenu", () => {
  const withLoss = (keepPct: number) =>
    projectMonthly({
      ...base,
      initial: 20000,
      monthlyFlow: 500,
      monthlyIncome: 3000,
      rate: 0,
      years: 3,
      shocks: [{ kind: "revenu", startMonth: 12, months: 6, keepPct }],
    });

  it("rend le flux négatif quand tout le revenu s'arrête", () => {
    // Flux 500 = revenu 3000 − dépenses 2500. Sans revenu, le flux vaut −2500 :
    // les dépenses continuent, le capital se vide. C'est l'information
    // recherchée.
    const out = withLoss(0);
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-2500);
  });

  it("n'agit que dans la fenêtre, bornes comprises", () => {
    const out = withLoss(0);
    // Le mois 11 est encore normal, le 17 est le dernier touché, le 18 est
    // revenu à la normale.
    expect(at(out, 11) - at(out, 10)).toBeCloseTo(500);
    expect(at(out, 17) - at(out, 16)).toBeCloseTo(-2500);
    expect(at(out, 18) - at(out, 17)).toBeCloseTo(500);
  });

  it("retranche une fraction du revenu quand une indemnité est conservée", () => {
    // 60 % conservés : on perd 1200 €, le flux passe de 500 à −700.
    const out = withLoss(0.6);
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-700);
  });
});

describe("projectMonthly — les autres chocs", () => {
  const flat = {
    ...base,
    initial: 20000,
    monthlyFlow: 500,
    rate: 0,
    years: 3,
  };

  it("retire une dépense exceptionnelle au mois exact", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "depense", atMonth: 10, amount: 15000 }],
    });
    expect(at(out, 9)).toBeCloseTo(20000 + 9 * 500);
    expect(at(out, 10)).toBeCloseTo(20000 + 10 * 500 - 15000);
    expect(at(out, 11)).toBeCloseTo(20000 + 11 * 500 - 15000);
  });

  it("applique un krach en pourcentage du capital du mois", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "krach", atMonth: 6, dropPct: 0.3 }],
    });
    expect(at(out, 6)).toBeCloseTo((20000 + 6 * 500) * 0.7);
  });

  it("baisse le flux définitivement pour une hausse de charges", () => {
    const out = projectMonthly({
      ...flat,
      shocks: [{ kind: "charges", startMonth: 12, monthly: 250 }],
    });
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(250);
    expect(at(out, 35) - at(out, 34)).toBeCloseTo(250);
  });

  it("cumule deux chocs actifs le même mois", () => {
    const out = projectMonthly({
      ...flat,
      monthlyIncome: 3000,
      shocks: [
        { kind: "revenu", startMonth: 12, months: 6, keepPct: 0 },
        { kind: "charges", startMonth: 12, monthly: 250 },
      ],
    });
    // 500 − 3000 − 250
    expect(at(out, 12) - at(out, 11)).toBeCloseTo(-2750);
  });

  it("laisse le capital devenir négatif", () => {
    // Un scénario qui épuise l'épargne doit se voir, pas être écrêté à zéro.
    const out = projectMonthly({
      ...flat,
      initial: 5000,
      shocks: [{ kind: "depense", atMonth: 2, amount: 20000 }],
    });
    expect(at(out, 2)).toBeLessThan(0);
  });
});

describe("firstShockMonth", () => {
  it("rend le mois du choc le plus précoce", () => {
    expect(
      firstShockMonth([
        { kind: "depense", atMonth: 24, amount: 100 },
        { kind: "revenu", startMonth: 6, months: 3, keepPct: 0 },
      ])
    ).toBe(6);
  });

  it("rend null sans choc", () => {
    expect(firstShockMonth([])).toBeNull();
  });
});

describe("summarise", () => {
  const flat = {
    ...base,
    initial: 20000,
    monthlyFlow: 500,
    rate: 0,
    years: 5,
  };
  const shocks: Shock[] = [{ kind: "depense", atMonth: 12, amount: 8000 }];
  const baseSeries = projectMonthly(flat);
  const shockedSeries = projectMonthly({ ...flat, shocks });

  it("trouve le creux et sa date", () => {
    // Le retrait doit dépasser ce qui a été accumulé depuis le mois 0, sans
    // quoi le creux serait le capital de départ et le test ne prouverait rien.
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.trough.month).toBe(12);
    expect(s.trough.value).toBeCloseTo(18000);
  });

  it("compte les mois jusqu'au retour au niveau d'avant le choc", () => {
    // Niveau au mois 11 : 25 500. Au mois 12 le capital tombe à 18 000, puis
    // remonte de 500 par mois : il repasse 25 500 au mois 27, soit 15 mois
    // après le choc.
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.recoveryMonths).toBe(15);
  });

  it("rend 0 quand la trajectoire ne descend jamais sous son niveau d'avant", () => {
    // Une hausse de charges ralentit la croissance sans creuser.
    const only = projectMonthly({
      ...flat,
      shocks: [{ kind: "charges", startMonth: 12, monthly: 100 }],
    });
    expect(summarise(baseSeries, only, 12).recoveryMonths).toBe(0);
  });

  it("rend null quand le niveau d'avant n'est pas retrouvé dans l'horizon", () => {
    const heavy = projectMonthly({
      ...flat,
      shocks: [{ kind: "depense", atMonth: 12, amount: 100000 }],
    });
    expect(summarise(baseSeries, heavy, 12).recoveryMonths).toBeNull();
  });

  it("chiffre l'écart à l'horizon, négatif", () => {
    const s = summarise(baseSeries, shockedSeries, 12);
    expect(s.deltaAtHorizon).toBeCloseTo(-8000);
  });

  it("rend un bilan neutre sans choc", () => {
    const s = summarise(baseSeries, baseSeries, null);
    expect(s.recoveryMonths).toBe(0);
    expect(s.deltaAtHorizon).toBeCloseTo(0);
  });
});
```

Ajouter à `lib/cockpit/projection.test.ts`, à la fin du fichier :

```ts
describe("averageMonthlyIncome", () => {
  it("moyenne les revenus sur les mois observés", () => {
    expect(
      averageMonthlyIncome([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-04-10"),
        tx("income", 3200, "2026-05-02"),
      ])
    ).toBeCloseTo(3100);
  });

  it("ne compte pas un mois sans revenu comme un zéro", () => {
    // Un mois qui n'a que des dépenses ne doit pas diluer la moyenne : le
    // revenu mesuré sert à chiffrer ce qu'une perte d'emploi retranche.
    expect(
      averageMonthlyIncome([
        tx("income", 3000, "2026-04-02"),
        tx("expense", -1000, "2026-05-10"),
      ])
    ).toBeCloseTo(3000);
  });

  it("ignore virements et épargne", () => {
    expect(
      averageMonthlyIncome([
        tx("income", 2000, "2026-04-02"),
        tx("transfer", 900, "2026-04-03"),
        tx("savings", -500, "2026-04-04"),
      ])
    ).toBeCloseTo(2000);
  });

  it("rend 0 sans transaction", () => {
    expect(averageMonthlyIncome([])).toBe(0);
  });
});
```

et compléter son import :

```ts
import {
  averageMonthlyNet,
  averageMonthlyIncome,
  projectNetWorth,
} from "./projection";
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/shock.test.ts lib/cockpit/projection.test.ts`
Expected: FAIL — « Failed to resolve import "./shock" » et `averageMonthlyIncome` non exporté.

- [ ] **Step 3: Écrire le moteur**

Créer `lib/cockpit/shock.ts` :

```ts
/**
 * Scénarios de choc sur la projection de patrimoine.
 *
 * Le moteur est mensuel — et non annuel comme `projectNetWorth` — parce qu'un
 * choc de six mois n'a de creux visible que si quelque chose entre chaque
 * mois. Conséquence assumée et documentée dans la spec : à contribution
 * égale, ce moteur rend un peu plus que la formule annuelle, parce que
 * déposer chaque mois rapporte davantage que déposer une fois l'an.
 */
export type Shock =
  /** Le flux perd `monthlyIncome × (1 − keepPct)` pendant `months` mois. */
  | { kind: "revenu"; startMonth: number; months: number; keepPct: number }
  /** Retrait ponctuel du capital. */
  | { kind: "depense"; atMonth: number; amount: number }
  /** Le flux baisse de `monthly` € à partir de `startMonth`, sans fin. */
  | { kind: "charges"; startMonth: number; monthly: number }
  /** Le capital perd `dropPct` d'un coup. */
  | { kind: "krach"; atMonth: number; dropPct: number };

export type MonthPoint = { month: number; value: number };

export type ShockSummary = {
  trough: MonthPoint;
  /** Mois entre le premier choc et le retour au niveau d'avant lui. */
  recoveryMonths: number | null;
  deltaAtHorizon: number;
};

/** Ce que les chocs retranchent au flux d'un mois donné. */
function flowPenalty(
  shocks: Shock[],
  month: number,
  monthlyIncome: number
): number {
  let penalty = 0;
  for (const s of shocks) {
    if (
      s.kind === "revenu" &&
      month >= s.startMonth &&
      month < s.startMonth + s.months
    ) {
      penalty += monthlyIncome * (1 - s.keepPct);
    }
    if (s.kind === "charges" && month >= s.startMonth) {
      penalty += s.monthly;
    }
  }
  return penalty;
}

export function projectMonthly(input: {
  initial: number;
  monthlyFlow: number;
  monthlyIncome: number;
  rate: number;
  years: number;
  shocks: Shock[];
}): MonthPoint[] {
  const { initial, monthlyFlow, monthlyIncome, rate, years, shocks } = input;
  // Taux mensuel ÉQUIVALENT, pas rate/12 : c'est ce qui fait retomber la série
  // exactement sur la formule annuelle aux anniversaires quand rien n'est
  // déposé.
  const monthlyRate = (1 + rate) ** (1 / 12) - 1;
  const months = Math.max(0, Math.round(years * 12));

  const out: MonthPoint[] = [{ month: 0, value: initial }];
  let value = initial;

  for (let m = 1; m <= months; m++) {
    value *= 1 + monthlyRate;
    value += monthlyFlow - flowPenalty(shocks, m, monthlyIncome);
    for (const s of shocks) {
      if (s.kind === "depense" && s.atMonth === m) value -= s.amount;
      if (s.kind === "krach" && s.atMonth === m) value *= 1 - s.dropPct;
    }
    // Le capital n'est jamais écrêté : un scénario qui épuise l'épargne doit
    // se voir.
    out.push({ month: m, value });
  }
  return out;
}

export function firstShockMonth(shocks: Shock[]): number | null {
  let first: number | null = null;
  for (const s of shocks) {
    const m = s.kind === "revenu" || s.kind === "charges" ? s.startMonth : s.atMonth;
    if (first === null || m < first) first = m;
  }
  return first;
}

export function summarise(
  base: MonthPoint[],
  shocked: MonthPoint[],
  firstShock: number | null
): ShockSummary {
  let trough = shocked[0] ?? { month: 0, value: 0 };
  for (const p of shocked) if (p.value < trough.value) trough = p;

  const lastBase = base[base.length - 1]?.value ?? 0;
  const lastShocked = shocked[shocked.length - 1]?.value ?? 0;
  const deltaAtHorizon = lastShocked - lastBase;

  if (firstShock === null) {
    return { trough, recoveryMonths: 0, deltaAtHorizon };
  }

  // Niveau juste avant le premier choc : c'est à lui qu'il faut revenir.
  const before = shocked.find((p) => p.month === firstShock - 1)?.value ?? shocked[0].value;
  const dipped = shocked.some((p) => p.month >= firstShock && p.value < before);
  if (!dipped) return { trough, recoveryMonths: 0, deltaAtHorizon };

  // Cherché APRÈS le creux et non après le premier choc : sur un scénario à
  // plusieurs chocs, la courbe peut remonter puis replonger, et le délai qui
  // intéresse est celui du retour durable.
  const back = shocked.find(
    (p) => p.month >= trough.month && p.value >= before
  );
  return {
    trough,
    recoveryMonths: back ? back.month - firstShock : null,
    deltaAtHorizon,
  };
}
```

Ajouter à `lib/cockpit/projection.ts`, après `averageMonthlyNet` :

```ts
/**
 * Revenu mensuel moyen sur les mois où il y en a eu.
 *
 * Sert à chiffrer ce qu'une perte d'emploi retranche au flux. Un mois sans
 * revenu n'est pas compté comme un zéro : il tirerait la moyenne vers le bas
 * et sous-estimerait le choc.
 */
export function averageMonthlyIncome(txns: Txn[]): number {
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "income") continue;
    const month = t.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(Number(t.amount)));
  }
  if (byMonth.size === 0) return 0;
  let sum = 0;
  for (const v of byMonth.values()) sum += v;
  return sum / byMonth.size;
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/shock.test.ts lib/cockpit/projection.test.ts`
Expected: PASS (20 tests dans `shock.test.ts`, 13 dans `projection.test.ts`).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/shock.ts lib/cockpit/shock.test.ts lib/cockpit/projection.ts lib/cockpit/projection.test.ts
git commit -m "feat(projection): monthly engine with dated shocks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Le graphique à deux courbes

**Files:**
- Modify: `components/cockpit/projection/ProjectionChart.tsx`

**Interfaces:**
- Consumes: `MonthPoint` (Task 1).
- Produces: `ProjectionChart` prend désormais `{ series: MonthPoint[]; shocked?: MonthPoint[] | null }`.

**Décision de mise en œuvre, à assumer explicitement :** l'axe passe du **numéro d'année au numéro de
mois**, avec des graduations tous les douze mois étiquetées « 3a ». Tracer les points annuels
masquerait le creux : une perte de revenu de mars à août 2027 est en partie résorbée à l'anniversaire,
et un graphique annuel n'en montrerait presque rien. La spec promet une date de creux ; elle impose
donc un tracé mensuel.

- [ ] **Step 1: Réécrire le graphique**

Remplacer le contenu de `components/cockpit/projection/ProjectionChart.tsx` par :

```tsx
"use client";

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { MonthPoint } from "@/lib/cockpit/shock";

/**
 * Trajectoire de patrimoine, au mois.
 *
 * L'axe est en mois et non en années : un choc de six mois est en partie
 * résorbé à l'anniversaire suivant, donc un tracé annuel masquerait le creux
 * que cet écran existe pour montrer. Les graduations restent annuelles pour
 * rester lisibles.
 */
export function ProjectionChart({
  series,
  shocked,
}: {
  series: MonthPoint[];
  shocked?: MonthPoint[] | null;
}) {
  const data = series.map((p, i) => ({
    month: p.month,
    value: p.value,
    shocked: shocked ? shocked[i]?.value : undefined,
  }));
  const ticks = series
    .filter((p) => p.month % 12 === 0)
    .map((p) => p.month);

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3E7D5A" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3E7D5A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, series[series.length - 1]?.month ?? 0]}
              ticks={ticks}
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(m: number) => `${m / 12}a`}
            />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v: number, name: string) =>
                [eur(v), name === "shocked" ? "avec chocs" : "référence"]
              }
              labelFormatter={(m: number) => `Mois ${m}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3E7D5A"
              strokeWidth={2.5}
              fill="url(#projGrad)"
            />
            {shocked && (
              <Line
                type="monotone"
                dataKey="shocked"
                stroke="#B45342"
                strokeWidth={2}
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

`domain={["auto", "auto"]}` sur l'axe Y est nécessaire : la trajectoire choquée peut passer sous
zéro, et l'échelle par défaut la couperait.

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit`
Expected: une erreur attendue dans `ProjectionView.tsx`, qui passe encore des points annuels — elle
sera corrigée par la Task 3. Si `tsc` est propre, c'est que la nouvelle prop n'est pas typée
correctement : le signaler dans le rapport.

Run: `npm run test`
Expected: PASS (aucun test ne couvre les composants dans ce projet).

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/projection/ProjectionChart.tsx
git commit -m "feat(projection): monthly axis and an optional shocked curve

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Le scénario dans l'écran

**Files:**
- Create: `components/cockpit/projection/ShockSheet.tsx`
- Create: `components/cockpit/projection/ScenarioPanel.tsx`
- Modify: `components/cockpit/projection/ProjectionView.tsx`
- Modify: `app/cockpit/projection/page.tsx`

**Interfaces:**
- Consumes: `projectMonthly`, `summarise`, `firstShockMonth`, `Shock`, `MonthPoint`, `ShockSummary` (Task 1) ; `ProjectionChart` (Task 2) ; `averageMonthlyIncome` (Task 1) ; `eur` (`lib/cockpit/format.ts`).
- Produces: rien.

- [ ] **Step 1: La feuille d'ajout d'un choc**

Créer `components/cockpit/projection/ShockSheet.tsx` :

```tsx
"use client";

import { useState } from "react";
import type { Shock } from "@/lib/cockpit/shock";

const KINDS: { v: Shock["kind"]; label: string }[] = [
  { v: "revenu", label: "Perte de revenu" },
  { v: "depense", label: "Dépense exceptionnelle" },
  { v: "charges", label: "Hausse durable des charges" },
  { v: "krach", label: "Krach de marché" },
];

export function ShockSheet({
  onAdd,
  onClose,
}: {
  onAdd: (s: Shock) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Shock["kind"]>("revenu");
  const [start, setStart] = useState(12);
  const [months, setMonths] = useState(6);
  const [keep, setKeep] = useState(0);
  const [amount, setAmount] = useState(15000);
  const [monthly, setMonthly] = useState(250);
  const [drop, setDrop] = useState(30);

  const build = (): Shock => {
    if (kind === "revenu")
      return { kind, startMonth: start, months, keepPct: keep / 100 };
    if (kind === "depense") return { kind, atMonth: start, amount };
    if (kind === "charges") return { kind, startMonth: start, monthly };
    return { kind: "krach", atMonth: start, dropPct: drop / 100 };
  };

  const field = "grid gap-1.5 text-[13px] text-ink-muted";
  const input =
    "bg-tile rounded-lg px-3 py-2.5 text-ink text-[15px] font-mono-num outline-none";

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[85vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-xl">Ajouter un choc</h2>
          <button type="button" className="text-ink-muted text-sm" onClick={onClose}>
            Fermer
          </button>
        </header>

        <div className="grid gap-1.5 mb-5">
          {KINDS.map((k) => (
            <button
              key={k.v}
              type="button"
              onClick={() => setKind(k.v)}
              className={`text-left py-3 px-3 rounded-lg text-[14px] ${
                kind === k.v ? "bg-emerald text-paper font-semibold" : "bg-seg text-ink"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          <label className={field}>
            {kind === "charges" || kind === "revenu" ? "À partir de" : "Quand"} ·
            dans {start} mois
            <input
              type="range"
              min={1}
              max={120}
              step={1}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>

          {kind === "revenu" && (
            <>
              <label className={field}>
                Durée · {months} mois
                <input
                  type="range"
                  min={1}
                  max={36}
                  step={1}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                />
              </label>
              <label className={field}>
                Revenu maintenu · {keep} %
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={keep}
                  onChange={(e) => setKeep(Number(e.target.value))}
                />
              </label>
            </>
          )}

          {kind === "depense" && (
            <label className={field}>
              Montant
              <input
                type="number"
                className={input}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
          )}

          {kind === "charges" && (
            <label className={field}>
              Charge mensuelle supplémentaire
              <input
                type="number"
                className={input}
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
              />
            </label>
          )}

          {kind === "krach" && (
            <label className={field}>
              Baisse du capital · {drop} %
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={drop}
                onChange={(e) => setDrop(Number(e.target.value))}
              />
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onAdd(build());
            onClose();
          }}
          className="w-full mt-6 bg-emerald text-paper rounded-lg py-3 text-[13px] font-semibold"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: La liste et le bilan**

Créer `components/cockpit/projection/ScenarioPanel.tsx` :

```tsx
"use client";

import { Plus, X } from "lucide-react";
import { eur } from "@/lib/cockpit/format";
import type { Shock, ShockSummary } from "@/lib/cockpit/shock";

/** « dans 14 mois » → « nov. 2027 », à partir d'aujourd'hui. */
function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function describe(s: Shock): string {
  if (s.kind === "revenu")
    return `Perte de revenu · ${s.months} mois dès ${monthLabel(s.startMonth)}${
      s.keepPct > 0 ? ` · ${Math.round(s.keepPct * 100)} % maintenus` : ""
    }`;
  if (s.kind === "depense")
    return `Dépense de ${eur(s.amount)} · ${monthLabel(s.atMonth)}`;
  if (s.kind === "charges")
    return `Charges +${eur(s.monthly)}/mois dès ${monthLabel(s.startMonth)}`;
  return `Krach de ${Math.round(s.dropPct * 100)} % · ${monthLabel(s.atMonth)}`;
}

export function ScenarioPanel({
  shocks,
  summary,
  onAdd,
  onRemove,
}: {
  shocks: Shock[];
  summary: ShockSummary | null;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="mt-5">
      <div className="flex justify-between items-baseline mb-2">
        <div className="font-display text-[15px]">Scénario</div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-[12px] text-ink-muted"
        >
          <Plus size={14} />
          Ajouter un choc
        </button>
      </div>

      {!shocks.length ? (
        <p className="text-ink-muted text-[13px]">
          Aucun choc. Ajoutes-en un pour voir ce qu&apos;il coûterait — le
          scénario n&apos;est pas enregistré, il disparaît en quittant
          l&apos;écran.
        </p>
      ) : (
        <>
          {shocks.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-2.5 border-b border-rule"
            >
              <span className="text-[13px] flex-1">{describe(s)}</span>
              <button
                type="button"
                aria-label="Retirer ce choc"
                onClick={() => onRemove(i)}
                className="text-ink-muted p-1"
              >
                <X size={15} />
              </button>
            </div>
          ))}

          {summary && (
            <div className="bg-card rounded-2xl p-4 mt-3 grid gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Creux</span>
                <span className="font-mono-num">
                  {eur(summary.trough.value)} · {monthLabel(summary.trough.month)}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Retour au niveau d&apos;avant</span>
                <span className="font-mono-num">
                  {summary.recoveryMonths === null
                    ? "jamais sur l'horizon"
                    : summary.recoveryMonths === 0
                      ? "jamais descendu"
                      : `${summary.recoveryMonths} mois`}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ink-muted">Écart à l&apos;horizon</span>
                <span className="font-mono-num text-accent">
                  {eur(summary.deltaAtHorizon)}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Brancher dans la vue**

Dans `components/cockpit/projection/ProjectionView.tsx` :

Ajouter les imports :

```ts
import {
  projectMonthly,
  summarise,
  firstShockMonth,
  type Shock,
} from "@/lib/cockpit/shock";
import { ScenarioPanel } from "./ScenarioPanel";
import { ShockSheet } from "./ShockSheet";
```

Ajouter la prop `monthlyIncome: number` à la signature du composant, à côté de `avgFlow` et
`initial`.

Ajouter l'état, à côté des autres `useState` :

```ts
  const [shocks, setShocks] = useState<Shock[]>([]);
  const [showShockSheet, setShowShockSheet] = useState(false);
```

Remplacer le `useMemo` qui calcule `series` et la ligne `projected` par :

```ts
  const monthlyBase = useMemo(
    () =>
      projectMonthly({
        initial,
        monthlyFlow,
        monthlyIncome,
        rate,
        years,
        shocks: [],
      }),
    [initial, monthlyFlow, monthlyIncome, rate, years]
  );
  const monthlyShocked = useMemo(
    () =>
      shocks.length
        ? projectMonthly({
            initial,
            monthlyFlow,
            monthlyIncome,
            rate,
            years,
            shocks,
          })
        : null,
    [initial, monthlyFlow, monthlyIncome, rate, years, shocks]
  );
  const summary = useMemo(
    () =>
      monthlyShocked
        ? summarise(monthlyBase, monthlyShocked, firstShockMonth(shocks))
        : null,
    [monthlyBase, monthlyShocked, shocks]
  );
  // Le hero annonce la fin de la trajectoire réellement affichée : s'il y a
  // des chocs, c'est celle qui les porte.
  const projected =
    (monthlyShocked ?? monthlyBase)[
      (monthlyShocked ?? monthlyBase).length - 1
    ].value;
```

`annualContribution` reste tel quel : le Monte-Carlo continue de le consommer.

Dans la branche `mode === "deterministe"`, remplacer `<ProjectionChart series={series} />` par :

```tsx
          <ProjectionChart series={monthlyBase} shocked={monthlyShocked} />
```

et ajouter, **après** `<ProjectionControls … />` de cette même branche :

```tsx
          <ScenarioPanel
            shocks={shocks}
            summary={summary}
            onAdd={() => setShowShockSheet(true)}
            onRemove={(i) => setShocks((xs) => xs.filter((_, j) => j !== i))}
          />
```

Enfin, juste avant le `</>` final du composant :

```tsx
      {showShockSheet && (
        <ShockSheet
          onAdd={(s) => setShocks((xs) => [...xs, s])}
          onClose={() => setShowShockSheet(false)}
        />
      )}
```

- [ ] **Step 4: Passer le revenu mesuré depuis la page**

Dans `app/cockpit/projection/page.tsx` :

```ts
import { averageMonthlyNet, averageMonthlyIncome } from "@/lib/cockpit/projection";
```

```ts
  const monthlyIncome = useMemo(() => averageMonthlyIncome(txns), [txns]);
```

```tsx
      <ProjectionView
        avgFlow={avgFlow}
        initial={initial}
        monthlyIncome={monthlyIncome}
        txnError={txnError}
      />
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur. Si `series` ou `projectNetWorth` restent importés sans être utilisés dans
`ProjectionView.tsx`, les retirer — un import inutilisé fait échouer le lint du build.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/projection/ShockSheet.tsx components/cockpit/projection/ScenarioPanel.tsx components/cockpit/projection/ProjectionView.tsx app/cockpit/projection/page.tsx
git commit -m "feat(projection): shock scenarios on the deterministic view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, ouvrir Projection. Sans choc, une seule courbe — mais les montants auront
   légèrement monté par rapport à avant : c'est le passage au mensuel, documenté.
2. Ajouter « perte de revenu, 6 mois, dans 12 mois, 0 % maintenu » : la seconde courbe doit **plonger**
   pendant six mois, pas seulement ralentir.
3. Ajouter une dépense de 15 000 € : le creux et sa date doivent bouger en conséquence.
4. Ajouter une hausse de charges seule : le délai doit afficher « jamais descendu ».
5. Mettre une dépense énorme : le délai doit afficher « jamais sur l'horizon », et la courbe passer
   sous zéro sans être coupée par le bas du graphique.
6. Basculer sur Monte-Carlo : l'onglet doit être inchangé.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1, puis Task 2, puis Task 3. La Task 2 laisse volontairement une
  erreur de typage que la Task 3 résout — c'est attendu et signalé dans ses étapes.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots d'un
  autre chantier.
- Aucune migration SQL, aucune persistance du scénario.
- `lib/cockpit/shock.ts` ne connaît ni React, ni Supabase, ni dates calendaires : il raisonne en
  numéros de mois, et c'est l'écran qui les traduit en « nov. 2027 ».
