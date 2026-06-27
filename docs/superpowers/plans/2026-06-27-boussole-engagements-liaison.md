# Boussole — Liaison engagements (saisie + import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lier une dépense à un engagement récurrent à la saisie (TxnModal) et à l'import (revue), avec reconnaissance auto des bénéficiaires déjà liés. Extension de la feature engagements ; aucune migration.

**Architecture:** helper pur `isEngagement` ; option dans `TxnModal` (création) ; badge auto + case dans la revue d'import (création à l'import) ; réutilise `recurring_charges`/`createRecurringCharge`/`useRecurringCharges`/`normalizePayee`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest.

## Global Constraints

- Aucune migration SQL (réutilise `recurring_charges`).
- Option engagement **uniquement sur les dépenses** (`type === "expense"` / `amount < 0`).
- Bénéficiaire = `normalizePayee(libellé || nom de catégorie)`. Création best-effort (upsert `onConflict (user_id,payee_key)` → idempotent).
- Tokens : checkbox `accent-emerald`, badge `text-emerald`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: `isEngagement` helper (TDD)

**Files:** Modify `lib/cockpit/recurring-detect.ts`, `lib/cockpit/recurring-detect.test.ts`

- [ ] **Step 1: Add the failing test** — in `lib/cockpit/recurring-detect.test.ts`, add `isEngagement` to the existing `./recurring-detect` import, then append:

```ts
describe("isEngagement", () => {
  const keys = new Set(["netflix", "prlv loyer"]);
  it("matches a known payee, ignoring digits/case", () => {
    expect(isEngagement("NETFLIX 0612", keys)).toBe(true);
    expect(isEngagement("PRLV LOYER 0703", keys)).toBe(true);
    expect(isEngagement("Carrefour", keys)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- recurring-detect` → FAIL.

- [ ] **Step 3: Append to `lib/cockpit/recurring-detect.ts`**:

```ts
export function isEngagement(description: string, keys: Set<string>): boolean {
  return keys.has(normalizePayee(description));
}
```

- [ ] **Step 4: Run** `npm run test -- recurring-detect` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/recurring-detect.ts lib/cockpit/recurring-detect.test.ts
git commit -m "feat(engagements): isEngagement(description, keys) helper with test"
```

---

## Task 2: TxnModal engagement option + cockpit wiring

**Files:** Modify `components/cockpit/TxnModal.tsx`, `app/cockpit/page.tsx`

- [ ] **Step 1: `TxnModal` — imports + prop**

Add imports:
```tsx
import { normalizePayee, isEngagement } from "@/lib/cockpit/recurring-detect";
import { createRecurringCharge } from "@/lib/cockpit/recurring-charges-api";
```
Add `engagementKeys: Set<string>;` to the props type and `engagementKeys` to the destructured params.

- [ ] **Step 2: State + derived**

Add state after `goalId`:
```tsx
  const [engagement, setEngagement] = useState(false);
```
Add after the `isSavings` const:
```tsx
  const selCat = categories.find((c) => c.id === categoryId);
  const isExpense = selCat?.type === "expense";
  const payeeOf = description.trim() || selCat?.name || "";
  const alreadyEngagement = isEngagement(payeeOf, engagementKeys);
```

- [ ] **Step 3: Create the engagement on save**

In `save`, after the transaction is created/updated and before `onSaved()`, add the engagement creation. Replace:
```tsx
      if (editing && txn) await updateTransaction(txn.id, fields);
      else await createTransaction(userId, fields);
      onSaved();
```
with:
```tsx
      if (editing && txn) await updateTransaction(txn.id, fields);
      else await createTransaction(userId, fields);
      if (cat.type === "expense" && engagement && !alreadyEngagement) {
        await createRecurringCharge(userId, {
          payeeKey: normalizePayee(payeeOf),
          label: payeeOf,
          expectedAmount: amt,
        });
      }
      onSaved();
```

- [ ] **Step 4: Render the control** — add, right after the `{isSavings && ( … )}` block:

```tsx
          {isExpense &&
            (alreadyEngagement ? (
              <div className="text-[12px] text-emerald">
                ✓ Déjà un engagement récurrent
              </div>
            ) : (
              <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-emerald"
                  checked={engagement}
                  onChange={(e) => setEngagement(e.target.checked)}
                />
                Engagement récurrent
              </label>
            ))}
```

- [ ] **Step 5: Cockpit — pass keys + refetch charges**

In `app/cockpit/page.tsx`:
(a) Add after the `charges` hook / near the other memos:
```tsx
  const engagementKeys = useMemo(
    () => new Set(charges.map((c) => c.payee_key)),
    [charges]
  );
```
(b) Add `engagementKeys={engagementKeys}` to BOTH `<TxnModal … />` usages.
(c) In BOTH `TxnModal` `onSaved` handlers, add `refetchCharges();` alongside the existing `refetch();`. Example for the add modal:
```tsx
          onSaved={() => {
            refetch();
            refetchCharges();
            setShowAdd(false);
          }}
```
(and the same for the `editTxn` modal).

- [ ] **Step 6: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/TxnModal.tsx app/cockpit/page.tsx
git commit -m "feat(engagements): mark a manual expense as a recurring charge"
```

---

## Task 3: Import — auto-recognition badge + manual mark

**Files:** Modify `components/cockpit/import/ReviewRow.tsx`, `components/cockpit/import/ReviewTable.tsx`, `app/cockpit/import/page.tsx`

- [ ] **Step 1: `ReviewRow.tsx`** — add engagement badge/checkbox

Add to the props type and destructure: `engagementKnown: boolean`, `engagement: boolean`, `onToggleEngagement: (v: boolean) => void`.
In the controls row (`<div className="flex items-center gap-2 mt-1.5">`), after the `<select>…</select>` and before the `{row.duplicate && (…)}` block, add (only for expense rows):
```tsx
        {neg &&
          (engagementKnown ? (
            <span className="text-[11px] text-emerald shrink-0">engagement</span>
          ) : (
            <label className="text-[11px] text-ink-muted flex items-center gap-1 shrink-0">
              <input
                type="checkbox"
                className="accent-emerald"
                checked={engagement}
                onChange={(e) => onToggleEngagement(e.target.checked)}
              />
              engagement
            </label>
          ))}
```
(`neg` already exists = `row.amount < 0`.)

- [ ] **Step 2: `ReviewTable.tsx`** — thread the props

Add import:
```tsx
import { isEngagement } from "@/lib/cockpit/recurring-detect";
```
Change the `Row` type to `type Row = ReviewRowData & { include: boolean; engagement?: boolean };`.
Add to the props type: `engagementKeys: Set<string>;` and `onToggleEngagement: (index: number, v: boolean) => void;` (destructure both).
In the `rows.map(...)`, pass to `<ReviewRow … />`:
```tsx
            engagementKnown={r.amount < 0 && isEngagement(r.label, engagementKeys)}
            engagement={!!r.engagement}
            onToggleEngagement={(v) => onToggleEngagement(i, v)}
```

- [ ] **Step 3: `app/cockpit/import/page.tsx`** — keys, state, create on import

(a) Imports — add:
```tsx
import { useMemo } from "react";
import { useRecurringCharges } from "@/lib/cockpit/hooks";
import { createRecurringCharge } from "@/lib/cockpit/recurring-charges-api";
import { normalizePayee } from "@/lib/cockpit/recurring-detect";
```
(Merge `useMemo` into the existing `react` import; merge `useRecurringCharges` into the existing `@/lib/cockpit/hooks` import.)

(b) Row type: `type Row = ReviewRowData & { include: boolean; engagement?: boolean };`

(c) After `const { accounts } = useAccounts();` add:
```tsx
  const { charges } = useRecurringCharges();
  const engagementKeys = useMemo(
    () => new Set(charges.map((c) => c.payee_key)),
    [charges]
  );
```

(d) Add a setter next to `setInclude`:
```tsx
  const setEngagement = (i: number, v: boolean) =>
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, engagement: v } : r)) : rs
    );
```

(e) In `doImport`, after `await createTransactionsBulk(user.id, importRows);` and before `router.push("/cockpit");`, add:
```tsx
      const seen = new Set<string>();
      for (const r of rows.filter((x) => x.include && x.engagement && x.amount < 0)) {
        const key = normalizePayee(r.label);
        if (!key || engagementKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        await createRecurringCharge(user.id, {
          payeeKey: key,
          label: r.label,
          expectedAmount: Math.abs(r.amount),
        });
      }
```

(f) Pass the new props to `<ReviewTable … />`:
```tsx
          engagementKeys={engagementKeys}
          onToggleEngagement={setEngagement}
```

- [ ] **Step 4: Type-check + build** — Run `npx tsc --noEmit` → clean ; `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/import/ReviewRow.tsx components/cockpit/import/ReviewTable.tsx app/cockpit/import/page.tsx
git commit -m "feat(engagements): import auto-recognition badge + mark line as engagement"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `recurring-detect` with `isEngagement`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** (needs the `recurring_charges` table, already created):
  1. New transaction, expense category → a « Engagement récurrent » checkbox appears (not for income/savings). Check it, save → it appears in the Cockpit engagements (bar + section).
  2. Re-open a new expense with the same payee → shows « ✓ Déjà un engagement récurrent » (no duplicate).
  3. Import a statement → expense lines whose payee is already an engagement show an « engagement » badge; other expense lines show an « engagement » checkbox; ticking one and importing creates that engagement.
  4. After import, the new payees are recognized automatically next time.
  5. Legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(engagements): linking verification fixes"
```

---

## Self-review notes

- **Spec coverage:** isEngagement (1) ; TxnModal create + cockpit keys/refetch (2) ; import badge + checkbox + create-on-import (3) ; verification (4). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `isEngagement`/`normalizePayee` (1) used by TxnModal (2) + ReviewTable/import (3) ; `createRecurringCharge` (existing) used by TxnModal (2) + import (3) ; `engagementKeys: Set<string>` passed TxnModal (2) and ReviewTable (3) ; `useRecurringCharges` returns `{ charges, refetch }` (cockpit already destructures `refetchCharges`).
- **Idempotence:** create is `upsert onConflict (user_id,payee_key)` + in-import `seen` set → no duplicates; `alreadyEngagement`/`engagementKnown` hide the control for known payees.
- **No migration:** reuses the `recurring_charges` table.
- **Branch note:** continues `boussole-redesign`.
