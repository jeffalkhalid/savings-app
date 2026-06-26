# Boussole Phase 2 — Rappels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pense-bêtes ponctuels (label, échéance, montant optionnel, fait) avec cloche + badge dans l'en-tête Cockpit, sur une table `reminders` (RLS).

**Architecture:** Table `reminders` + module pur `reminders.ts` + API `reminders-api` + hook `useReminders` + `RemindersModal` (liste) / `ReminderModal` (form) + cloche/badge dans la page Cockpit. Patterns existants (goals).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, lucide-react, Vitest.

## Global Constraints

- Table `reminders` créée par migration SQL **exécutée manuellement** ; RLS `auth.uid() = user_id`.
- Badge = **en retard + aujourd'hui** (`!done && due_date <= today`).
- Icônes lucide ; montants `.font-mono-num` ; modales motif `AssetModal` (`bg-paper`, champs `bg-white`, bouton `bg-emerald text-[#FBF3EC]`).
- Module pur sans `Date.now` (utiliser `Date.UTC` + `todayISO` passé en argument).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `reminders`

**Files:** Create `supabase/2026-06-26-reminders.sql`

- [ ] **Step 1: Create the file**

```sql
-- Rappels (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  label text not null,
  due_date date not null,
  amount numeric,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;

create policy "reminders_per_user" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-reminders.sql
git commit -m "feat(reminders): SQL migration for reminders + RLS"
```

(Not auto-applied — the user runs it before live testing.)

---

## Task 2: `reminders.ts` pure module (TDD)

**Files:** Create `lib/cockpit/reminders.ts`, `lib/cockpit/reminders.test.ts`

**Interfaces:**
- Produces: `Reminder` type; `ReminderStatus`; `isDue`, `dueCount`, `activeReminders`, `reminderStatus`, `dueLabel`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/reminders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isDue,
  dueCount,
  activeReminders,
  reminderStatus,
  dueLabel,
  type Reminder,
} from "./reminders";

const r = (over: Partial<Reminder>): Reminder => ({
  id: "1",
  label: "X",
  due_date: "2026-06-26",
  amount: null,
  done: false,
  ...over,
});
const today = "2026-06-26";

describe("isDue", () => {
  it("is due when not done and due_date <= today", () => {
    expect(isDue(r({ due_date: "2026-06-20" }), today)).toBe(true);
    expect(isDue(r({ due_date: "2026-06-26" }), today)).toBe(true);
    expect(isDue(r({ due_date: "2026-07-01" }), today)).toBe(false);
    expect(isDue(r({ due_date: "2026-06-20", done: true }), today)).toBe(false);
  });
});

describe("dueCount", () => {
  it("counts due, not-done reminders", () => {
    expect(
      dueCount(
        [
          r({ due_date: "2026-06-20" }),
          r({ due_date: "2026-07-01" }),
          r({ due_date: "2026-06-26", done: true }),
        ],
        today
      )
    ).toBe(1);
  });
});

describe("activeReminders", () => {
  it("excludes done and sorts by due_date asc", () => {
    const out = activeReminders([
      r({ id: "a", due_date: "2026-07-10" }),
      r({ id: "b", due_date: "2026-06-01" }),
      r({ id: "c", due_date: "2026-06-15", done: true }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("reminderStatus", () => {
  it("classifies overdue/today/upcoming/done", () => {
    expect(reminderStatus(r({ due_date: "2026-06-20" }), today)).toBe("overdue");
    expect(reminderStatus(r({ due_date: "2026-06-26" }), today)).toBe("today");
    expect(reminderStatus(r({ due_date: "2026-07-01" }), today)).toBe("upcoming");
    expect(reminderStatus(r({ done: true }), today)).toBe("done");
  });
});

describe("dueLabel", () => {
  it("formats a relative label", () => {
    expect(dueLabel("2026-06-20", today)).toBe("en retard");
    expect(dueLabel("2026-06-26", today)).toBe("aujourd'hui");
    expect(dueLabel("2026-06-29", today)).toBe("dans 3 j");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- reminders` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/reminders.ts`:

```ts
export type Reminder = {
  id: string;
  label: string;
  due_date: string; // YYYY-MM-DD
  amount?: number | null;
  done: boolean;
  created_at?: string;
};

export type ReminderStatus = "overdue" | "today" | "upcoming" | "done";

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

export function isDue(r: Reminder, todayISO: string): boolean {
  return !r.done && r.due_date <= todayISO;
}

export function dueCount(reminders: Reminder[], todayISO: string): number {
  return reminders.filter((r) => isDue(r, todayISO)).length;
}

export function activeReminders(reminders: Reminder[]): Reminder[] {
  return reminders
    .filter((r) => !r.done)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
}

export function reminderStatus(r: Reminder, todayISO: string): ReminderStatus {
  if (r.done) return "done";
  const d = daysBetween(todayISO, r.due_date);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  return "upcoming";
}

export function dueLabel(dueDate: string, todayISO: string): string {
  const d = daysBetween(todayISO, dueDate);
  if (d < 0) return "en retard";
  if (d === 0) return "aujourd'hui";
  return `dans ${d} j`;
}
```

- [ ] **Step 4: Run** `npm run test -- reminders` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/reminders.ts lib/cockpit/reminders.test.ts
git commit -m "feat(reminders): pure reminders module (due/status/label) with tests"
```

---

## Task 3: `reminders-api.ts` + `useReminders` hook

**Files:** Create `lib/cockpit/reminders-api.ts`; Modify `lib/cockpit/hooks.ts`

**Interfaces:**
- Consumes: `supabase`; `Reminder` from `./reminders` (Task 2).
- Produces: `ReminderFields`; `createReminder`, `updateReminder`, `deleteReminder`, `setReminderDone`; `useReminders(): { reminders, loading, error, refetch }`.

- [ ] **Step 1: Create `lib/cockpit/reminders-api.ts`**

```ts
import { supabase } from "./supabase";

export type ReminderFields = {
  label: string;
  dueDate: string;
  amount: number | null;
};

export async function createReminder(
  userId: string,
  f: ReminderFields
): Promise<void> {
  const { error } = await supabase.from("reminders").insert({
    user_id: userId,
    label: f.label,
    due_date: f.dueDate,
    amount: f.amount,
    done: false,
  });
  if (error) throw new Error(error.message);
}

export async function updateReminder(
  id: string,
  f: ReminderFields
): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ label: f.label, due_date: f.dueDate, amount: f.amount })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setReminderDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({ done })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Add `useReminders` to `lib/cockpit/hooks.ts`**

Add the import near the other `./` type imports:
```ts
import type { Reminder } from "./reminders";
```
Append at the END of the file:
```ts
export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("reminders")
      .select("id,label,due_date,amount,done,created_at")
      .order("due_date")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError(null);
          setReminders((data as Reminder[]) ?? []);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reminders, loading, error, refetch };
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/reminders-api.ts lib/cockpit/hooks.ts
git commit -m "feat(reminders): reminders-api CRUD + useReminders hook"
```

---

## Task 4: `RemindersModal` + `ReminderModal`

**Files:** Create `components/cockpit/RemindersModal.tsx`, `components/cockpit/ReminderModal.tsx`

**Interfaces:**
- Consumes: `activeReminders`, `reminderStatus`, `dueLabel`, `Reminder` (Task 2); `createReminder`, `updateReminder`, `deleteReminder` (Task 3); `eur`, `todayISO`.
- Produces: `RemindersModal({ reminders, today, onAdd, onEdit, onToggleDone, onClose })`; `ReminderModal({ userId, reminder, onClose, onSaved })`.

- [ ] **Step 1: Create `components/cockpit/RemindersModal.tsx`**

```tsx
"use client";

import { eur } from "@/lib/cockpit/format";
import {
  activeReminders,
  reminderStatus,
  dueLabel,
  type Reminder,
} from "@/lib/cockpit/reminders";
import { Bell, Plus, Check } from "lucide-react";

const STATUS_CLS: Record<string, string> = {
  overdue: "text-accent",
  today: "text-gold",
  upcoming: "text-ink-muted",
  done: "text-ink-muted",
};

export function RemindersModal({
  reminders,
  today,
  onAdd,
  onEdit,
  onToggleDone,
  onClose,
}: {
  reminders: Reminder[];
  today: string;
  onAdd: () => void;
  onEdit: (r: Reminder) => void;
  onToggleDone: (r: Reminder) => void;
  onClose: () => void;
}) {
  const list = activeReminders(reminders);
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
          <h2 className="font-display text-2xl">Rappels</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {!list.length && (
          <div className="text-center py-8 text-ink-muted">
            <Bell size={28} className="mx-auto mb-1.5" />
            <div className="text-sm font-semibold text-ink">Aucun rappel</div>
            <div className="text-xs mt-0.5">Ajoute un pense-bête.</div>
          </div>
        )}

        {list.map((r) => {
          const st = reminderStatus(r, today);
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2.5 border-b border-rule"
            >
              <Bell size={18} className={STATUS_CLS[st]} />
              <button
                type="button"
                onClick={() => onEdit(r)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-sm truncate">{r.label}</div>
                <div className="text-[11.5px] text-ink-muted mt-0.5">
                  {dueLabel(r.due_date, today)}
                  {r.amount != null ? ` · ${eur(Number(r.amount))}` : ""}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onToggleDone(r)}
                aria-label="Marquer fait"
                className="shrink-0 flex items-center gap-1 text-[12px] font-semibold bg-emerald text-[#FBF3EC] rounded-lg px-3 py-1.5"
              >
                <Check size={14} /> Fait
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="w-full mt-4 border-2 border-dashed border-rule rounded-2xl py-3.5 text-sm font-semibold text-ink-muted flex items-center justify-center gap-1.5"
        >
          <Plus size={16} /> Ajouter un rappel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/cockpit/ReminderModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  createReminder,
  updateReminder,
  deleteReminder,
} from "@/lib/cockpit/reminders-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Reminder } from "@/lib/cockpit/reminders";

export function ReminderModal({
  userId,
  reminder,
  onClose,
  onSaved,
}: {
  userId: string;
  reminder: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!reminder;
  const [label, setLabel] = useState(reminder?.label ?? "");
  const [dueDate, setDueDate] = useState(reminder?.due_date ?? todayISO());
  const [amount, setAmount] = useState(
    reminder?.amount != null ? String(reminder.amount) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!label.trim()) {
      setError("Libellé requis");
      return;
    }
    if (!dueDate) {
      setError("Échéance requise");
      return;
    }
    const amt = amount.trim() ? parseFloat(amount.replace(",", ".")) : null;
    if (amt !== null && !isFinite(amt)) {
      setError("Montant invalide");
      return;
    }
    setSaving(true);
    try {
      const fields = { label: label.trim(), dueDate, amount: amt };
      if (editing && reminder) await updateReminder(reminder.id, fields);
      else await createReminder(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!reminder) return;
    setError("");
    setSaving(true);
    try {
      await deleteReminder(reminder.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1001] bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-paper w-full max-w-[600px] max-h-[90vh] overflow-auto px-6 pt-6 pb-10 rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="font-display text-2xl">
            {editing ? "Modifier le rappel" : "Nouveau rappel"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-3">
          <label className={labelCls}>
            Libellé
            <input
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className={labelCls}>
            Échéance
            <input
              className={field}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Montant (optionnel)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
              Supprimer ce rappel
            </button>
          )}
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
git add components/cockpit/RemindersModal.tsx components/cockpit/ReminderModal.tsx
git commit -m "feat(reminders): RemindersModal (list + Fait) + ReminderModal (form)"
```

---

## Task 5: Wire the bell + badge into the Cockpit page

**Files:** Modify `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `useReminders` (Task 3); `dueCount`, `Reminder` (Task 2); `RemindersModal`, `ReminderModal` (Task 4); `todayISO`; `Bell` (lucide).

- [ ] **Step 1: Imports**

- Add `useReminders` to the hooks import block (`from "@/lib/cockpit/hooks"`).
- Add `Bell` to the lucide import line (`import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, Settings, Bell, type LucideIcon } from "lucide-react";`).
- Add `import { dueCount, type Reminder } from "@/lib/cockpit/reminders";`.
- Add `import { RemindersModal } from "@/components/cockpit/RemindersModal";` and `import { ReminderModal } from "@/components/cockpit/ReminderModal";`.
- Add `todayISO` to the format import. The current line is `import { currentMonth } from "@/lib/cockpit/format";` → change to `import { currentMonth, todayISO } from "@/lib/cockpit/format";`.

- [ ] **Step 2: State + data**

Add near the other `useState` flags:
```tsx
  const [showReminders, setShowReminders] = useState(false);
  const [reminderForm, setReminderForm] = useState<Reminder | "new" | null>(null);
```
Add near the other hooks (e.g. after `useUserSettings`):
```tsx
  const { reminders, refetch: refetchReminders } = useReminders();
```
Add after `const label = monthLabelOf(month);` (or near the other derived values):
```tsx
  const today = todayISO();
  const reminderDue = dueCount(reminders, today);
```
(If a `today`/`todayISO()` const already exists in the file, reuse it instead of redeclaring.)

- [ ] **Step 3: Header bell (before the gear)**

In the header actions `div`, insert this **before** the Réglages gear `<button>`:
```tsx
          <button
            onClick={() => setShowReminders(true)}
            aria-label="Rappels"
            className="relative text-ink-muted"
            type="button"
          >
            <Bell size={18} />
            {reminderDue > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-[#FBF3EC] text-[10px] font-bold flex items-center justify-center">
                {reminderDue}
              </span>
            )}
          </button>
```

- [ ] **Step 4: Render the modals**

Before the closing `</main>` (after the `{showSettings && (...)}` block), add:
```tsx
      {showReminders && (
        <RemindersModal
          reminders={reminders}
          today={today}
          onAdd={() => setReminderForm("new")}
          onEdit={(r) => setReminderForm(r)}
          onToggleDone={async (r) => {
            const { setReminderDone } = await import(
              "@/lib/cockpit/reminders-api"
            );
            await setReminderDone(r.id, !r.done);
            refetchReminders();
          }}
          onClose={() => setShowReminders(false)}
        />
      )}
      {reminderForm && (
        <ReminderModal
          userId={user.id}
          reminder={reminderForm === "new" ? null : reminderForm}
          onClose={() => setReminderForm(null)}
          onSaved={() => {
            refetchReminders();
            setReminderForm(null);
          }}
        />
      )}
```

Note: the dynamic `import()` of `setReminderDone` keeps the page's import list small; alternatively add `setReminderDone` to a top `import { … } from "@/lib/cockpit/reminders-api"`. Either is fine — prefer the static import for clarity:
- Add at top: `import { setReminderDone } from "@/lib/cockpit/reminders-api";` and replace the `onToggleDone` body with:
```tsx
          onToggleDone={async (r) => {
            await setReminderDone(r.id, !r.done);
            refetchReminders();
          }}
```

- [ ] **Step 5: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(reminders): cockpit bell + badge, reminders modals"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `reminders`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-reminders.sql` first.** Then:
  1. Cockpit header shows a bell (before the gear). With an overdue/today reminder, a count badge appears.
  2. Bell opens the list (sorted by échéance, status colors: overdue accent, today gold, upcoming muted).
  3. "Ajouter un rappel" → form (label, date défaut aujourd'hui, montant optionnel) → create; it appears in the list.
  4. "Fait" removes it from the list and drops the badge; editing/deleting works.
  5. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(reminders): Phase 2 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (Task 1) ; reminders pure (Task 2) ; api + hook (Task 3) ; RemindersModal/ReminderModal (Task 4) ; bell+badge+wiring (Task 5) ; verification incl. SQL-first + light/dark (Task 6). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `Reminder` (2) used by api/hook (3), modals (4), page (5) ; `ReminderFields` (3) used by ReminderModal (4) ; `dueCount` (2) used by page (5) ; `activeReminders`/`reminderStatus`/`dueLabel` (2) used by RemindersModal (4) ; `useReminders` returns `{ reminders, loading, error, refetch }` consumed by page (5).
- **Modal stacking:** `ReminderModal` uses `z-[1001]` so the form sits above the open `RemindersModal` (`z-[1000]`).
- **Pure/no-Date.now:** `reminders.ts` uses `Date.UTC` + passed `todayISO`; the page supplies `today` via `todayISO()`.
- **DB note:** table by manual SQL; tests/build don't hit the DB; live smoke needs the migration first.
- **Branch note:** continues `boussole-redesign`; docs on the branch.
