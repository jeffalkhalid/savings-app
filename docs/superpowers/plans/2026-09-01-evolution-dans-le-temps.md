# Évolution dans le temps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran qui montre, sur tout l'historique, l'évolution des revenus, dépenses, épargne et taux d'épargne, plus une vue par catégorie — avec pour chaque mois exactement les chiffres que le Cockpit affiche pour ce mois-là.

**Architecture :** un module pur agrège les transactions par **mois budgétaire** (`budgetMonthOf`), donc avec le même découpage que le Cockpit, salaire rattaché compris ; un écran à deux vues trace ces séries avec `recharts`, déjà au projet.

**Tech Stack :** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3, Supabase, Vitest 4, lucide-react, recharts.

**Spec :** `docs/superpowers/specs/2026-09-01-evolution-dans-le-temps-design.md`

## Global Constraints

- Le français est la langue de toute l'UI et des messages d'erreur affichés, accord du pluriel compris.
- Icônes : **lucide-react** uniquement, jamais d'emoji.
- Montants et valeurs numériques en `.font-mono-num` ; tokens Boussole (`text-ink`, `text-ink-muted`, `bg-card`, `bg-paper`, `bg-tile`, `border-rule`, `text-accent`, `bg-seg`, `bg-emerald`, `text-strat-a`).
- Les modules `lib/` restent purs (aucun import React, aucun accès réseau) sauf `*-api.ts`, `hooks.ts` et `use-*.ts`.
- Aucune migration SQL dans ce chantier : ni nouvelle table, ni nouvelle vue.
- Commits en anglais, format `type(scope): message`, avec la ligne `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests : `npm run test` (Vitest 4). Vérification finale : `npx tsc --noEmit` puis `npm run build`.
- **Ne jamais lancer vitest avec `--update` ou `-u`** : `lib/simulator.test.ts` contient des snapshots de caractérisation d'un autre chantier.
- **L'invariant du chantier** : pour un mois donné, les chiffres de la courbe doivent être ceux que le Cockpit affiche. C'est pour cela que l'agrégation passe par `budgetMonthOf` et reprend les définitions de `computeMetrics`.

---

### Task 1: Module `timeline.ts`

**Files:**
- Create: `lib/cockpit/timeline.ts`
- Test: `lib/cockpit/timeline.test.ts`

**Interfaces:**
- Consumes: `Txn` (`lib/cockpit/types.ts`), `budgetMonthOf` et `SalaryShift` (`lib/cockpit/budget-month.ts`).
- Produces:
  - `type MonthTotals = { month: string; revenus: number; depenses: number; epargne: number; tauxEpargne: number }`
  - `function monthlyTotals(txns: Txn[], shift: SalaryShift): MonthTotals[]`
  - `function monthlyByCategory(txns: Txn[], shift: SalaryShift, categoryIds: string[]): { month: string; totals: Record<string, number> }[]`
  - `function topCategories(txns: Txn[], n: number): string[]` — **écart assumé à la spec**, qui listait un paramètre `shift` : cette fonction n'agrège que des dépenses sur toute la période, or le rattachement ne déplace que des revenus. Le paramètre serait donc inerte, et un paramètre inutilisé est du bruit qui fait en plus trébucher le lint.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/cockpit/timeline.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { monthlyTotals, monthlyByCategory, topCategories } from "./timeline";
import { DEFAULT_SHIFT } from "./budget-month";
import { computeMetrics } from "./metrics";
import type { Txn } from "./types";

const t = (
  id: string,
  date: string,
  amount: number,
  type: Txn["type"],
  category_id: string | null = null
): Txn => ({ id, date, amount, description: `op ${id}`, type, category_id });

describe("monthlyTotals", () => {
  it("regroupe par mois et somme par type, en valeur absolue", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-08-05", 3000, "income"),
        t("2", "2026-08-10", -200, "expense"),
        t("3", "2026-08-15", -50, "expense"),
        t("4", "2026-08-20", -500, "savings"),
      ],
      DEFAULT_SHIFT
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      month: "2026-08",
      revenus: 3000,
      depenses: 250,
      epargne: 500,
    });
  });

  it("exclut les virements des trois séries", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-08-05", 3000, "income"),
        t("2", "2026-08-06", -900, "transfer"),
      ],
      DEFAULT_SHIFT
    );
    expect(out[0].revenus).toBe(3000);
    expect(out[0].depenses).toBe(0);
    expect(out[0].epargne).toBe(0);
  });

  it("calcule le taux d'épargne comme computeMetrics", () => {
    const [r] = monthlyTotals(
      [
        t("1", "2026-08-05", 2000, "income"),
        t("2", "2026-08-20", -500, "savings"),
      ],
      DEFAULT_SHIFT
    );
    expect(r.tauxEpargne).toBeCloseTo(0.25);
  });

  it("met le taux d'épargne à 0 quand les revenus sont nuls", () => {
    const [r] = monthlyTotals(
      [t("1", "2026-08-20", -500, "savings")],
      DEFAULT_SHIFT
    );
    expect(r.tauxEpargne).toBe(0);
  });

  it("donne les mêmes chiffres que computeMetrics pour un mois", () => {
    const month = [
      t("1", "2026-08-05", 3000, "income"),
      t("2", "2026-08-10", -200, "expense"),
      t("3", "2026-08-20", -500, "savings"),
      t("4", "2026-08-21", -100, "transfer"),
    ];
    const [série] = monthlyTotals(month, DEFAULT_SHIFT);
    const m = computeMetrics(month);
    expect(série.revenus).toBeCloseTo(m.revenus);
    expect(série.depenses).toBeCloseTo(m.depenses);
    expect(série.epargne).toBeCloseTo(m.epargne);
    expect(série.tauxEpargne).toBeCloseTo(m.tauxEpargne);
  });

  it("rend les mois par ordre croissant", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-09-05", -10, "expense"),
        t("2", "2026-07-05", -10, "expense"),
        t("3", "2026-08-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("n'invente pas les mois sans transaction", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-07-05", -10, "expense"),
        t("2", "2026-09-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-07", "2026-09"]);
  });

  it("passe l'année", () => {
    const out = monthlyTotals(
      [
        t("1", "2026-12-05", -10, "expense"),
        t("2", "2027-01-05", -10, "expense"),
      ],
      DEFAULT_SHIFT
    );
    expect(out.map((m) => m.month)).toEqual(["2026-12", "2027-01"]);
  });

  it("range une opération rattachée dans le mois suivant", () => {
    // C'est le lien avec le Cockpit que toute la conception cherche à préserver.
    const shift = {
      payeeKeys: ["carrefour france"],
      categoryIds: ["cat-salaire"],
      days: 4,
    };
    const salaire: Txn = {
      id: "s",
      date: "2026-08-29",
      amount: 3000,
      description:
        "VIR SEPA RECU /DE CARREFOUR FRANCE /MOTIF  /REF CARREFOUR 196187027523717",
      type: "income",
      category_id: "cat-salaire",
    };
    const out = monthlyTotals([salaire], shift);
    expect(out).toEqual([
      { month: "2026-09", revenus: 3000, depenses: 0, epargne: 0, tauxEpargne: 0 },
    ]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(monthlyTotals([], DEFAULT_SHIFT)).toEqual([]);
  });
});

describe("monthlyByCategory", () => {
  it("ne renvoie que les catégories demandées", () => {
    const out = monthlyByCategory(
      [
        t("1", "2026-08-05", -100, "expense", "a"),
        t("2", "2026-08-06", -50, "expense", "b"),
      ],
      DEFAULT_SHIFT,
      ["a"]
    );
    expect(out).toEqual([{ month: "2026-08", totals: { a: 100 } }]);
  });

  it("met une catégorie sans opération à 0 dans un mois qui existe", () => {
    const out = monthlyByCategory(
      [
        t("1", "2026-08-05", -100, "expense", "a"),
        t("2", "2026-09-05", -70, "expense", "b"),
      ],
      DEFAULT_SHIFT,
      ["a", "b"]
    );
    expect(out).toEqual([
      { month: "2026-08", totals: { a: 100, b: 0 } },
      { month: "2026-09", totals: { a: 0, b: 70 } },
    ]);
  });

  it("rend une liste vide quand aucune catégorie n'est demandée", () => {
    const out = monthlyByCategory(
      [t("1", "2026-08-05", -100, "expense", "a")],
      DEFAULT_SHIFT,
      []
    );
    expect(out).toEqual([]);
  });
});

describe("topCategories", () => {
  it("classe par dépense cumulée décroissante", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", "petite"),
        t("2", "2026-08-06", -300, "expense", "grosse"),
        t("3", "2026-09-06", -100, "expense", "moyenne"),
      ],
      3
    );
    expect(out).toEqual(["grosse", "moyenne", "petite"]);
  });

  it("respecte n", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", "a"),
        t("2", "2026-08-06", -300, "expense", "b"),
        t("3", "2026-08-07", -100, "expense", "c"),
      ],
      2
    );
    expect(out).toEqual(["b", "c"]);
  });

  it("rend moins de n quand il y a moins de catégories", () => {
    expect(
      topCategories([t("1", "2026-08-05", -10, "expense", "a")], 5)
    ).toEqual(["a"]);
  });

  it("ignore les opérations sans catégorie et les non-dépenses", () => {
    const out = topCategories(
      [
        t("1", "2026-08-05", -10, "expense", null),
        t("2", "2026-08-06", 3000, "income", "salaire"),
        t("3", "2026-08-07", -40, "expense", "courses"),
      ],
      5
    );
    expect(out).toEqual(["courses"]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run lib/cockpit/timeline.test.ts`
Expected: FAIL — « Failed to resolve import "./timeline" ».

- [ ] **Step 3: Écrire le module**

Créer `lib/cockpit/timeline.ts` :

```ts
import type { Txn } from "./types";
import { budgetMonthOf, type SalaryShift } from "./budget-month";

export type MonthTotals = {
  month: string; // "YYYY-MM"
  revenus: number;
  depenses: number;
  epargne: number;
  /** 0..1 ; 0 quand les revenus sont nuls, comme computeMetrics. */
  tauxEpargne: number;
};

const abs = (t: Txn): number => Math.abs(Number(t.amount));

/**
 * Séries mensuelles des grands agrégats, découpées par **mois budgétaire**.
 *
 * Le découpage passe par `budgetMonthOf` et les définitions reprennent
 * `computeMetrics`, pour que la courbe passe exactement par le chiffre que le
 * Cockpit affiche pour le même mois. Deux écrans qui se contredisent sur le
 * même chiffre valent moins que pas de courbe.
 *
 * Les `transfer` sont exclus : ce sont des mouvements entre comptes, les
 * compter gonflerait artificiellement les séries.
 */
export function monthlyTotals(txns: Txn[], shift: SalaryShift): MonthTotals[] {
  const byMonth = new Map<
    string,
    { revenus: number; depenses: number; epargne: number }
  >();

  for (const t of txns) {
    const month = budgetMonthOf(t, shift);
    const acc =
      byMonth.get(month) ?? { revenus: 0, depenses: 0, epargne: 0 };
    if (t.type === "income") acc.revenus += abs(t);
    else if (t.type === "expense") acc.depenses += abs(t);
    else if (t.type === "savings") acc.epargne += abs(t);
    byMonth.set(month, acc);
  }

  return [...byMonth.entries()]
    .map(([month, a]) => ({
      month,
      revenus: a.revenus,
      depenses: a.depenses,
      epargne: a.epargne,
      tauxEpargne: a.revenus > 0 ? a.epargne / a.revenus : 0,
    }))
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0));
}

/**
 * Dépenses mensuelles pour un ensemble de catégories.
 *
 * Un mois entièrement vide est absent de la série ; mais dans un mois qui
 * existe, une catégorie sans dépense vaut **0**, sinon sa courbe se briserait
 * en segments — et une interruption de tracé se lit comme une absence de
 * donnée, pas comme une absence de dépense.
 */
export function monthlyByCategory(
  txns: Txn[],
  shift: SalaryShift,
  categoryIds: string[]
): { month: string; totals: Record<string, number> }[] {
  if (!categoryIds.length) return [];
  const wanted = new Set(categoryIds);
  const byMonth = new Map<string, Record<string, number>>();

  for (const t of txns) {
    if (t.type !== "expense") continue;
    if (!t.category_id || !wanted.has(t.category_id)) continue;
    const month = budgetMonthOf(t, shift);
    let totals = byMonth.get(month);
    if (!totals) {
      totals = {};
      for (const id of categoryIds) totals[id] = 0;
      byMonth.set(month, totals);
    }
    totals[t.category_id] += abs(t);
  }

  return [...byMonth.entries()]
    .map(([month, totals]) => ({ month, totals }))
    .sort((x, y) => (x.month < y.month ? -1 : x.month > y.month ? 1 : 0));
}

/** Les `n` catégories de dépense les plus lourdes sur toute la période. */
export function topCategories(txns: Txn[], n: number): string[] {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.category_id) continue;
    totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + abs(t));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}
```

Note : `topCategories` ne prend pas de `shift`, contrairement à ce que listait la spec. Elle agrège
les dépenses sur toute la période, et le rattachement du salaire ne déplace que des revenus : le
paramètre n'aurait aucun effet. Un paramètre inerte se contente d'induire en erreur celui qui lit
la signature.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run lib/cockpit/timeline.test.ts`
Expected: PASS (17 tests).

Run: `npm run test` puis `npx tsc --noEmit`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/timeline.ts lib/cockpit/timeline.test.ts
git commit -m "feat(analyse): monthly aggregation on budget months

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Graphiques

**Files:**
- Create: `components/cockpit/TimelineChart.tsx`
- Create: `components/cockpit/SavingsRateChart.tsx`

**Interfaces:**
- Consumes: `MonthTotals` (Task 1).
- Produces:
  - `<TimelineChart series={MonthTotals[]} />` — trois courbes en euros.
  - `<SavingsRateChart series={MonthTotals[]} />` — la courbe du taux d'épargne en pourcentage.
  - `<CategoryChart series={{ month: string; totals: Record<string, number> }[]} categories={Category[]} />` — une courbe par catégorie, aux couleurs des catégories.

- [ ] **Step 1: Le graphique des grands agrégats**

Créer `components/cockpit/TimelineChart.tsx` :

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { MonthTotals } from "@/lib/cockpit/timeline";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

export function TimelineChart({ series }: { series: MonthTotals[] }) {
  if (series.length < 2) return null;
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Revenus, dépenses et épargne
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortMonth}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="revenus"
              name="Revenus"
              stroke="#3E7D5A"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="depenses"
              name="Dépenses"
              stroke="#C75B39"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="epargne"
              name="Épargne"
              stroke="#4A6FA5"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Les trois teintes sont celles de la palette Boussole déjà employée dans `defaults.ts` (vert
`#3E7D5A`, terracotta `#C75B39`, bleu `#4A6FA5`). `recharts` prend des couleurs littérales, pas des
classes Tailwind — c'est déjà le cas dans `ProjectionChart.tsx`.

- [ ] **Step 2: Le graphique du taux d'épargne**

Créer `components/cockpit/SavingsRateChart.tsx` :

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthTotals } from "@/lib/cockpit/timeline";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

/**
 * Le taux d'épargne a sa propre carte : superposé aux euros, il serait plat et
 * illisible.
 */
export function SavingsRateChart({ series }: { series: MonthTotals[] }) {
  if (series.length < 2) return null;
  const data = series.map((s) => ({
    month: s.month,
    taux: Math.round(s.tauxEpargne * 1000) / 10,
  }));
  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">
        Taux d&apos;épargne
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortMonth}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => `${v} %`}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Line
              type="monotone"
              dataKey="taux"
              name="Taux d'épargne"
              stroke="#E3B23C"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Le graphique par catégorie**

Créer `components/cockpit/CategoryChart.tsx` :

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { eur } from "@/lib/cockpit/format";
import type { Category } from "@/lib/cockpit/types";

const shortMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });

export function CategoryChart({
  series,
  categories,
}: {
  series: { month: string; totals: Record<string, number> }[];
  categories: Category[];
}) {
  if (series.length < 2 || !categories.length) return null;

  // recharts veut des clés plates ; on aplatit les totaux par catégorie.
  const data = series.map((s) => ({ month: s.month, ...s.totals }));

  return (
    <div className="bg-card rounded-2xl p-4 mb-4">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#9A8E7C" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortMonth}
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => eur(v)}
              labelFormatter={(m: string) => shortMonth(m)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {categories.map((c) => (
              <Line
                key={c.id}
                type="monotone"
                dataKey={c.id}
                name={c.name}
                stroke={c.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/TimelineChart.tsx components/cockpit/SavingsRateChart.tsx components/cockpit/CategoryChart.tsx
git commit -m "feat(analyse): timeline, savings-rate and category charts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Écran `/cockpit/evolution` et son accès

**Files:**
- Create: `app/cockpit/evolution/page.tsx`
- Modify: `components/cockpit/CategoryBreakdown.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `monthlyTotals`, `monthlyByCategory`, `topCategories` (Task 1) ; `TimelineChart`, `SavingsRateChart`, `CategoryChart` (Task 2) ; `useAllTransactions`, `useCategories`, `useAuth`, `useUserSettings` (existants).
- Produces: rien.

- [ ] **Step 1: La page**

Créer `app/cockpit/evolution/page.tsx` :

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAllTransactions,
  useAuth,
  useCategories,
  useUserSettings,
} from "@/lib/cockpit/hooks";
import {
  monthlyTotals,
  monthlyByCategory,
  topCategories,
} from "@/lib/cockpit/timeline";
import { TimelineChart } from "@/components/cockpit/TimelineChart";
import { SavingsRateChart } from "@/components/cockpit/SavingsRateChart";
import { CategoryChart } from "@/components/cockpit/CategoryChart";

type Vue = "ensemble" | "categories";

const VUES: { v: Vue; label: string }[] = [
  { v: "ensemble", label: "Vue d'ensemble" },
  { v: "categories", label: "Par catégorie" },
];

export default function EvolutionPage() {
  const user = useAuth();
  const { txns, loading } = useAllTransactions();
  const { categories } = useCategories();
  const { settings } = useUserSettings(user.id);
  const [vue, setVue] = useState<Vue>("ensemble");
  const [picked, setPicked] = useState<string[] | null>(null);

  const shift = settings.salary_shift;

  const totals = useMemo(
    () => monthlyTotals(txns, shift),
    [txns, shift]
  );

  // Sélection par défaut : les cinq postes les plus lourds. `null` signifie
  // « pas encore choisi par l'utilisateur », ce qui laisse le défaut se
  // recalculer quand les transactions arrivent.
  const defaultIds = useMemo(
    () => topCategories(txns, 5),
    [txns]
  );
  const selectedIds = picked ?? defaultIds;

  const catSeries = useMemo(
    () => monthlyByCategory(txns, shift, selectedIds),
    [txns, shift, selectedIds]
  );
  const selectedCats = useMemo(
    () => categories.filter((c) => selectedIds.includes(c.id)),
    [categories, selectedIds]
  );

  // Catégories proposées à la case à cocher : celles qui ont au moins une
  // dépense, pour ne pas noyer la liste sous des catégories jamais utilisées.
  const offered = useMemo(() => {
    const used = new Set(topCategories(txns, Number.MAX_SAFE_INTEGER));
    return categories.filter((c) => used.has(c.id));
  }, [categories, txns]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const base = prev ?? defaultIds;
      return base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
    });

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8 pb-24">
      <header className="mb-4">
        <Link href="/cockpit" className="text-ink-muted text-sm">
          ‹ Cockpit
        </Link>
        <h1 className="font-display text-2xl mt-2">Évolution</h1>
        <p className="text-[13px] text-ink-muted mt-1">
          {loading
            ? "Chargement…"
            : `${totals.length} mois d'historique`}
        </p>
      </header>

      <div className="flex gap-1 bg-seg rounded-xl p-1 mb-4">
        {VUES.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVue(o.v)}
            className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
              vue === o.v ? "bg-card text-ink" : "text-ink-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {!loading && totals.length < 2 && (
        <p className="text-[13px] text-ink-muted">
          Il faut au moins deux mois d&apos;historique pour tracer une évolution.
        </p>
      )}

      {vue === "ensemble" ? (
        <>
          <TimelineChart series={totals} />
          <SavingsRateChart series={totals} />
        </>
      ) : (
        <>
          {selectedIds.length === 0 ? (
            <p className="text-[13px] text-ink-muted mb-4">
              Aucune catégorie sélectionnée.
            </p>
          ) : (
            <CategoryChart series={catSeries} categories={selectedCats} />
          )}
          <div className="grid gap-1.5">
            {offered.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-[15px] text-ink"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                {c.name}
              </label>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Le lien d'accès**

Dans `components/cockpit/CategoryBreakdown.tsx`, l'en-tête contient déjà un conteneur
`flex items-baseline gap-3` avec les boutons « Commerçants » et « Budgets ». Ajouter une prop
`onOpenEvolution: () => void` au composant et un troisième bouton **en première position** dans ce
conteneur, dans le même style que ses voisins :

```tsx
          <button
            type="button"
            onClick={onOpenEvolution}
            className="text-[12px] text-ink-muted"
          >
            Évolution
          </button>
```

Dans `app/cockpit/page.tsx`, passer la nouvelle prop au composant :

```tsx
          onOpenEvolution={() => router.push("/cockpit/evolution")}
```

`router` est déjà présent dans ce fichier (`useRouter()`), utilisé pour le lien « Commerçants ».

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

Run: `npm run test`
Expected: PASS, snapshots de `lib/simulator.test.ts` intacts.

Run: `npm run build`
Expected: build réussi, avec la route `/cockpit/evolution` dans la liste.

- [ ] **Step 4: Commit**

```bash
git add app/cockpit/evolution components/cockpit/CategoryBreakdown.tsx app/cockpit/page.tsx
git commit -m "feat(analyse): evolution screen with overview and per-category views

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Smoke test manuel (à faire par l'utilisateur)**

1. `npm run dev`, Cockpit → « Évolution ».
2. Vue d'ensemble : vérifier que les trois courbes couvrent bien 13 mois, et que le chiffre d'un
   mois donné correspond à ce que le Cockpit affiche pour ce même mois — c'est l'invariant du
   chantier.
3. Basculer sur « Par catégorie » : cinq courbes par défaut, cocher et décocher des catégories.
4. Tout décocher : le message « Aucune catégorie sélectionnée » remplace le graphique.

---

## Notes d'exécution

- **Ordre contraignant** : Task 1 avant 2 et 3 ; Task 2 avant 3.
- **L'invariant du chantier** : pour un mois donné, la courbe doit passer par le chiffre que le
  Cockpit affiche. Un test de la Task 1 compare directement `monthlyTotals` à `computeMetrics`, et
  un autre vérifie qu'une opération rattachée tombe dans le mois suivant.
- **Ne jamais lancer vitest avec `--update`** : `lib/simulator.test.ts` contient des snapshots de
  caractérisation d'un autre chantier.
- Aucune migration SQL dans ce chantier.
