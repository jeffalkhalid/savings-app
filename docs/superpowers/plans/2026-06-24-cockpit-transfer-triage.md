# Cockpit — Tri des virements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un outil de tri pour reclasser les virements (`type=transfer`) du mois vers leur vraie catégorie/type, afin que taux d'épargne / dépenses / transferts deviennent fidèles.

**Architecture:** Helper pur `pendingTransfers`, une cellule « Transferts » du `StatStrip` rendue tappable, et un drill `TransferTriage`/`TransferTriageRow` qui reclasse chaque virement via l'`updateTransaction` existant puis `refetch`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

## Global Constraints

- Styling : tokens Tailwind (`ink`, `paper`, `ink-muted`, `rule`, `emerald`, `strat-a`), mobile-first ; `.font-mono-num` pour les chiffres. `style` inline interdit (rien de dynamique ici).
- Lectures via hooks ; écritures via `@/lib/cockpit/transactions-api` (`updateTransaction` re-signe le montant selon le type de la catégorie). RLS par `user_id`.
- Module pur testé Vitest ; `npx tsc --noEmit` clean ; `npm run build` OK avant fin.

---

## Task 1: transfers.ts pure module (TDD)

**Files:**
- Create: `lib/cockpit/transfers.ts`
- Test: `lib/cockpit/transfers.test.ts`

**Interfaces:**
- Consumes: `Txn` from `./types`.
- Produces: `pendingTransfers(txns: Txn[]): Txn[]`.

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/transfers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pendingTransfers } from "./transfers";
import type { Txn } from "./types";

const t = (type: Txn["type"], date: string): Txn => ({
  id: type + date,
  date,
  amount: -100,
  description: type,
  type,
});

describe("pendingTransfers", () => {
  it("keeps only transfer transactions", () => {
    const out = pendingTransfers([
      t("transfer", "2026-05-02"),
      t("expense", "2026-05-03"),
      t("income", "2026-05-04"),
      t("savings", "2026-05-05"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("transfer");
  });
  it("sorts by date descending", () => {
    const out = pendingTransfers([
      t("transfer", "2026-05-02"),
      t("transfer", "2026-05-10"),
      t("transfer", "2026-05-05"),
    ]);
    expect(out.map((x) => x.date)).toEqual([
      "2026-05-10",
      "2026-05-05",
      "2026-05-02",
    ]);
  });
  it("returns [] when there are no transfers", () => {
    expect(pendingTransfers([t("expense", "2026-05-01")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- transfers`
Expected: FAIL — `Cannot find module './transfers'`.

- [ ] **Step 3: Implement transfers.ts**

Create `lib/cockpit/transfers.ts`:

```ts
import type { Txn } from "./types";

// Virements à classer : transactions type=transfer, triées par date décroissante.
export function pendingTransfers(txns: Txn[]): Txn[] {
  return txns
    .filter((t) => t.type === "transfer")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- transfers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/transfers.ts lib/cockpit/transfers.test.ts
git commit -m "feat(transfers): add pendingTransfers helper with tests"
```

---

## Task 2: StatStrip tappable + triage components

**Files:**
- Modify (full rewrite): `components/cockpit/StatStrip.tsx`
- Create: `components/cockpit/TransferTriageRow.tsx`
- Create: `components/cockpit/TransferTriage.tsx`

**Interfaces:**
- Consumes: `eur` from `@/lib/cockpit/format`; `Txn`, `Category` from `@/lib/cockpit/types`; `Metrics` from `@/lib/cockpit/metrics`.
- Produces: `StatStrip({ metrics, onTransfers? })`; `TransferTriageRow({ txn, categories, onReclassify })`; `TransferTriage({ transfers, categories, onReclassify, onBack })`.

- [ ] **Step 1: Rewrite StatStrip.tsx (Transferts cell tappable)**

Replace the entire contents of `components/cockpit/StatStrip.tsx` with:

```tsx
import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({
  metrics,
  onTransfers,
}: {
  metrics: Metrics;
  onTransfers?: () => void;
}) {
  const items: { k: string; v: string; c: string; onClick?: () => void }[] = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-strat-a" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink" },
    { k: "Transferts", v: eur(metrics.transferts), c: "text-ink", onClick: onTransfers },
  ];
  return (
    <div className="flex mb-6">
      {items.map((it, i) => {
        const cls = `flex-1 text-left ${i > 0 ? "border-l border-rule pl-2.5" : ""}`;
        const inner = (
          <>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">
              {it.k}
            </div>
            <div className={`font-mono-num text-sm mt-1 ${it.c}`}>{it.v}</div>
          </>
        );
        return it.onClick ? (
          <button key={it.k} type="button" onClick={it.onClick} className={cls}>
            {inner}
          </button>
        ) : (
          <div key={it.k} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: TransferTriageRow.tsx**

```tsx
import { eur } from "@/lib/cockpit/format";
import type { Txn, Category } from "@/lib/cockpit/types";

export function TransferTriageRow({
  txn,
  categories,
  onReclassify,
}: {
  txn: Txn;
  categories: Category[];
  onReclassify: (txn: Txn, categoryId: string) => void;
}) {
  const neg = Number(txn.amount) < 0;
  return (
    <div className="py-2.5 border-b border-rule">
      <div className="flex justify-between items-center gap-2">
        <div className="min-w-0">
          <div className="text-sm truncate">{txn.description}</div>
          <div className="text-[11px] text-ink-muted mt-0.5">{txn.date}</div>
        </div>
        <strong
          className={`font-mono-num text-sm shrink-0 ${
            neg ? "text-strat-a" : "text-emerald"
          }`}
        >
          {eur(Number(txn.amount))}
        </strong>
      </div>
      <select
        className="border border-rule rounded-lg px-2 py-1.5 text-[13px] bg-white w-full mt-1.5"
        value={txn.category_id ?? ""}
        onChange={(e) => onReclassify(txn, e.target.value)}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type})
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: TransferTriage.tsx**

```tsx
import type { Txn, Category } from "@/lib/cockpit/types";
import { TransferTriageRow } from "./TransferTriageRow";

export function TransferTriage({
  transfers,
  categories,
  onReclassify,
  onBack,
}: {
  transfers: Txn[];
  categories: Category[];
  onReclassify: (txn: Txn, categoryId: string) => void;
  onBack: () => void;
}) {
  return (
    <section>
      <button onClick={onBack} className="text-ink-muted text-sm mb-2">
        ‹ Retour
      </button>
      <div className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
        Virements à classer · {transfers.length}
      </div>
      {!transfers.length && (
        <p className="text-ink-muted text-sm py-4">
          Tous les virements sont classés.
        </p>
      )}
      {transfers.map((t) => (
        <TransferTriageRow
          key={t.id}
          txn={t}
          categories={categories}
          onReclassify={onReclassify}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/StatStrip.tsx components/cockpit/TransferTriageRow.tsx components/cockpit/TransferTriage.tsx
git commit -m "feat(transfers): make Transferts stat tappable + triage components"
```

---

## Task 3: Dashboard integration

**Files:**
- Modify (full rewrite): `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `pendingTransfers` (Task 1); `StatStrip` (onTransfers), `TransferTriage` (Task 2); `updateTransaction` from `@/lib/cockpit/transactions-api`; existing dashboard pieces.
- Produces: the wired dashboard (no exports consumed elsewhere).

Reference: the current `app/cockpit/page.tsx` already has `showFixed` (fixed-charges drill), `drillCategory` (category drill), `FixedVariableBar`, `CategoryBreakdown`, `catError`, and the FAB/TxnModal. This task adds a `showTransfers` drill alongside them.

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
  useRecurring,
} from "@/lib/cockpit/hooks";
import { computeMetrics } from "@/lib/cockpit/metrics";
import { analyzeCategories } from "@/lib/cockpit/categories-analysis";
import { monthlyFixedTotal, fixedVariableSplit } from "@/lib/cockpit/fixed";
import { pendingTransfers } from "@/lib/cockpit/transfers";
import { currentMonth } from "@/lib/cockpit/format";
import { supabase } from "@/lib/cockpit/supabase";
import { updateTransaction } from "@/lib/cockpit/transactions-api";
import type { Txn } from "@/lib/cockpit/types";
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { CategoryBreakdown } from "@/components/cockpit/CategoryBreakdown";
import { FixedVariableBar } from "@/components/cockpit/FixedVariableBar";
import { FixedChargesList } from "@/components/cockpit/FixedChargesList";
import { TransferTriage } from "@/components/cockpit/TransferTriage";
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
  const [showFixed, setShowFixed] = useState(false);
  const [showTransfers, setShowTransfers] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const { txns, loading, error, refetch } = useTransactions(month);
  const { categories } = useCategories();
  const { accounts } = useAccounts();
  const { rows: monthlyByCat, error: catError } = useMonthlyByCategory(user.id);
  const { recurring } = useRecurring(user.id);

  const metrics = useMemo(() => computeMetrics(txns), [txns]);
  const insights = useMemo(
    () => analyzeCategories(monthlyByCat, month, categories),
    [monthlyByCat, month, categories]
  );
  const fixedTotal = useMemo(() => monthlyFixedTotal(recurring), [recurring]);
  const split = useMemo(
    () => fixedVariableSplit(metrics.depenses, fixedTotal),
    [metrics.depenses, fixedTotal]
  );
  const transfers = useMemo(() => pendingTransfers(txns), [txns]);
  const label = monthLabelOf(month);

  const changeMonth = (m: string) => {
    setMonth(m);
    setDrillCategory(null);
    setShowFixed(false);
    setShowTransfers(false);
  };
  const openTransfers = () => {
    setDrillCategory(null);
    setShowFixed(false);
    setTransferError(null);
    setShowTransfers(true);
  };
  const reclassify = async (txn: Txn, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setTransferError(null);
    try {
      await updateTransaction(txn.id, {
        date: txn.date,
        absAmount: Math.abs(Number(txn.amount)),
        description: txn.description,
        categoryId,
        categoryName: cat.name,
        accountId: txn.account_id ?? "",
        categoryType: cat.type,
      });
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
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
      <StatStrip metrics={metrics} onTransfers={openTransfers} />

      {showTransfers ? (
        <>
          {transferError && (
            <p className="text-strat-a text-sm mb-2">{transferError}</p>
          )}
          <TransferTriage
            transfers={transfers}
            categories={categories}
            onReclassify={reclassify}
            onBack={() => setShowTransfers(false)}
          />
        </>
      ) : showFixed ? (
        <FixedChargesList
          recurring={recurring}
          categories={categories}
          onBack={() => setShowFixed(false)}
        />
      ) : drillCategory ? (
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
        <>
          {fixedTotal > 0 && (
            <FixedVariableBar
              fixe={split.fixe}
              variable={split.variable}
              fixedShare={split.fixedShare}
              onDrill={() => setShowFixed(true)}
            />
          )}
          {catError && (
            <p className="text-ink-muted text-xs mb-2">
              Répartition indisponible — réessaie plus tard.
            </p>
          )}
          <CategoryBreakdown
            insights={insights}
            monthLabel={label}
            onSelect={setDrillCategory}
          />
        </>
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
git commit -m "feat(transfers): wire Transferts triage drill into dashboard"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `transfers` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit`. Verify:
1. The "Transferts" stat in the strip is tappable → opens "Virements à classer · N" with each transfer of the month (date, label, signed amount, a category dropdown defaulting to its current category).
2. Picking a non-transfer category for a transfer (e.g. an income one for a received virement, or "Bourse / Natixis" for a savings move) reclassifies it: the row drops out of the list on refetch, and the strip updates (Transferts ↓, Épargne/Revenus ↑, taux d'épargne and reste à vivre recompute).
3. A genuinely internal move can be left as-is (stays a transfer, remains in the list).
4. "‹ Retour" returns to the dashboard; the category breakdown and fixed bar are unchanged.
5. Tapping "Transferts" while in a category drill or the fixed-charges view switches cleanly to the triage (and back returns to the dashboard, not the previous drill).
6. Changing the month resets the triage view.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(transfers): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** `pendingTransfers` pure + tested (Task 1); `StatStrip` Transferts cell tappable via `onTransfers`, `TransferTriage` + `TransferTriageRow` with category select (Task 2); dashboard `showTransfers` drill, `reclassify` via `updateTransaction` (re-signs by category type) + refetch, error surfaced, other drills reset on open, month reset (Task 3); verification incl. reclassify effect on stats, leave-internal, drill switching (Task 4). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `pendingTransfers(txns)` (Task 1) used by the page (Task 3); `StatStrip` `onTransfers?` and `TransferTriage`/`TransferTriageRow` props (Task 2) match the page call (Task 3); `updateTransaction(id, TxnFields)` field names (`date, absAmount, description, categoryId, categoryName, accountId, categoryType`) match the existing `transactions-api`. `Txn.category_id`/`account_id` are `string | null` and handled (`?? ""`).
- **Re-sign behavior:** reclassifying a received virement (+) to an income category keeps it positive; an outgoing virement (−) to expense/savings stays negative — `signedAmount` inside `updateTransaction` derives the sign from the chosen category's type.
- **Branch note:** `transfers-triage` from `reste-a-vivre` (carries the net-signed `resteAVivre`). The breakdown view (from `v_monthly_by_category`) refreshes on reload/month-change; Hero/StatStrip/resteAVivre refresh immediately via `refetch` — documented, acceptable.
