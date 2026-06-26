# Boussole Phase 2 — Objectifs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'écran Objectifs (4ᵉ onglet) : épargne par objectif (cible, montant courant, échéance optionnelle, contribuer), sur une nouvelle table `goals` (RLS).

**Architecture:** Table `goals` + modules purs (`goals`, `goal-icon`) + API (`goals-api`) + hook `useGoals` + écran et composants (`GoalRing`, `GoalCard`, `GoalModal`, `ContributeModal`), onglet de nav. Suit les patterns existants (assets/AssetModal/patrimoine-api).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3 (tokens Boussole), Supabase, lucide-react, Vitest.

## Global Constraints

- Table `goals` créée par migration SQL **exécutée manuellement** par l'utilisateur (non auto-appliquée) ; RLS `auth.uid() = user_id`.
- Icônes **lucide** uniquement ; montants `.font-mono-num` ; titres `.font-display`.
- Tokens : opacité (`/NN`) seulement sur hex/white ; texte sur fond coloré = `text-[#FBF3EC]`.
- Modèle simple : `current_amount` dénormalisé (pas d'historique).
- Modales calquées sur `AssetModal` (`bg-paper`, `bg-white` pour les champs, bouton `bg-emerald`).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `goals`

**Files:** Create `supabase/2026-06-26-goals.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Objectifs d'épargne (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  icon text not null default 'target',
  target_amount numeric not null,
  current_amount numeric not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "goals_per_user" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-goals.sql
git commit -m "feat(goals): SQL migration for goals table + RLS"
```

(Note: this is not auto-applied — the user runs it in Supabase before live testing. Build/tests don't touch the DB.)

---

## Task 2: `goals.ts` pure module (TDD)

**Files:** Create `lib/cockpit/goals.ts`, `lib/cockpit/goals.test.ts`

**Interfaces:**
- Produces: `Goal` type; `goalProgress(goal): { pct, remaining, done }`; `monthsLeft(deadline, todayISO): number | null`; `suggestedMonthly(goal, todayISO): number | null`; `goalsSummary(goals): { totalCurrent, totalTarget, pct }`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/goals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  goalProgress,
  monthsLeft,
  suggestedMonthly,
  goalsSummary,
  type Goal,
} from "./goals";

const g = (over: Partial<Goal>): Goal => ({
  id: "1",
  name: "X",
  icon: "target",
  target_amount: 1000,
  current_amount: 250,
  deadline: null,
  ...over,
});

describe("goalProgress", () => {
  it("computes pct, remaining, done", () => {
    expect(goalProgress(g({}))).toEqual({ pct: 0.25, remaining: 750, done: false });
  });
  it("caps pct at 1 and remaining at 0 when over target", () => {
    const p = goalProgress(g({ current_amount: 1200 }));
    expect(p.pct).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.done).toBe(true);
  });
  it("handles target 0 safely", () => {
    const p = goalProgress(g({ target_amount: 0, current_amount: 0 }));
    expect(p.pct).toBe(0);
    expect(p.done).toBe(false);
  });
});

describe("monthsLeft", () => {
  const today = "2026-06-26";
  it("counts whole months ahead", () => {
    expect(monthsLeft("2026-12-26", today)).toBe(6);
    expect(monthsLeft("2027-06-26", today)).toBe(12);
  });
  it("rounds a partial month up to 1", () => {
    expect(monthsLeft("2026-07-01", today)).toBe(1);
  });
  it("is null when absent or past", () => {
    expect(monthsLeft(null, today)).toBeNull();
    expect(monthsLeft("2026-06-20", today)).toBeNull();
  });
});

describe("suggestedMonthly", () => {
  const today = "2026-06-26";
  it("is remaining / monthsLeft", () => {
    expect(
      suggestedMonthly(
        g({ target_amount: 1200, current_amount: 0, deadline: "2026-12-26" }),
        today
      )
    ).toBe(200);
  });
  it("is null without a deadline or when done", () => {
    expect(suggestedMonthly(g({ deadline: null }), today)).toBeNull();
    expect(
      suggestedMonthly(g({ current_amount: 1000, deadline: "2026-12-26" }), today)
    ).toBeNull();
  });
});

describe("goalsSummary", () => {
  it("sums and computes global pct", () => {
    const s = goalsSummary([
      g({ target_amount: 1000, current_amount: 250 }),
      g({ target_amount: 1000, current_amount: 250 }),
    ]);
    expect(s).toEqual({ totalCurrent: 500, totalTarget: 2000, pct: 0.25 });
  });
  it("empty list yields zeros", () => {
    expect(goalsSummary([])).toEqual({ totalCurrent: 0, totalTarget: 0, pct: 0 });
  });
});
```

- [ ] **Step 2: Run** `npm run test -- goals` → FAIL (module not found). (Use `-- goals` — it also matches `goals.test`; that's fine.)

- [ ] **Step 3: Implement** `lib/cockpit/goals.ts`:

```ts
export type Goal = {
  id: string;
  name: string;
  icon: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null; // YYYY-MM-DD
  created_at?: string;
};

export function goalProgress(goal: Goal): {
  pct: number;
  remaining: number;
  done: boolean;
} {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  const remaining = Math.max(0, target - current);
  return { pct, remaining, done: target > 0 && current >= target };
}

export function monthsLeft(
  deadline: string | null | undefined,
  todayISO: string
): number | null {
  if (!deadline || deadline <= todayISO) return null;
  const [dy, dm, dd] = deadline.split("-").map(Number);
  const [ty, tm, td] = todayISO.split("-").map(Number);
  let months = (dy - ty) * 12 + (dm - tm);
  if (dd < td) months -= 1;
  return Math.max(1, months);
}

export function suggestedMonthly(goal: Goal, todayISO: string): number | null {
  const { remaining, done } = goalProgress(goal);
  if (done) return null;
  const m = monthsLeft(goal.deadline, todayISO);
  if (!m) return null;
  return remaining / m;
}

export function goalsSummary(goals: Goal[]): {
  totalCurrent: number;
  totalTarget: number;
  pct: number;
} {
  const totalCurrent = goals.reduce((a, g) => a + Number(g.current_amount), 0);
  const totalTarget = goals.reduce((a, g) => a + Number(g.target_amount), 0);
  const pct = totalTarget > 0 ? Math.max(0, Math.min(1, totalCurrent / totalTarget)) : 0;
  return { totalCurrent, totalTarget, pct };
}
```

- [ ] **Step 4: Run** `npm run test -- goals` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/goals.ts lib/cockpit/goals.test.ts
git commit -m "feat(goals): pure goals module (progress, months, summary) with tests"
```

---

## Task 3: `goal-icon.ts` (TDD)

**Files:** Create `lib/cockpit/goal-icon.ts`, `lib/cockpit/goal-icon.test.ts`

**Interfaces:**
- Produces: `GOAL_ICONS: string[]`; `goalIcon(key: string): LucideIcon`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/goal-icon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { goalIcon, GOAL_ICONS } from "./goal-icon";
import { Home, Target } from "lucide-react";

describe("goalIcon", () => {
  it("maps a known key", () => {
    expect(goalIcon("home")).toBe(Home);
  });
  it("falls back to Target", () => {
    expect(goalIcon("zzz")).toBe(Target);
  });
  it("every GOAL_ICONS key resolves to a component", () => {
    expect(GOAL_ICONS.length).toBeGreaterThan(0);
    for (const k of GOAL_ICONS) expect(goalIcon(k)).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- goal-icon` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/goal-icon.ts`:

```ts
import {
  Target,
  Home,
  Car,
  Plane,
  GraduationCap,
  Gift,
  Heart,
  PiggyBank,
  Shield,
  Umbrella,
  Baby,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

export const GOAL_ICONS: string[] = [
  "target",
  "home",
  "car",
  "plane",
  "graduation",
  "gift",
  "heart",
  "piggy",
  "shield",
  "umbrella",
  "baby",
  "phone",
];

const MAP: Record<string, LucideIcon> = {
  target: Target,
  home: Home,
  car: Car,
  plane: Plane,
  graduation: GraduationCap,
  gift: Gift,
  heart: Heart,
  piggy: PiggyBank,
  shield: Shield,
  umbrella: Umbrella,
  baby: Baby,
  phone: Smartphone,
};

export function goalIcon(key: string): LucideIcon {
  return MAP[key] ?? Target;
}
```

- [ ] **Step 4: Run** `npm run test -- goal-icon` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/goal-icon.ts lib/cockpit/goal-icon.test.ts
git commit -m "feat(goals): goalIcon lucide picker mapping with tests"
```

---

## Task 4: `goals-api.ts` + `useGoals` hook

**Files:** Create `lib/cockpit/goals-api.ts`; Modify `lib/cockpit/hooks.ts`

**Interfaces:**
- Consumes: `supabase`; `Goal` from `./goals` (Task 2).
- Produces: `GoalFields` type; `createGoal`, `updateGoal`, `deleteGoal`, `contributeToGoal`; `useGoals(): { goals, loading, error, refetch }`.

- [ ] **Step 1: Create `lib/cockpit/goals-api.ts`**

```ts
import { supabase } from "./supabase";

export type GoalFields = {
  name: string;
  icon: string;
  targetAmount: number;
  deadline: string | null;
};

export async function createGoal(userId: string, f: GoalFields): Promise<void> {
  const { error } = await supabase.from("goals").insert({
    user_id: userId,
    name: f.name,
    icon: f.icon,
    target_amount: f.targetAmount,
    current_amount: 0,
    deadline: f.deadline,
  });
  if (error) throw new Error(error.message);
}

export async function updateGoal(id: string, f: GoalFields): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({
      name: f.name,
      icon: f.icon,
      target_amount: f.targetAmount,
      deadline: f.deadline,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function contributeToGoal(
  id: string,
  newCurrent: number
): Promise<void> {
  const { error } = await supabase
    .from("goals")
    .update({ current_amount: newCurrent })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Add `useGoals` to `lib/cockpit/hooks.ts`**

Add the `Goal` type import — change the existing line:
```ts
import type { Asset, AssetValuation, PatrimoineLine } from "./patrimoine";
```
to also import Goal (separate line is fine):
```ts
import type { Asset, AssetValuation, PatrimoineLine } from "./patrimoine";
import type { Goal } from "./goals";
```
Then append this hook at the end of the file:
```ts
export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("goals")
      .select("id,name,icon,target_amount,current_amount,deadline,created_at")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setGoals((data as Goal[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { goals, loading, error, refetch };
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/goals-api.ts lib/cockpit/hooks.ts
git commit -m "feat(goals): goals-api CRUD + contribute, useGoals hook"
```

---

## Task 5: `GoalRing` + `GoalCard`

**Files:** Create `components/cockpit/goals/GoalRing.tsx`, `components/cockpit/goals/GoalCard.tsx`

**Interfaces:**
- Consumes: `eur`; `goalIcon` (Task 3); `goalProgress`, `monthsLeft`, `suggestedMonthly`, `Goal` (Task 2).
- Produces: `GoalRing({ pct, totalCurrent, totalTarget })`; `GoalCard({ goal, today, onContribute, onEdit })`.

- [ ] **Step 1: Create `components/cockpit/goals/GoalRing.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";

export function GoalRing({
  pct,
  totalCurrent,
  totalTarget,
}: {
  pct: number;
  totalCurrent: number;
  totalTarget: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="flex flex-col items-center my-2 mb-5">
      <div className="relative w-[140px] h-[140px]">
        <svg width="140" height="140" className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="stroke-rule"
            strokeWidth="10"
          />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="stroke-emerald"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-2xl">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <div className="font-mono-num text-sm text-ink-muted mt-1">
        {eur(totalCurrent)} / {eur(totalTarget)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/goals/GoalCard.tsx`**

```tsx
import { eur } from "@/lib/cockpit/format";
import { goalIcon } from "@/lib/cockpit/goal-icon";
import {
  goalProgress,
  monthsLeft,
  suggestedMonthly,
  type Goal,
} from "@/lib/cockpit/goals";

export function GoalCard({
  goal,
  today,
  onContribute,
  onEdit,
}: {
  goal: Goal;
  today: string;
  onContribute: () => void;
  onEdit: () => void;
}) {
  const Icon = goalIcon(goal.icon);
  const { pct, remaining, done } = goalProgress(goal);
  const m = monthsLeft(goal.deadline, today);
  const rate = suggestedMonthly(goal, today);
  const sub = done
    ? "Atteint ✓"
    : m !== null
      ? `reste ${m} mois${rate ? ` · ${eur(rate)}/mois` : ""}`
      : `reste ${eur(remaining)}`;

  return (
    <div className="bg-card rounded-2xl p-4 mb-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-tile flex items-center justify-center shrink-0">
            <Icon size={20} className="text-ink2" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{goal.name}</div>
            <div className="text-[11.5px] text-ink-muted mt-0.5">{sub}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onContribute}
          className="shrink-0 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
        >
          Contribuer
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="h-1.5 flex-1 rounded-full bg-rule overflow-hidden">
          <div
            className="h-full bg-emerald"
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
        <span className="font-mono-num text-[11px] text-ink-muted shrink-0">
          {eur(goal.current_amount)} / {eur(goal.target_amount)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/goals/GoalRing.tsx components/cockpit/goals/GoalCard.tsx
git commit -m "feat(goals): GoalRing + GoalCard"
```

---

## Task 6: `GoalModal` + `ContributeModal`

**Files:** Create `components/cockpit/goals/GoalModal.tsx`, `components/cockpit/goals/ContributeModal.tsx`

**Interfaces:**
- Consumes: `createGoal`, `updateGoal`, `deleteGoal`, `contributeToGoal` (Task 4); `goalIcon`, `GOAL_ICONS` (Task 3); `Goal` (Task 2); `eur`.
- Produces: `GoalModal({ userId, goal, onClose, onSaved })`; `ContributeModal({ goal, onClose, onSaved })`.

- [ ] **Step 1: Create `components/cockpit/goals/GoalModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createGoal, updateGoal, deleteGoal } from "@/lib/cockpit/goals-api";
import { goalIcon, GOAL_ICONS } from "@/lib/cockpit/goal-icon";
import type { Goal } from "@/lib/cockpit/goals";

export function GoalModal({
  userId,
  goal,
  onClose,
  onSaved,
}: {
  userId: string;
  goal: Goal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!goal;
  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "target");
  const [target, setTarget] = useState(goal ? String(goal.target_amount) : "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
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
    const t = parseFloat(target.replace(",", "."));
    if (!isFinite(t) || t <= 0) {
      setError("Cible invalide");
      return;
    }
    setSaving(true);
    try {
      const fields = {
        name: name.trim(),
        icon,
        targetAmount: t,
        deadline: deadline || null,
      };
      if (editing && goal) await updateGoal(goal.id, fields);
      else await createGoal(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setError("");
    setSaving(true);
    try {
      await deleteGoal(goal.id);
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
            {editing ? "Modifier l'objectif" : "Nouvel objectif"}
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
          <div className={labelCls}>
            Icône
            <div className="grid grid-cols-6 gap-2">
              {GOAL_ICONS.map((k) => {
                const Ic = goalIcon(k);
                const on = k === icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIcon(k)}
                    className={`aspect-square rounded-xl flex items-center justify-center border ${
                      on ? "border-emerald bg-tile" : "border-rule"
                    }`}
                  >
                    <Ic size={18} className={on ? "text-emerald" : "text-ink-muted"} />
                  </button>
                );
              })}
            </div>
          </div>
          <label className={labelCls}>
            Montant cible (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Échéance (optionnel)
            <input
              className={field}
              type="date"
              value={deadline ?? ""}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
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
              className="text-accent text-sm py-2"
            >
              Supprimer cet objectif
            </button>
          )}
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/goals/ContributeModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { contributeToGoal } from "@/lib/cockpit/goals-api";
import { eur } from "@/lib/cockpit/format";
import type { Goal } from "@/lib/cockpit/goals";

export function ContributeModal({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const a = parseFloat(amount.replace(",", "."));
    if (!isFinite(a) || a === 0) {
      setError("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      await contributeToGoal(goal.id, Number(goal.current_amount) + a);
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
        className="bg-paper w-full max-w-[600px] px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">Contribuer</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <p className="text-sm text-ink-muted mb-3">
          {goal.name} · {eur(goal.current_amount)} / {eur(goal.target_amount)}
        </p>
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5 text-[13px] text-ink-muted">
            Montant à ajouter (€)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "…" : "Ajouter"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/goals/GoalModal.tsx components/cockpit/goals/ContributeModal.tsx
git commit -m "feat(goals): GoalModal (icon picker) + ContributeModal"
```

---

## Task 7: Nav tab + Objectifs page

**Files:** Modify `components/cockpit/TabBar.tsx`; Create `app/cockpit/objectifs/page.tsx`

**Interfaces:**
- Consumes: `useGoals` (Task 4); `goalsSummary`, `Goal` (Task 2); `GoalRing`, `GoalCard` (Task 5); `GoalModal`, `ContributeModal` (Task 6); `todayISO`.

- [ ] **Step 1: Add the Objectifs tab in `components/cockpit/TabBar.tsx`**

Replace the import line:
```tsx
import { LayoutGrid, Landmark, TrendingUp } from "lucide-react";
```
with:
```tsx
import { LayoutGrid, Landmark, TrendingUp, Target } from "lucide-react";
```
Then replace the `ITEMS` array:
```tsx
const ITEMS = [
  { href: "/cockpit", label: "Cockpit", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
];
```
with:
```tsx
const ITEMS = [
  { href: "/cockpit", label: "Cockpit", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
  { href: "/cockpit/objectifs", label: "Objectifs", Icon: Target },
];
```

- [ ] **Step 2: Create `app/cockpit/objectifs/page.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useAuth, useGoals } from "@/lib/cockpit/hooks";
import { goalsSummary, type Goal } from "@/lib/cockpit/goals";
import { todayISO } from "@/lib/cockpit/format";
import { Target, Plus } from "lucide-react";
import { GoalRing } from "@/components/cockpit/goals/GoalRing";
import { GoalCard } from "@/components/cockpit/goals/GoalCard";
import { GoalModal } from "@/components/cockpit/goals/GoalModal";
import { ContributeModal } from "@/components/cockpit/goals/ContributeModal";

export default function ObjectifsPage() {
  const user = useAuth();
  const { goals, loading, error, refetch } = useGoals();
  const [showCreate, setShowCreate] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);
  const today = todayISO();
  const summary = useMemo(() => goalsSummary(goals), [goals]);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl">Objectifs</h1>
      </header>

      {error && <p className="text-accent text-sm mb-2">{error}</p>}

      {summary.totalTarget > 0 && (
        <GoalRing
          pct={summary.pct}
          totalCurrent={summary.totalCurrent}
          totalTarget={summary.totalTarget}
        />
      )}

      {loading && !goals.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !goals.length && (
        <div className="text-center py-10 text-ink-muted">
          <Target size={30} className="mx-auto mb-2" />
          <div className="text-sm font-semibold text-ink">Aucun objectif</div>
          <div className="text-xs mt-0.5">Fixe ta première cible d&apos;épargne.</div>
        </div>
      )}

      {goals.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          today={today}
          onContribute={() => setContribGoal(g)}
          onEdit={() => setEditGoal(g)}
        />
      ))}

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full mt-3 border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted flex items-center justify-center gap-1.5"
      >
        <Plus size={16} /> Ajouter un objectif
      </button>

      {showCreate && (
        <GoalModal
          userId={user.id}
          goal={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            refetch();
            setShowCreate(false);
          }}
        />
      )}
      {editGoal && (
        <GoalModal
          userId={user.id}
          goal={editGoal}
          onClose={() => setEditGoal(null)}
          onSaved={() => {
            refetch();
            setEditGoal(null);
          }}
        />
      )}
      {contribGoal && (
        <ContributeModal
          goal={contribGoal}
          onClose={() => setContribGoal(null)}
          onSaved={() => {
            refetch();
            setContribGoal(null);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/TabBar.tsx app/cockpit/objectifs/page.tsx
git commit -m "feat(goals): Objectifs tab + screen (ring, cards, modals)"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `goals`, `goal-icon`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds; `/cockpit/objectifs` present.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-goals.sql` in Supabase first.** Then:
  1. The bottom nav shows a 4th tab **Objectifs** (Target icon) → opens the screen.
  2. Empty state shows the Target icon + "Aucun objectif". "Ajouter un objectif" opens the modal with the lucide icon picker; create a goal with a target and an optional deadline.
  3. The card shows progress bar + "reste N mois · X/mois" (if deadline) or "reste X". The global ring shows the aggregate %.
  4. "Contribuer" adds an amount; bar/ring/sub update after save. Editing changes fields; deleting removes the goal.
  5. RLS: only the logged-in user's goals appear.
  6. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(goals): Phase 2 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL+RLS (Task 1) ; goals pure (Task 2) ; goal-icon (Task 3) ; goals-api + useGoals (Task 4) ; GoalRing/GoalCard (Task 5) ; GoalModal/ContributeModal (Task 6) ; nav tab + screen (Task 7) ; verification incl. SQL-first note + light/dark (Task 8). All spec sections covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `Goal` (Task 2) used by goals-api/useGoals (4), GoalCard (5), modals (6), page (7) ; `GoalFields` (4) used by GoalModal (6) ; `GOAL_ICONS`/`goalIcon` (3) used by GoalModal (6) + GoalCard (5) ; `goalsSummary` (2) used by page (7) ; `useGoals` returns `{ goals, loading, error, refetch }` consumed by page (7).
- **Opacity caveat:** `bg-black/50`, `text-[#FBF3EC]`, `bg-emerald` — valid (black/white/hex). SVG ring uses `stroke-rule`/`stroke-emerald` Tailwind stroke utilities (theme-aware).
- **DB note:** table created by manual SQL; tests/build don't hit the DB, so they pass without it; live smoke needs the migration run first.
- **Branch note:** continues `boussole-redesign`; docs committed on the branch.
