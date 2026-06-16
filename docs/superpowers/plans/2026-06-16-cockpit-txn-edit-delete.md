# Cockpit — Édition / suppression de transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de corriger et supprimer une transaction du Dashboard, en unifiant `AddModal` en un `TxnModal` create/edit/delete et en isolant les écritures Supabase dans un module dédié.

**Architecture:** Helper pur testé `signedAmount` (logique de signe), mutations Supabase dans `transactions-api.ts`, composant unique `TxnModal` (création + édition + suppression avec confirmation inline), câblage via `onSelect` sur `TxnRow`/`TxnList` et un état `editTxn` dans la page.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

---

## File structure

```
lib/cockpit/
  transactions.ts        # PUR + testé : signedAmount(absAmount, categoryType)
  transactions.test.ts   # Vitest
  transactions-api.ts    # createTransaction, updateTransaction, deleteTransaction

components/cockpit/
  TxnModal.tsx           # NOUVEAU (remplace AddModal) : create/edit/delete + confirm inline
  AddModal.tsx           # SUPPRIMÉ en Task 4
  TxnList.tsx            # MODIF : prop onSelect(txn)
  TxnRow.tsx             # MODIF : prop onSelect, onClick

app/cockpit/page.tsx     # MODIF : état editTxn, ouvre TxnModal (create via FAB, edit via liste)
```

Reuse: `@/lib/cockpit/format` (`todayISO`), `@/lib/cockpit/types` (`Txn`, `Category`, `Account`), `@/lib/cockpit/supabase` (`supabase`).

---

## Task 1: signedAmount (TDD)

**Files:**
- Create: `lib/cockpit/transactions.ts`
- Test: `lib/cockpit/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/cockpit/transactions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signedAmount } from "./transactions";

describe("signedAmount", () => {
  it("keeps income positive", () => {
    expect(signedAmount(100, "income")).toBe(100);
  });
  it("makes expense negative", () => {
    expect(signedAmount(100, "expense")).toBe(-100);
  });
  it("makes transfer and savings negative", () => {
    expect(signedAmount(50, "transfer")).toBe(-50);
    expect(signedAmount(50, "savings")).toBe(-50);
  });
  it("normalizes a negative input via Math.abs", () => {
    expect(signedAmount(-100, "income")).toBe(100);
    expect(signedAmount(-100, "expense")).toBe(-100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- transactions`
Expected: FAIL — `Cannot find module './transactions'`.

- [ ] **Step 3: Implement transactions.ts**

Create `lib/cockpit/transactions.ts`:

```ts
// income => positif ; expense / transfer / savings => négatif.
export function signedAmount(absAmount: number, categoryType: string): number {
  return categoryType === "income" ? Math.abs(absAmount) : -Math.abs(absAmount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- transactions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/transactions.ts lib/cockpit/transactions.test.ts
git commit -m "feat(txn): add pure signedAmount helper with tests"
```

---

## Task 2: Mutations API

**Files:**
- Create: `lib/cockpit/transactions-api.ts`

No unit test (Supabase-bound); verified by `npx tsc --noEmit` and smoke (Task 5).

- [ ] **Step 1: Implement transactions-api.ts**

Create `lib/cockpit/transactions-api.ts`:

```ts
import { supabase } from "./supabase";
import { signedAmount } from "./transactions";

export type TxnFields = {
  date: string;
  absAmount: number;
  description: string; // raw user input (may be empty)
  categoryId: string;
  categoryName: string;
  accountId: string;
  categoryType: string;
};

// Shared column mapping. description falls back to the category name;
// merchant keeps the raw user input (or null). Matches the original AddModal insert.
function row(f: TxnFields) {
  return {
    date: f.date,
    amount: signedAmount(f.absAmount, f.categoryType),
    description: f.description || f.categoryName,
    merchant: f.description || null,
    category_id: f.categoryId,
    account_id: f.accountId,
    type: f.categoryType,
  };
}

export async function createTransaction(
  userId: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    ...row(f),
    source: "manual",
  });
  if (error) throw new Error(error.message);
}

export async function updateTransaction(
  id: string,
  f: TxnFields
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update(row(f))
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/transactions-api.ts
git commit -m "feat(txn): add transaction mutations module"
```

---

## Task 3: TxnModal (create / edit / delete)

**Files:**
- Create: `components/cockpit/TxnModal.tsx`

(`AddModal.tsx` is left in place for now; both compile. It is removed in Task 4 once the page no longer imports it.)

- [ ] **Step 1: Create TxnModal.tsx**

Create `components/cockpit/TxnModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/lib/cockpit/transactions-api";
import { todayISO } from "@/lib/cockpit/format";
import type { Category, Account, Txn } from "@/lib/cockpit/types";

export function TxnModal({
  userId,
  categories,
  accounts,
  txn,
  onClose,
  onSaved,
}: {
  userId: string;
  categories: Category[];
  accounts: Account[];
  txn: Txn | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!txn;
  const [date, setDate] = useState(txn?.date ?? todayISO());
  const [amount, setAmount] = useState(
    txn ? String(Math.abs(Number(txn.amount))) : ""
  );
  const [description, setDescription] = useState(txn?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    txn?.category_id ?? categories[0]?.id ?? ""
  );
  const [accountId, setAccountId] = useState(
    txn?.account_id ??
      accounts.find((a) => a.name.includes("BNP"))?.id ??
      accounts[0]?.id ??
      ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fieldCls = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      setError("Catégorie requise");
      return;
    }
    const amt = parseFloat(amount.replace(",", "."));
    if (!isFinite(amt) || amt <= 0) {
      setError("Montant invalide");
      return;
    }
    const fields = {
      date,
      absAmount: amt,
      description: description.trim(),
      categoryId,
      categoryName: cat.name,
      accountId,
      categoryType: cat.type,
    };
    setSaving(true);
    try {
      if (editing && txn) await updateTransaction(txn.id, fields);
      else await createTransaction(userId, fields);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!txn) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await deleteTransaction(txn.id);
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
            {editing ? "Modifier la transaction" : "Nouvelle transaction"}
          </h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Annuler
          </button>
        </header>
        <form onSubmit={save} className="grid gap-3">
          <label className={labelCls}>
            Montant (€)
            <input
              className={fieldCls}
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Description
            <input
              className={fieldCls}
              type="text"
              placeholder="Ex. Carrefour, Uber, café…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Catégorie
            <select
              className={fieldCls}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Compte
            <select
              className={fieldCls}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Date
            <input
              className={fieldCls}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <button
            className="bg-emerald text-paper rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-strat-a text-sm py-2"
            >
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </button>
          )}
          {error && <p className="text-strat-a text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/TxnModal.tsx
git commit -m "feat(txn): add unified TxnModal (create/edit/delete)"
```

---

## Task 4: Wire selection + retire AddModal

**Files:**
- Modify (full rewrite): `components/cockpit/TxnRow.tsx`
- Modify (full rewrite): `components/cockpit/TxnList.tsx`
- Modify (full rewrite): `app/cockpit/page.tsx`
- Delete: `components/cockpit/AddModal.tsx`

- [ ] **Step 1: Rewrite TxnRow.tsx (add onSelect)**

Replace the entire contents of `components/cockpit/TxnRow.tsx` with:

```tsx
import type { Txn } from "@/lib/cockpit/types";
import { eur } from "@/lib/cockpit/format";

export function TxnRow({
  txn,
  categoryName,
  onSelect,
}: {
  txn: Txn;
  categoryName?: string;
  onSelect: () => void;
}) {
  const neg = Number(txn.amount) < 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex justify-between items-center py-3 border-b border-rule text-left"
    >
      <div>
        <div className="text-sm">{txn.description}</div>
        <div className="text-[11px] text-ink-muted mt-0.5">
          {txn.date}
          {categoryName ? ` · ${categoryName}` : ""}
        </div>
      </div>
      <strong
        className={`font-mono-num text-sm ${neg ? "text-strat-a" : "text-emerald"}`}
      >
        {eur(Number(txn.amount))}
      </strong>
    </button>
  );
}
```

- [ ] **Step 2: Rewrite TxnList.tsx (pass onSelect)**

Replace the entire contents of `components/cockpit/TxnList.tsx` with:

```tsx
import type { Txn, Category } from "@/lib/cockpit/types";
import { TxnRow } from "./TxnRow";

export function TxnList({
  txns,
  categories,
  loading,
  error,
  monthLabel,
  onSelect,
}: {
  txns: Txn[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  monthLabel: string;
  onSelect: (txn: Txn) => void;
}) {
  const nameOf = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name;

  return (
    <section>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        {monthLabel} · {txns.length} transaction{txns.length > 1 ? "s" : ""}
      </div>
      {error && <p className="text-strat-a text-sm py-4">{error}</p>}
      {loading && !txns.length && (
        <p className="text-ink-muted text-sm py-4">Chargement…</p>
      )}
      {!loading && !error && !txns.length && (
        <p className="text-ink-muted text-sm py-4">Aucune transaction ce mois.</p>
      )}
      <div>
        {txns.map((t) => (
          <TxnRow
            key={t.id}
            txn={t}
            categoryName={nameOf(t.category_id)}
            onSelect={() => onSelect(t)}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite app/cockpit/page.tsx (TxnModal + editTxn)**

Replace the entire contents of `app/cockpit/page.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  useAuth,
  useTransactions,
  useCategories,
  useAccounts,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
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
  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const label = monthLabelOf(month);

  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <header className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl">Cockpit</h1>
        <div className="flex items-center gap-2">
          <MonthSwitcher month={month} onChange={setMonth} />
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
      <TxnList
        txns={txns}
        categories={categories}
        loading={loading}
        error={error}
        monthLabel={label}
        onSelect={setEditTxn}
      />

      <Fab onClick={() => setShowAdd(true)} />

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

- [ ] **Step 4: Delete the old AddModal**

Run: `git rm components/cockpit/AddModal.tsx`
Expected: file staged for deletion. (Confirm nothing else imports it — grep below.)

Run: `npx tsc --noEmit`
Expected: No errors (no remaining references to `AddModal`).

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/TxnRow.tsx components/cockpit/TxnList.tsx app/cockpit/page.tsx
git commit -m "feat(txn): wire row selection to TxnModal, retire AddModal"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — `format`, `metrics`, `transactions` suites green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. Also confirm no leftover references:
Run: `git grep -n "AddModal"`
Expected: no matches in `app/` or `components/` (only docs/plans may mention it).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit`. Verify:
1. FAB → create a transaction → it appears, stats update (unchanged behaviour).
2. Tap an existing transaction → TxnModal opens pre-filled with the absolute amount, its date, description, category, account.
3. Change the amount and/or category → save → the row and month stats update; sign stays correct (e.g. switching to an `income` category flips it positive).
4. Open a transaction → "Supprimer" → it changes to "Confirmer la suppression"; second click removes the row and refreshes stats.
5. Closing the modal and reopening resets the delete confirmation.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(txn): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** unified TxnModal create/edit/delete (Task 3); inline 2-click delete confirm (Task 3 `confirmDelete`); writes isolated in `transactions-api.ts` (Task 2) removing the AddModal inline insert; pure `signedAmount` + tests (Task 1); sign recomputed from chosen category on save (Task 3 builds `fields` from `cat.type`); row selection wiring (Task 4); AddModal removed (Task 4); verification incl. "no AddModal references" + sign-on-category-change smoke (Task 5). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `TxnFields` (Task 2) is built inline in Task 3 with matching keys (`date, absAmount, description, categoryId, categoryName, accountId, categoryType`); `createTransaction(userId, fields)` / `updateTransaction(id, fields)` / `deleteTransaction(id)` signatures match the call sites in Task 3; `TxnModal` props (Task 3) match the two render sites in Task 4 page; `onSelect` added to TxnRow + TxnList (Task 4) and supplied by the page (`onSelect={setEditTxn}`).
- **Branch note:** this branch is from `main`, where `Fab` has no `label` prop — the page uses `<Fab onClick={...} />` (its hardcoded aria-label "Ajouter une transaction" is already correct here). No Fab change needed.
