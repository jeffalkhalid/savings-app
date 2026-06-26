# Boussole Phase 2 — Pont Épargne ↔ Objectifs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relier les opérations d'épargne aux objectifs : une opération `savings` peut être affectée à un objectif (`transactions.goal_id`), et la progression d'un objectif = base manuelle + somme des versements affectés. L'épargne sans objectif reste possible.

**Architecture:** colonne `transactions.goal_id` + `applyContributions` (pur) + `TxnFields.goalId`/`row()` + `useGoalContributions` + sélecteur d'objectif dans `TxnModal` (si type épargne) + page Objectifs affichant la progression effective.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Migration SQL **exécutée manuellement** ; RLS `transactions` déjà active.
- Lien seulement pour `type=savings` ; sinon `goal_id` nul. Option « Aucun (épargne libre) » → nul.
- Progression objectif = `current_amount` (base manuelle) + Σ `abs(amount)` des opérations savings affectées.
- `ContributeModal` reste l'ajustement manuel de la base (inchangé).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `transactions.goal_id`

**Files:** Create `supabase/2026-06-26-txn-goal-link.sql`

- [ ] **Step 1: Create the file**

```sql
-- Pont Épargne ↔ Objectifs (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-txn-goal-link.sql
git commit -m "feat(goals): SQL — transactions.goal_id link"
```

(Not auto-applied — the user runs it before live testing. Requires the `goals` table to already exist.)

---

## Task 2: `applyContributions` (TDD)

**Files:** Modify `lib/cockpit/goals.ts`, `lib/cockpit/goals.test.ts`

**Interfaces:**
- Produces: `applyContributions(goals: Goal[], contribByGoal: Record<string, number>): Goal[]`.

- [ ] **Step 1: Add the failing test** — append to `lib/cockpit/goals.test.ts` (the `g(...)` helper and imports already exist in this file; add `applyContributions` to the existing import from `./goals`):

```ts
import { applyContributions } from "./goals";

describe("applyContributions", () => {
  it("adds linked contributions to the base current_amount", () => {
    const out = applyContributions(
      [
        { id: "a", name: "A", icon: "target", target_amount: 1000, current_amount: 100, deadline: null },
        { id: "b", name: "B", icon: "target", target_amount: 1000, current_amount: 0, deadline: null },
      ],
      { a: 50 }
    );
    expect(out[0].current_amount).toBe(150);
    expect(out[1].current_amount).toBe(0);
  });
  it("leaves goals unchanged with an empty map", () => {
    const out = applyContributions(
      [{ id: "a", name: "A", icon: "target", target_amount: 1000, current_amount: 100, deadline: null }],
      {}
    );
    expect(out[0].current_amount).toBe(100);
  });
});
```
(If `./goals` is already imported once at the top, add `applyContributions` to that import instead of a second import line.)

- [ ] **Step 2: Run** `npm run test -- goals` → FAIL (`applyContributions` not exported).

- [ ] **Step 3: Append to `lib/cockpit/goals.ts`**:

```ts
export function applyContributions(
  goals: Goal[],
  contribByGoal: Record<string, number>
): Goal[] {
  return goals.map((g) => ({
    ...g,
    current_amount: Number(g.current_amount) + (contribByGoal[g.id] ?? 0),
  }));
}
```

- [ ] **Step 4: Run** `npm run test -- goals` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/goals.ts lib/cockpit/goals.test.ts
git commit -m "feat(goals): applyContributions (effective progress) with tests"
```

---

## Task 3: `Txn.goal_id` + `TxnFields.goalId`/`row()` + `useGoalContributions`

**Files:** Modify `lib/cockpit/types.ts`, `lib/cockpit/transactions-api.ts`, `lib/cockpit/hooks.ts`

**Interfaces:**
- Produces: `Txn.goal_id?: string | null`; `TxnFields.goalId?: string | null`; `row()` maps `goal_id`; `useGoalContributions(): { contribByGoal, refetch }`.

- [ ] **Step 1: `Txn` type** — in `lib/cockpit/types.ts`, add `goal_id?: string | null;` to the `Txn` type (after `account_id`):

```ts
export type Txn = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: TxnType;
  category_id?: string | null;
  account_id?: string | null;
  goal_id?: string | null;
};
```

- [ ] **Step 2: `transactions-api.ts`** — add `goalId` to `TxnFields` and map it in `row()`:

In `TxnFields`, add after `categoryType`:
```ts
  goalId?: string | null;
```
In `row()`, add a `goal_id` line (savings only):
```ts
function row(f: TxnFields) {
  return {
    date: f.date,
    amount: signedAmount(f.absAmount, f.categoryType),
    description: f.description || f.categoryName,
    merchant: f.description || null,
    category_id: f.categoryId,
    account_id: f.accountId,
    type: f.categoryType,
    goal_id: f.categoryType === "savings" ? (f.goalId ?? null) : null,
  };
}
```

- [ ] **Step 3: `useGoalContributions` in `hooks.ts`** — append:

```ts
export function useGoalContributions() {
  const [contribByGoal, setContribByGoal] = useState<Record<string, number>>({});

  const refetch = useCallback(() => {
    supabase
      .from("transactions")
      .select("goal_id,amount")
      .eq("type", "savings")
      .not("goal_id", "is", null)
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const r of (data as { goal_id: string; amount: number }[]) ?? []) {
          m[r.goal_id] = (m[r.goal_id] ?? 0) + Math.abs(Number(r.amount));
        }
        setContribByGoal(m);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { contribByGoal, refetch };
}
```

- [ ] **Step 4: Type-check** — Run `npx tsc --noEmit` → no errors (`goalId` optional → existing `TxnFields` callers unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/types.ts lib/cockpit/transactions-api.ts lib/cockpit/hooks.ts
git commit -m "feat(goals): txn goal_id mapping + useGoalContributions"
```

---

## Task 4: Goal select in `TxnModal` + Cockpit wiring

**Files:** Modify `components/cockpit/TxnModal.tsx`, `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `Goal` from `@/lib/cockpit/goals`; `useGoals`.
- Produces: `TxnModal` gains `goals: Goal[]`; assigns `goalId` for savings txns.

- [ ] **Step 1: `TxnModal` — add the prop, state, select**

In `components/cockpit/TxnModal.tsx`:
(a) Add import: `import type { Goal } from "@/lib/cockpit/goals";`
(b) Add `goals: Goal[];` to the props type and destructure `goals`.
(c) Add state after `accountId`:
```tsx
  const [goalId, setGoalId] = useState(txn?.goal_id ?? "");
```
(d) Compute the selected category type (the existing `save` already does `categories.find(...)`; for the render, add near the top of the component body, after the state):
```tsx
  const isSavings =
    categories.find((c) => c.id === categoryId)?.type === "savings";
```
(e) In `save`, set `goalId` on the fields object (replace the `fields` literal's end). Change:
```tsx
    const fields = {
      date,
      absAmount: amt,
      description: description.trim(),
      categoryId,
      categoryName: cat.name,
      accountId,
      categoryType: cat.type,
    };
```
to:
```tsx
    const fields = {
      date,
      absAmount: amt,
      description: description.trim(),
      categoryId,
      categoryName: cat.name,
      accountId,
      categoryType: cat.type,
      goalId: cat.type === "savings" ? goalId || null : null,
    };
```
(f) Add the select in the form, immediately after the Catégorie `<label>` block:
```tsx
          {isSavings && (
            <label className={labelCls}>
              Objectif (optionnel)
              <select
                className={fieldCls}
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                <option value="">Aucun (épargne libre)</option>
                {goals.map((gl) => (
                  <option key={gl.id} value={gl.id}>
                    {gl.name}
                  </option>
                ))}
              </select>
            </label>
          )}
```

- [ ] **Step 2: Cockpit page — provide `goals`**

In `app/cockpit/page.tsx`:
(a) Add `useGoals` to the hooks import block (`from "@/lib/cockpit/hooks"`).
(b) Add near the other hooks: `const { goals } = useGoals();`
(c) Add `goals={goals}` to BOTH `<TxnModal … />` usages (the `showAdd` one and the `editTxn` one).

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/TxnModal.tsx app/cockpit/page.tsx
git commit -m "feat(goals): assign a goal to savings txns in TxnModal"
```

---

## Task 5: Objectifs page — effective progress

**Files:** Modify `app/cockpit/objectifs/page.tsx`

**Interfaces:**
- Consumes: `applyContributions` (Task 2); `useGoalContributions` (Task 3).

- [ ] **Step 1: Wire contributions into the effective goals**

In `app/cockpit/objectifs/page.tsx`:
(a) Imports — change `import { useAuth, useGoals } from "@/lib/cockpit/hooks";` to:
```tsx
import { useAuth, useGoals, useGoalContributions } from "@/lib/cockpit/hooks";
```
and change `import { goalsSummary, type Goal } from "@/lib/cockpit/goals";` to:
```tsx
import { goalsSummary, applyContributions, type Goal } from "@/lib/cockpit/goals";
```
(b) After `const { goals, loading, error, refetch } = useGoals();` add:
```tsx
  const { contribByGoal } = useGoalContributions();
  const effGoals = useMemo(
    () => applyContributions(goals, contribByGoal),
    [goals, contribByGoal]
  );
```
(c) Change the summary memo to use the effective goals:
```tsx
  const summary = useMemo(() => goalsSummary(effGoals), [effGoals]);
```
(d) Render from `effGoals`, but pass the **original** goal to the modals (so `ContributeModal`/`GoalModal` edit the manual base, not the effective amount). Replace the `{goals.map((g) => ( … ))}` block:
```tsx
      {goals.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          today={today}
          onContribute={() => setContribGoal(g)}
          onEdit={() => setEditGoal(g)}
        />
      ))}
```
with:
```tsx
      {effGoals.map((eg) => {
        const orig = goals.find((g) => g.id === eg.id) ?? eg;
        return (
          <GoalCard
            key={eg.id}
            goal={eg}
            today={today}
            onContribute={() => setContribGoal(orig)}
            onEdit={() => setEditGoal(orig)}
          />
        );
      })}
```
(Leave the empty-state condition on `goals.length` as-is.)

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/objectifs/page.tsx
git commit -m "feat(goals): objectifs show effective progress (base + linked savings)"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `applyContributions`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-txn-goal-link.sql` first** (and at least one goal exists). Then:
  1. Add a transaction with an Épargne category → an « Objectif (optionnel) » select appears with « Aucun (épargne libre) » + the goals. Pick a goal; save.
  2. On Objectifs, that goal's ring/card progress increased by the saved amount (base + linked), with no manual « Contribuer ».
  3. Save another savings txn with « Aucun » → Épargne tile counts it, no goal moves.
  4. A non-savings category shows no goal select.
  5. « Contribuer » still adjusts the manual base; deleting a goal leaves its linked txns (goal_id cleared).
  6. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(goals): savings↔goals bridge verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (1) ; applyContributions pure (2) ; type+row+hook (3) ; TxnModal select + « Aucun » + cockpit wiring (4) ; objectifs effective progress (5) ; verification incl. SQL-first + light/dark (6). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `applyContributions` (2) used by objectifs page (5) ; `TxnFields.goalId` (3) set by TxnModal (4) ; `Txn.goal_id` (3) read by TxnModal init (4) ; `useGoalContributions` returns `{ contribByGoal, refetch }` consumed by objectifs page (5) ; `useGoals` provides `goals` to TxnModal (4).
- **Double-count guard:** `ContributeModal`/`GoalModal` receive the **original** goal (manual base), while cards/ring display the **effective** goal — so contributing never bakes linked savings into the base.
- **Back-compat:** `goalId` optional on `TxnFields` → reclassify / `classifyAllTransfers` unchanged (`goal_id` becomes null for them; both deal with transfers, not savings-with-goal).
- **DB note:** column by manual SQL; tests/build don't hit the DB; live smoke needs the migration first.
- **Branch note:** continues `boussole-redesign`; docs on the branch.
