# Boussole Phase 2 — Budgets par catégorie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Budget mensuel fixe et optionnel par catégorie ; les barres du Cockpit passent en « consommé vs budget » (alerte dépassement) quand un budget existe, sinon la barre « part % » actuelle ; modale Budgets pour les fixer.

**Architecture:** colonne `monthly_budget` sur `categories` + module pur `budget.ts` + `categories-api.setCategoryBudget` + `useCategories` (refetch + colonne) + `CategoryRow`/`CategoryBreakdown` + `BudgetsModal`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement** par l'utilisateur ; RLS `categories` déjà active.
- Budget mensuel **fixe** (colonne nullable ; null = pas de budget). Catégories de **dépense** uniquement.
- Tokens : fill `bg-emerald`/`bg-gold`/`bg-accent` (hex → opacité OK), `bg-accent/70` pour la part. Bouton `bg-emerald text-[#FBF3EC]`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL (colonne `monthly_budget`)

**Files:** Create `supabase/2026-06-26-category-budgets.sql`

- [ ] **Step 1: Create the file**

```sql
-- Budgets par catégorie (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.categories add column if not exists monthly_budget numeric;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-category-budgets.sql
git commit -m "feat(budgets): SQL migration — categories.monthly_budget"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `budget.ts` pure module (TDD)

**Files:** Create `lib/cockpit/budget.ts`, `lib/cockpit/budget.test.ts`

**Interfaces:**
- Produces: `BudgetState = "none" | "ok" | "warn" | "over"`; `budgetStatus(consumed, budget): { ratio, pct, state, overBy }`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/budget.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { budgetStatus } from "./budget";

describe("budgetStatus", () => {
  it("is ok below 80%", () => {
    const s = budgetStatus(50, 100);
    expect(s.state).toBe("ok");
    expect(s.pct).toBe(50);
    expect(s.overBy).toBe(0);
  });
  it("is warn between 80% and 100%", () => {
    expect(budgetStatus(90, 100).state).toBe("warn");
  });
  it("is over at/above 100% with pct capped and overBy positive", () => {
    const s = budgetStatus(120, 100);
    expect(s.state).toBe("over");
    expect(s.pct).toBe(100);
    expect(s.overBy).toBe(20);
  });
  it("is none when no/zero budget", () => {
    expect(budgetStatus(50, null).state).toBe("none");
    expect(budgetStatus(50, 0).state).toBe("none");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- budget` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/budget.ts`:

```ts
export type BudgetState = "none" | "ok" | "warn" | "over";

export function budgetStatus(
  consumed: number,
  budget: number | null | undefined
): { ratio: number; pct: number; state: BudgetState; overBy: number } {
  const b = Number(budget);
  if (!budget || !isFinite(b) || b <= 0) {
    return { ratio: 0, pct: 0, state: "none", overBy: 0 };
  }
  const ratio = consumed / b;
  const pct = Math.min(ratio, 1) * 100;
  const state: BudgetState = ratio < 0.8 ? "ok" : ratio < 1 ? "warn" : "over";
  return { ratio, pct, state, overBy: Math.max(0, consumed - b) };
}
```

- [ ] **Step 4: Run** `npm run test -- budget` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/budget.ts lib/cockpit/budget.test.ts
git commit -m "feat(budgets): budgetStatus pure module with tests"
```

---

## Task 3: Type + `useCategories` refetch + `categories-api`

**Files:** Modify `lib/cockpit/types.ts`, `lib/cockpit/hooks.ts`; Create `lib/cockpit/categories-api.ts`

**Interfaces:**
- Produces: `Category.monthly_budget?: number | null`; `useCategories(): { categories, refetch }`; `setCategoryBudget(id, budget): Promise<void>`.

- [ ] **Step 1: Add the field to `Category`**

In `lib/cockpit/types.ts`, change:
```ts
export type Category = { id: string; name: string; type: string; color: string };
```
to:
```ts
export type Category = {
  id: string;
  name: string;
  type: string;
  color: string;
  monthly_budget?: number | null;
};
```

- [ ] **Step 2: `useCategories` — select the column + expose refetch**

In `lib/cockpit/hooks.ts`, replace the whole `useCategories` function:
```ts
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    supabase
      .from("categories")
      .select("id,name,type,color")
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);
  return { categories };
}
```
with:
```ts
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const refetch = useCallback(() => {
    supabase
      .from("categories")
      .select("id,name,type,color,monthly_budget")
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);
  useEffect(() => {
    refetch();
  }, [refetch]);
  return { categories, refetch };
}
```
(`useCallback` is already imported in this file.)

- [ ] **Step 3: Create `lib/cockpit/categories-api.ts`**

```ts
import { supabase } from "./supabase";

export async function setCategoryBudget(
  id: string,
  budget: number | null
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ monthly_budget: budget })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors (all `{ categories }` destructures stay valid).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/types.ts lib/cockpit/hooks.ts lib/cockpit/categories-api.ts
git commit -m "feat(budgets): Category.monthly_budget, useCategories refetch, setCategoryBudget"
```

---

## Task 4: `CategoryRow` — consommé/budget bar

**Files:** Modify `components/cockpit/CategoryRow.tsx`

**Interfaces:**
- Consumes: `budgetStatus` (Task 2).
- Produces: `CategoryRow({ insight, Icon, budget, onClick })` (new `budget: number | null`).

- [ ] **Step 1: Replace `components/cockpit/CategoryRow.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import { budgetStatus, type BudgetState } from "@/lib/cockpit/budget";
import type { LucideIcon } from "lucide-react";

const FILL: Record<Exclude<BudgetState, "none">, string> = {
  ok: "bg-emerald",
  warn: "bg-gold",
  over: "bg-accent",
};

export function CategoryRow({
  insight,
  Icon,
  budget,
  onClick,
}: {
  insight: CategoryInsight;
  Icon: LucideIcon;
  budget: number | null;
  onClick: () => void;
}) {
  const sharePct = Math.round(insight.share * 100);
  const trend =
    insight.deltaPct === null
      ? { text: "nouveau", cls: "text-ink-muted" }
      : insight.deltaPct > 0.05
        ? { text: `+${Math.round(insight.deltaPct * 100)}%`, cls: "text-accent" }
        : insight.deltaPct < -0.05
          ? { text: `${Math.round(insight.deltaPct * 100)}%`, cls: "text-emerald" }
          : { text: "stable", cls: "text-ink-muted" };
  const b = budgetStatus(insight.total, budget);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 py-2.5"
    >
      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
        <Icon size={17} className="text-ink2" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-sm truncate">{insight.name}</span>
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="font-mono-num text-sm">−{eur(insight.total)}</span>
            <span className={`font-mono-num text-[11px] ${trend.cls}`}>
              {trend.text}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {b.state === "none" ? (
            <>
              <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
                <div className="h-full bg-accent/70" style={{ width: `${sharePct}%` }} />
              </div>
              <span className="font-mono-num text-[11px] text-ink-muted w-9 text-right">
                {sharePct}%
              </span>
            </>
          ) : (
            <>
              <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
                <div className={`h-full ${FILL[b.state]}`} style={{ width: `${b.pct}%` }} />
              </div>
              <span
                className={`font-mono-num text-[11px] shrink-0 ${
                  b.state === "over" ? "text-accent" : "text-ink-muted"
                }`}
              >
                {eur(insight.total)} / {eur(budget as number)}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit`. Expected: an error only in `CategoryBreakdown.tsx` (it doesn't pass `budget` yet) — fixed in Task 5. `CategoryRow.tsx` itself compiles.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/CategoryRow.tsx
git commit -m "feat(budgets): CategoryRow consumed/budget bar (states)"
```

---

## Task 5: `CategoryBreakdown` budgets entry + `BudgetsModal`

**Files:** Modify `components/cockpit/CategoryBreakdown.tsx`; Create `components/cockpit/BudgetsModal.tsx`

**Interfaces:**
- Consumes: `Category` (Task 3); `setCategoryBudget` (Task 3); `categoryIcon`; `CategoryRow` (Task 4).
- Produces: `CategoryBreakdown({ insights, categories, onSelect, onEditBudgets })`; `BudgetsModal({ categories, onClose, onSaved })`.

- [ ] **Step 1: Replace `components/cockpit/CategoryBreakdown.tsx`**

```tsx
import type { CategoryInsight } from "@/lib/cockpit/categories-analysis";
import type { Category } from "@/lib/cockpit/types";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { CategoryRow } from "./CategoryRow";

export function CategoryBreakdown({
  insights,
  categories,
  onSelect,
  onEditBudgets,
}: {
  insights: CategoryInsight[];
  categories: Category[];
  onSelect: (categoryId: string) => void;
  onEditBudgets: () => void;
}) {
  const budgetOf = (id: string) =>
    categories.find((c) => c.id === id)?.monthly_budget ?? null;
  return (
    <section>
      <div className="flex justify-between items-baseline mb-1">
        <div className="font-display text-[15px]">Par catégorie</div>
        <button
          type="button"
          onClick={onEditBudgets}
          className="text-[12px] text-ink-muted"
        >
          Budgets
        </button>
      </div>
      {!insights.length && (
        <p className="text-ink-muted text-sm py-4">Aucune dépense ce mois.</p>
      )}
      {insights.map((i) => (
        <CategoryRow
          key={i.categoryId}
          insight={i}
          Icon={categoryIcon(i.name)}
          budget={budgetOf(i.categoryId)}
          onClick={() => onSelect(i.categoryId)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/BudgetsModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { setCategoryBudget } from "@/lib/cockpit/categories-api";
import type { Category } from "@/lib/cockpit/types";

export function BudgetsModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const expense = categories
    .filter((c) => c.type === "expense")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      expense.map((c) => [
        c.id,
        c.monthly_budget != null ? String(c.monthly_budget) : "",
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field =
    "border border-rule rounded-lg px-3 py-2 bg-white text-base w-28 text-right";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      for (const c of expense) {
        const raw = (values[c.id] ?? "").trim();
        const next = raw ? parseFloat(raw.replace(",", ".")) : null;
        if (next !== null && !isFinite(next)) {
          setError(`Budget invalide : ${c.name}`);
          setSaving(false);
          return;
        }
        const prev = c.monthly_budget != null ? Number(c.monthly_budget) : null;
        if (next !== prev) await setCategoryBudget(c.id, next);
      }
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
          <h2 className="font-display text-2xl">Budgets mensuels</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-2">
          {expense.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className="text-sm truncate">{c.name}</span>
              <input
                className={field}
                type="text"
                inputMode="decimal"
                placeholder="—"
                value={values[c.id] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [c.id]: e.target.value }))
                }
              />
            </div>
          ))}
          {!expense.length && (
            <p className="text-ink-muted text-sm py-4">
              Aucune catégorie de dépense.
            </p>
          )}
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60 mt-3"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit`. Expected: an error only in `app/cockpit/page.tsx` (it doesn't pass `categories`/`onEditBudgets` to `CategoryBreakdown` yet) — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/CategoryBreakdown.tsx components/cockpit/BudgetsModal.tsx
git commit -m "feat(budgets): breakdown Budgets button + BudgetsModal"
```

---

## Task 6: Wire the Cockpit page

**Files:** Modify `app/cockpit/page.tsx`

- [ ] **Step 1: Imports + categories refetch**

- Add `import { BudgetsModal } from "@/components/cockpit/BudgetsModal";`.
- Change `const { categories } = useCategories();` to:
```tsx
  const { categories, refetch: refetchCategories } = useCategories();
```

- [ ] **Step 2: State**

Add near the other `useState` flags:
```tsx
  const [showBudgets, setShowBudgets] = useState(false);
```

- [ ] **Step 3: Pass props to `CategoryBreakdown`**

Replace:
```tsx
          <CategoryBreakdown insights={insights} onSelect={openCategory} />
```
with:
```tsx
          <CategoryBreakdown
            insights={insights}
            categories={categories}
            onSelect={openCategory}
            onEditBudgets={() => setShowBudgets(true)}
          />
```

- [ ] **Step 4: Render the modal**

Before the closing `</main>` (after the reminders modals block), add:
```tsx
      {showBudgets && (
        <BudgetsModal
          categories={categories}
          onClose={() => setShowBudgets(false)}
          onSaved={() => {
            refetchCategories();
            setShowBudgets(false);
          }}
        />
      )}
```

- [ ] **Step 5: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(budgets): wire CategoryBreakdown budgets + BudgetsModal"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `budget`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-category-budgets.sql` first.** Then:
  1. « Par catégorie » shows a **Budgets** button → opens the modal listing expense categories with € inputs.
  2. Set a budget under this month's spend for a category → its row bar turns into consommé/budget; ≥100% shows the bar in `accent` and the right label in red.
  3. A budget at 80–99% shows the bar in `gold`; below 80% in `emerald`.
  4. Clearing a budget (empty field) → the row returns to the « part % » bar.
  5. Persists after reload; legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(budgets): Phase 2 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; budget pure (2) ; type+hook+api (3) ; CategoryRow bar (4) ; breakdown button + BudgetsModal (5) ; page wiring (6) ; verification incl. SQL-first + states + light/dark (7). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `budgetStatus`/`BudgetState` (2) used by CategoryRow (4) ; `Category.monthly_budget` (3) used by CategoryBreakdown/BudgetsModal (5) + page (6) ; `setCategoryBudget` (3) used by BudgetsModal (5) ; `useCategories` now returns `{ categories, refetch }` — page (6) uses both; other consumers destructure only `{ categories }` (still valid).
- **Opacity caveat:** fills use hex tokens (`bg-emerald`/`bg-gold`/`bg-accent`, `bg-accent/70`) — valid.
- **Intermediate tsc:** Task 4 leaves a CategoryBreakdown error, Task 5 a page error — each resolved by the next task (noted in-step).
- **DB note:** column added by manual SQL; tests/build don't hit the DB; live smoke needs the migration first.
- **Branch note:** continues `boussole-redesign`; docs on the branch.
