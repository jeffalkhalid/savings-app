# Cockpit — Classification automatique des virements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-classer les virements en Revenus / Dépenses / Épargne (règle signe + libellé), à l'import et en rattrapage de l'existant, retirer la case « Transferts », garder le tri manuel comme correction.

**Architecture:** Règle pure `classify-transfer.ts`, mutations `transfers-api.ts` (créer les catégories Virements reçus/émis + classer en masse), `StatStrip` à 3 cases + `TransferNudge` (auto / manuel), intégration Dashboard et import.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

## Global Constraints

- Styling : tokens Tailwind (`ink`, `paper`, `ink-muted`, `rule`, `emerald`, `strat-a`), mobile-first ; `.font-mono-num` pour les chiffres.
- `categories.type` ∈ `{income, expense, transfer, savings}`. Écritures via `updateTransaction` (re-signe par type). RLS par `user_id`.
- Module pur testé Vitest ; `npx tsc --noEmit` clean ; `npm run build` OK avant fin.
- Catégories cibles : « Virements reçus » (income), « Virements émis » (expense), « Bourse / Natixis » / « Épargne » (savings, existantes).

---

## Task 1: classify-transfer.ts pure rule (TDD)

**Files:**
- Create: `lib/cockpit/classify-transfer.ts`
- Test: `lib/cockpit/classify-transfer.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `TransferClass` type; `SAVINGS_KEYWORDS: string[]`; `classifyTransfer(amount: number, label: string): TransferClass`; `targetCategoryName(cls: TransferClass, label: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/classify-transfer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";

describe("classifyTransfer", () => {
  it("treats a received transfer (>= 0) as income", () => {
    expect(classifyTransfer(200, "VIREMENT RECU DE YASMIN")).toBe("income");
    expect(classifyTransfer(0, "x")).toBe("income");
  });
  it("treats a generic sent transfer as expense", () => {
    expect(classifyTransfer(-300, "VIREMENT EMIS VERS KHALID")).toBe("expense");
  });
  it("treats a sent transfer toward a savings/invest account as savings", () => {
    expect(classifyTransfer(-1000, "VIREMENT VERS NATIXIS")).toBe("savings");
    expect(classifyTransfer(-500, "Virement Bourse")).toBe("savings");
    expect(classifyTransfer(-500, "VIR PEA")).toBe("savings");
    expect(classifyTransfer(-200, "VIREMENT LIVRET A")).toBe("savings");
    expect(classifyTransfer(-200, "VIR LDDS")).toBe("savings");
  });
  it("is case- and accent-insensitive", () => {
    expect(classifyTransfer(-100, "virement ÉPARGNE")).toBe("savings");
    expect(classifyTransfer(-100, "VERS EPARGNE")).toBe("savings");
  });
});

describe("targetCategoryName", () => {
  it("maps income/expense to the Virements categories", () => {
    expect(targetCategoryName("income", "x")).toBe("Virements reçus");
    expect(targetCategoryName("expense", "x")).toBe("Virements émis");
  });
  it("maps savings to Bourse / Natixis for invest labels, Épargne otherwise", () => {
    expect(targetCategoryName("savings", "VERS NATIXIS")).toBe("Bourse / Natixis");
    expect(targetCategoryName("savings", "VERS PEA")).toBe("Bourse / Natixis");
    expect(targetCategoryName("savings", "VIREMENT LIVRET A")).toBe("Épargne");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- classify-transfer`
Expected: FAIL — `Cannot find module './classify-transfer'`.

- [ ] **Step 3: Implement classify-transfer.ts**

Create `lib/cockpit/classify-transfer.ts`:

```ts
export type TransferClass = "income" | "expense" | "savings";

export const SAVINGS_KEYWORDS = [
  "natixis",
  "bourse",
  "pea",
  "livret",
  "ldds",
  "or & argent",
  "épargne",
];

const INVEST_KEYWORDS = ["natixis", "bourse", "pea"];

function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function classifyTransfer(amount: number, label: string): TransferClass {
  if (Number(amount) >= 0) return "income";
  const n = normalize(label);
  const isSavings = SAVINGS_KEYWORDS.some((k) => n.includes(normalize(k)));
  return isSavings ? "savings" : "expense";
}

export function targetCategoryName(cls: TransferClass, label: string): string {
  if (cls === "income") return "Virements reçus";
  if (cls === "expense") return "Virements émis";
  const n = normalize(label);
  return INVEST_KEYWORDS.some((k) => n.includes(k))
    ? "Bourse / Natixis"
    : "Épargne";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- classify-transfer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/classify-transfer.ts lib/cockpit/classify-transfer.test.ts
git commit -m "feat(transfers): add transfer classification rule with tests"
```

---

## Task 2: Default categories for transfers

**Files:**
- Modify: `lib/cockpit/defaults.ts`

**Interfaces:**
- Consumes: existing `DEFAULT_CATEGORIES`.
- Produces: `DEFAULT_CATEGORIES` now includes `"Virements reçus"` (income) and `"Virements émis"` (expense).

- [ ] **Step 1: Add the two categories**

In `lib/cockpit/defaults.ts`, inside the `DEFAULT_CATEGORIES` array, add these two entries right after the `{ name: "Virements", type: "transfer", color: "#0288D1" }` line:

```ts
  { name: "Virements reçus", type: "income", color: "#4A6FA5" },
  { name: "Virements émis", type: "expense", color: "#6B6E76" },
```

- [ ] **Step 2: Run the defaults tests (still green)**

Run: `npm run test -- defaults`
Expected: PASS — names stay unique, types stay valid.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/defaults.ts
git commit -m "feat(transfers): seed Virements reçus/émis categories"
```

---

## Task 3: transfers-api.ts (ensure categories + classify all)

**Files:**
- Create: `lib/cockpit/transfers-api.ts`

**Interfaces:**
- Consumes: `supabase`; `updateTransaction` from `./transactions-api`; `classifyTransfer`, `targetCategoryName` from `./classify-transfer`; `pendingTransfers` from `./transfers`; `Txn`, `Category` from `./types`.
- Produces: `ensureTransferCategories(userId: string, categories: Category[]): Promise<Category[]>`; `classifyAllTransfers(txns: Txn[], categories: Category[]): Promise<number>`.

- [ ] **Step 1: Implement transfers-api.ts**

Create `lib/cockpit/transfers-api.ts`:

```ts
import { supabase } from "./supabase";
import { updateTransaction } from "./transactions-api";
import { classifyTransfer, targetCategoryName } from "./classify-transfer";
import { pendingTransfers } from "./transfers";
import type { Txn, Category } from "./types";

const TRANSFER_CATEGORIES: { name: string; type: string }[] = [
  { name: "Virements reçus", type: "income" },
  { name: "Virements émis", type: "expense" },
];

// Crée les catégories Virements reçus/émis si absentes ; renvoie la liste à jour.
export async function ensureTransferCategories(
  userId: string,
  categories: Category[]
): Promise<Category[]> {
  const missing = TRANSFER_CATEGORIES.filter(
    (tc) => !categories.some((c) => c.name === tc.name)
  );
  if (!missing.length) return categories;
  const { data, error } = await supabase
    .from("categories")
    .insert(
      missing.map((m) => ({
        user_id: userId,
        name: m.name,
        type: m.type,
        color: "#6B6E76",
      }))
    )
    .select("id,name,type,color");
  if (error) throw new Error(error.message);
  return [...categories, ...((data as Category[]) ?? [])];
}

// Classe toutes les transactions type=transfer via la règle (updateTransaction).
// `categories` doit contenir les cibles (appeler ensureTransferCategories avant).
// Renvoie le nombre de lignes traitées (les cibles non résolues sont ignorées).
export async function classifyAllTransfers(
  txns: Txn[],
  categories: Category[]
): Promise<number> {
  let count = 0;
  for (const t of pendingTransfers(txns)) {
    const cls = classifyTransfer(Number(t.amount), t.description);
    const name = targetCategoryName(cls, t.description);
    const cat = categories.find((c) => c.name === name);
    if (!cat) continue;
    await updateTransaction(t.id, {
      date: t.date,
      absAmount: Math.abs(Number(t.amount)),
      description: t.description,
      categoryId: cat.id,
      categoryName: cat.name,
      accountId: t.account_id ?? "",
      categoryType: cat.type,
    });
    count++;
  }
  return count;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/transfers-api.ts
git commit -m "feat(transfers): add ensureTransferCategories + classifyAllTransfers"
```

---

## Task 4: StatStrip (3 cells) + TransferNudge

**Files:**
- Modify (full rewrite): `components/cockpit/StatStrip.tsx`
- Create: `components/cockpit/TransferNudge.tsx`

**Interfaces:**
- Consumes: `Metrics` from `@/lib/cockpit/metrics`; `eur` from `@/lib/cockpit/format`.
- Produces: `StatStrip({ metrics })` (no `onTransfers`); `TransferNudge({ count, onAuto, onManual, busy })`.

- [ ] **Step 1: Rewrite StatStrip.tsx (drop the Transferts cell)**

Replace the entire contents of `components/cockpit/StatStrip.tsx` with:

```tsx
import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({ metrics }: { metrics: Metrics }) {
  const items = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-strat-a" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink" },
  ];
  return (
    <div className="flex mb-6">
      {items.map((it, i) => (
        <div
          key={it.k}
          className={`flex-1 ${i > 0 ? "border-l border-rule pl-2.5" : ""}`}
        >
          <div className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">
            {it.k}
          </div>
          <div className={`font-mono-num text-sm mt-1 ${it.c}`}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: TransferNudge.tsx**

```tsx
"use client";

export function TransferNudge({
  count,
  onAuto,
  onManual,
  busy,
}: {
  count: number;
  onAuto: () => void;
  onManual: () => void;
  busy: boolean;
}) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 mb-6 border border-rule rounded-lg px-3 py-2.5">
      <span className="text-[13px] text-ink-muted">
        {count} virement{count > 1 ? "s" : ""} à classer
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onAuto}
          disabled={busy}
          className="text-[12px] bg-emerald text-paper rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy ? "…" : "Classer auto"}
        </button>
        <button
          type="button"
          onClick={onManual}
          className="text-[12px] text-ink-muted border border-rule rounded-lg px-3 py-1.5"
        >
          À la main
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors expected ONLY in `app/cockpit/page.tsx` (it still passes `onTransfers` to StatStrip) — that is fixed in Task 5. The two component files themselves compile.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/StatStrip.tsx components/cockpit/TransferNudge.tsx
git commit -m "feat(transfers): StatStrip to 3 cells + classify nudge"
```

---

## Task 5: Dashboard integration (nudge + auto-classify)

**Files:**
- Modify (full rewrite): `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `ensureTransferCategories`, `classifyAllTransfers` (Task 3); `TransferNudge` (Task 4); `StatStrip` without `onTransfers` (Task 4); `pendingTransfers`, `updateTransaction`, `TransferTriage` (existing).
- Produces: wired dashboard.

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
import {
  ensureTransferCategories,
  classifyAllTransfers,
} from "@/lib/cockpit/transfers-api";
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
import { TransferNudge } from "@/components/cockpit/TransferNudge";
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
  const [classifying, setClassifying] = useState(false);

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
  const autoClassify = async () => {
    setClassifying(true);
    setTransferError(null);
    try {
      const cats = await ensureTransferCategories(user.id, categories);
      await classifyAllTransfers(txns, cats);
      refetch();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Erreur");
    }
    setClassifying(false);
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
          {transferError && (
            <p className="text-strat-a text-sm mb-2">{transferError}</p>
          )}
          <TransferNudge
            count={transfers.length}
            onAuto={autoClassify}
            onManual={() => {
              setTransferError(null);
              setShowTransfers(true);
            }}
            busy={classifying}
          />
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
Expected: No errors (StatStrip no longer receives `onTransfers`).

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(transfers): nudge + auto-classify on dashboard, keep manual triage"
```

---

## Task 6: Auto-classify virements at import

**Files:**
- Modify: `app/cockpit/import/page.tsx`

**Interfaces:**
- Consumes: `classifyTransfer`, `targetCategoryName` (Task 1); `ensureTransferCategories` (Task 3); existing import flow (`parseBnpSheet`, `markDuplicates`, `useCategories`, `useAuth`).
- Produces: import where virement rows (mapped to "Virements") are pre-classified to Virements reçus/émis/épargne.

Context: the current `app/cockpit/import/page.tsx` is a client component that uses `useAuth`, `useCategories` (as `{ categories }`), reads the file, calls `markDuplicates(parsed, existing)` to build review rows (each row has `label`, `amount`, `categoryName`), and on import resolves `categories.find((c) => c.name === r.categoryName)`. This task (a) ensures the Virements reçus/émis categories exist, and (b) overrides the mapped category of virement rows using the classification rule.

- [ ] **Step 1: Add imports + ensure categories on load**

In `app/cockpit/import/page.tsx`:

(a) Add to the imports near the top:

```tsx
import { useEffect } from "react";
import {
  classifyTransfer,
  targetCategoryName,
} from "@/lib/cockpit/classify-transfer";
import { ensureTransferCategories } from "@/lib/cockpit/transfers-api";
import type { Category } from "@/lib/cockpit/types";
```

(b) The page already has `const { categories } = useCategories();` and a `useAuth()` user. Rename the hook result and keep an augmented list in state. Replace the `const { categories } = useCategories();` line with:

```tsx
  const { categories: liveCategories } = useCategories();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!liveCategories.length) return;
    ensureTransferCategories(user.id, liveCategories)
      .then(setCategories)
      .catch(() => setCategories(liveCategories));
  }, [liveCategories, user.id]);
```

(Ensure `useState` and `useEffect` are imported from React. `user` comes from the existing `const user = useAuth();`.) All later uses of `categories` (the review dropdown and the import resolution) now use this augmented list.

- [ ] **Step 2: Override virement rows with the classification rule**

In the file handler, after the line that builds the reviewed rows via `markDuplicates(parsed, existing)`, map over the result to reclassify virement rows. Replace the existing assignment:

```tsx
      const reviewed = markDuplicates(parsed, existing);
      setRows(reviewed.map((r) => ({ ...r, include: !r.duplicate })));
```

with:

```tsx
      const reviewed = markDuplicates(parsed, existing).map((r) =>
        r.categoryName === "Virements"
          ? {
              ...r,
              categoryName: targetCategoryName(
                classifyTransfer(r.amount, r.label),
                r.label
              ),
            }
          : r
      );
      setRows(reviewed.map((r) => ({ ...r, include: !r.duplicate })));
```

(`ReviewRow` from `markDuplicates` carries `amount`, `label`, and `categoryName`; only rows the BNP mapping sent to "Virements" get re-pointed to Virements reçus/émis/épargne.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/cockpit/import/page.tsx
git commit -m "feat(transfers): auto-classify virements at import"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `classify-transfer` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` and `/cockpit/import` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, log in, open `/cockpit` on a month that has virements. Verify:
1. The stat strip shows only Revenus / Dépenses / Épargne (no Transferts).
2. A "N virements à classer" nudge appears. Tapping "Classer auto" reclassifies them: received → Virements reçus (Revenus ↑), sent toward Natixis/Bourse/PEA/Livret/LDDS → Bourse / Natixis or Épargne (Épargne ↑), other sent → Virements émis (Dépenses ↑). The nudge count drops to 0 and disappears; taux d'épargne and reste à vivre become faithful.
3. "À la main" opens the manual triage (still works) for case-by-case correction.
4. Importing a BNP file: virement rows in the review table show a real category (Virements reçus/émis or Bourse / Natixis / Épargne), not "Virements".
5. Changing the month re-evaluates the nudge for that month's virements.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(transfers): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** rule + targetCategoryName pure & tested (Task 1); Virements reçus/émis seeded (Task 2); ensureTransferCategories + classifyAllTransfers (Task 3); StatStrip 3-cell + TransferNudge (Task 4); dashboard nudge with auto-classify + kept manual triage + reste à vivre untouched (Task 5); import auto-classify (Task 6); verification incl. faithful stats + import (Task 7). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `TransferClass`/`classifyTransfer`/`targetCategoryName` (Task 1) used by `transfers-api` (Task 3) and import (Task 6); `ensureTransferCategories(userId, categories)` returns `Category[]`, `classifyAllTransfers(txns, categories)` returns `number`, both called by the page (Task 5) with the augmented list; `TransferNudge` props (`count/onAuto/onManual/busy`) match the page; `StatStrip` no longer takes `onTransfers` and the page no longer passes it.
- **Known limitation:** after `autoClassify`, `useCategories` doesn't refetch, so the just-created Virements reçus/émis appear in the manual-triage dropdown / breakdown only after a reload; the auto path itself uses the augmented list returned by `ensureTransferCategories`, so it works immediately. Acceptable (documented).
- **Branch note:** continues `transfers-triage` (already has reste à vivre net-signed + the manual triage components reused here). Reste à vivre is intentionally left as net-signed (converges to Revenus − Dépenses − Épargne once transfers are classified).
