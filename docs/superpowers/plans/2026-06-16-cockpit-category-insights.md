# Cockpit — Analyse par catégorie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la liste plate de transactions du Dashboard par une répartition des dépenses par catégorie (classée par montant + tendance vs habitude), avec drill-down vers les transactions d'une catégorie.

**Architecture:** Fonction pure `analyzeCategories` sur les agrégats `v_monthly_by_category` (lus par un hook `useMonthlyByCategory`), composants `CategoryBreakdown`/`CategoryRow`, et la page Dashboard qui bascule entre la répartition et un drill-down (TxnList filtré).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

---

## File structure

```
lib/cockpit/
  categories-analysis.ts        # PUR + testé : analyzeCategories ; types MonthlyCategoryRow, CategoryInsight
  categories-analysis.test.ts   # Vitest
  hooks.ts                      # MODIF : + useMonthlyByCategory(userId)

components/cockpit/
  CategoryRow.tsx         # 1 ligne : nom, montant, part %, barre, chip tendance
  CategoryBreakdown.tsx   # liste classée

app/cockpit/page.tsx      # MODIF : useMonthlyByCategory + analyzeCategories + drillCategory ; remplace TxnList plat
```

Reuse: `@/lib/cockpit/format` (`eur`), `@/lib/cockpit/types` (`Category`, `Txn`), `@/lib/cockpit/hooks` (`useTransactions`), `@/components/cockpit/TxnList`.

---

## Task 1: categories-analysis pure module (TDD)

**Files:**
- Create: `lib/cockpit/categories-analysis.ts`
- Test: `lib/cockpit/categories-analysis.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/categories-analysis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyzeCategories } from "./categories-analysis";
import type { MonthlyCategoryRow } from "./categories-analysis";
import type { Category } from "./types";

const cats: Category[] = [
  { id: "c1", name: "Courses", type: "expense", color: "" },
  { id: "c2", name: "Resto", type: "expense", color: "" },
  { id: "c3", name: "Salaire", type: "income", color: "" },
];
const row = (
  year_month: string,
  category_id: string,
  type: string,
  total_abs: number,
  n_txns = 1
): MonthlyCategoryRow => ({ year_month, category_id, type, n_txns, total_abs });

describe("analyzeCategories", () => {
  it("ranks current-month expenses by total desc with share", () => {
    const out = analyzeCategories(
      [row("2026-05", "c1", "expense", 800), row("2026-05", "c2", "expense", 200)],
      "2026-05",
      cats
    );
    expect(out.map((i) => i.categoryId)).toEqual(["c1", "c2"]);
    expect(out[0].share).toBeCloseTo(0.8);
    expect(out[1].share).toBeCloseTo(0.2);
    expect(out[0].name).toBe("Courses");
  });

  it("computes deltaPct vs the mean of prior months", () => {
    const out = analyzeCategories(
      [
        row("2026-03", "c1", "expense", 100),
        row("2026-04", "c1", "expense", 100),
        row("2026-05", "c1", "expense", 120),
      ],
      "2026-05",
      cats
    );
    expect(out[0].avgPrior).toBeCloseTo(100);
    expect(out[0].deltaPct).toBeCloseTo(0.2);
  });

  it("marks a category with no prior month as nouveau (deltaPct null)", () => {
    const out = analyzeCategories([row("2026-05", "c1", "expense", 50)], "2026-05", cats);
    expect(out[0].deltaPct).toBeNull();
    expect(out[0].avgPrior).toBe(0);
  });

  it("ignores non-expense rows", () => {
    const out = analyzeCategories(
      [row("2026-05", "c1", "expense", 100), row("2026-05", "c3", "income", 3000)],
      "2026-05",
      cats
    );
    expect(out).toHaveLength(1);
    expect(out[0].categoryId).toBe("c1");
  });

  it("falls back to the category id when the name is unknown", () => {
    const out = analyzeCategories([row("2026-05", "cX", "expense", 10)], "2026-05", cats);
    expect(out[0].name).toBe("cX");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- categories-analysis`
Expected: FAIL — `Cannot find module './categories-analysis'`.

- [ ] **Step 3: Implement categories-analysis.ts**

Create `lib/cockpit/categories-analysis.ts`:

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
  total: number;
  nTxns: number;
  share: number; // 0..1
  avgPrior: number;
  deltaPct: number | null; // null = pas d'historique (nouveau)
};

// Postes de dépense du mois, triés par total décroissant, avec part et tendance.
export function analyzeCategories(
  rows: MonthlyCategoryRow[],
  month: string,
  categories: Category[]
): CategoryInsight[] {
  const expense = rows.filter((r) => r.type === "expense");
  const current = expense.filter((r) => r.year_month === month);
  const totalMonth = current.reduce((a, r) => a + Number(r.total_abs), 0);
  const nameOf = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id;

  const insights = current.map((r) => {
    const priors = expense.filter(
      (x) => x.category_id === r.category_id && x.year_month < month
    );
    const avgPrior =
      priors.length > 0
        ? priors.reduce((a, x) => a + Number(x.total_abs), 0) / priors.length
        : 0;
    const total = Number(r.total_abs);
    return {
      categoryId: r.category_id,
      name: nameOf(r.category_id),
      total,
      nTxns: Number(r.n_txns),
      share: totalMonth > 0 ? total / totalMonth : 0,
      avgPrior,
      deltaPct: avgPrior > 0 ? (total - avgPrior) / avgPrior : null,
    };
  });

  return insights.sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- categories-analysis`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/categories-analysis.ts lib/cockpit/categories-analysis.test.ts
git commit -m "feat(insights): add pure category analysis with tests"
```

---

## Task 2: useMonthlyByCategory hook

**Files:**
- Modify: `lib/cockpit/hooks.ts` (append)

- [ ] **Step 1: Add the import + hook**

In `lib/cockpit/hooks.ts`, add this import after the existing `import type { Asset, AssetValuation, PatrimoineLine } from "./patrimoine";` line:

```ts
import type { MonthlyCategoryRow } from "./categories-analysis";
```

Append at the end of the file:

```ts
export function useMonthlyByCategory(userId: string) {
  const [rows, setRows] = useState<MonthlyCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("v_monthly_by_category")
      .select("year_month,category_id,type,n_txns,total_abs")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setRows((data as MonthlyCategoryRow[]) ?? []);
        }
        setLoading(false);
      });
  }, [userId]);

  return { rows, loading, error };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/hooks.ts
git commit -m "feat(insights): add useMonthlyByCategory hook"
```

---

## Task 3: Breakdown components

**Files:**
- Create: `components/cockpit/CategoryRow.tsx`
- Create: `components/cockpit/CategoryBreakdown.tsx`

- [ ] **Step 1: CategoryRow.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";

export function CategoryRow({
  insight,
  onClick,
}: {
  insight: CategoryInsight;
  onClick: () => void;
}) {
  const pct = Math.round(insight.share * 100);
  const trend =
    insight.deltaPct === null
      ? { text: "nouveau", cls: "text-ink-muted" }
      : insight.deltaPct > 0.05
        ? { text: `↑ +${Math.round(insight.deltaPct * 100)}%`, cls: "text-strat-a" }
        : insight.deltaPct < -0.05
          ? { text: `↓ ${Math.round(insight.deltaPct * 100)}%`, cls: "text-emerald" }
          : { text: "stable", cls: "text-ink-muted" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left py-2.5 border-b border-rule"
    >
      <div className="flex justify-between items-baseline gap-2">
        <div className="text-sm">{insight.name}</div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="font-mono-num text-sm text-strat-a">
            −{eur(insight.total)}
          </span>
          <span className={`font-mono-num text-[11px] ${trend.cls}`}>
            {trend.text}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono-num text-[11px] text-ink-muted w-9 text-right">
          {pct}%
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: CategoryBreakdown.tsx**

```tsx
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  monthLabel,
  onSelect,
}: {
  insights: CategoryInsight[];
  monthLabel: string;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Dépenses par poste · {monthLabel}
      </div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/CategoryRow.tsx components/cockpit/CategoryBreakdown.tsx
git commit -m "feat(insights): add category breakdown components"
```

---

## Task 4: Integrate into the Dashboard

**Files:**
- Modify (full rewrite): `app/cockpit/page.tsx`

- [ ] **Step 1: Rewrite app/cockpit/page.tsx**

Replace the entire contents of `app/cockpit/page.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
  useMonthlyByCategory,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { Fab } from "@/components/cockpit/Fab";
import { TxnModal } from "@/components/cockpit/TxnModal";

const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat } = useMonthlyByCategory(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const label = monthLabelOf(month);

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrillCategory(null);
  };
  const drillTxns = drillCategory
    ? txns.filter((t) => t.category_id === drillCategory)
    : [];
  const drillName =
    categories.find((c) => c.id === drillCategory)?.name ?? "";

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Cockpit</h1>
        <div className="flex items-center gap-2">
          <MonthSwitcher month={month} onChange={changeMonth} />
          <Link href="/cockpit/import" className="text-ink-muted text-sm">
            Import
          </Link>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-ink-muted text-sm"
          >
            Déco
          </button>
        </div>
      </header>

      <HeroBand metrics={metrics} monthLabel={label} />
      <StatStrip metrics={metrics} />

      {drillCategory ? (
        <section>
          <button
            onClick={() => setDrillCategory(null)}
            className="text-ink-muted text-sm mb-2"
          >
            ‹ Retour
          </button>
          <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            {drillName}
          </div>
          <TxnList
            txns={drillTxns}
            categories={categories}
            loading={loading}
            error={error}
            monthLabel={label}
            onSelect={setEditTxn}
          />
        </section>
      ) : (
        <CategoryBreakdown
          insights={insights}
          monthLabel={label}
          onSelect={setDrillCategory}
        />
      )}

      <Fab onClick={() => setShowAdd(true)} label="Ajouter une transaction" />

      {showAdd && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            setShowAdd(false);
          }}
        />
      )}

      {editTxn && (
        <TxnModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSaved={() => {
            refetch();
            setEditTxn(null);
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
git add app/cockpit/page.tsx
git commit -m "feat(insights): replace flat list with category breakdown + drill-down"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `categories-analysis` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit`. Verify:
1. The dashboard shows "Dépenses par poste · {mois}" — expense categories ranked by amount, each with a proportion bar, % and a trend chip (↑ terracotta / ↓ emerald / nouveau / stable), instead of the flat 250-row list.
2. Tapping a category shows "‹ Retour" + the category name + that category's transactions for the month; tapping a transaction still opens the edit modal.
3. "‹ Retour" returns to the breakdown.
4. Changing the month updates the breakdown and resets any drill-down.
5. The FAB still adds a transaction; hero + stat strip are unchanged.

**Known limitation (acceptable):** the breakdown reads `v_monthly_by_category` once on load, so after adding/editing/deleting a transaction the per-category figures refresh on month change or reload (the hero/stat strip, sourced from `useTransactions`, do refresh immediately via `refetch`).

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(insights): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** pure `analyzeCategories` (rank by total, share, deltaPct vs prior mean, "nouveau", expense-only, name fallback) + tests (Task 1); `useMonthlyByCategory` filtered by user_id (Task 2); `CategoryBreakdown`/`CategoryRow` with bar + trend chip colors (Task 3); dashboard swaps flat `TxnList` for breakdown + drill-down reusing `TxnList`, month change resets drill (Task 4); verification incl. drill + trend (Task 5). All covered.
- **Placeholder scan:** none; full code in every step. (`style={{ width }}` is a necessary dynamic value, not a static-class candidate.)
- **Type consistency:** `MonthlyCategoryRow`/`CategoryInsight` (Task 1) consumed by `useMonthlyByCategory` (Task 2) and `CategoryBreakdown`/`CategoryRow` (Task 3); `analyzeCategories(rows, month, categories)` signature matches the page call (Task 4); `onSelect: (categoryId: string)` matches `setDrillCategory`.
- **Behaviour:** hero/stat unchanged; `TxnList`/`TxnModal` reused as-is (edit-by-tap preserved in drill).
- **Branch note:** `category-insights` from `fix-import-source` (keeps the import `source="manual"` fix in the tree). Known staleness of the breakdown vs immediate edits documented in Task 5 as acceptable.
