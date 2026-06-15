# Cockpit Refacto + Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper `app/cockpit/page.tsx` monolithique en une couche partagée `lib/cockpit` + composants présentationnels écrits directement avec le design system (Fraunces/Geist, tokens cream/ink/emerald), poser une coquille de navigation à 3 vues avec tab bar PWA, et couvrir les calculs purs par des tests.

**Architecture:** Modules purs testables (`format.ts`, `metrics.ts`), accès données encapsulé dans des hooks custom (`hooks.ts`, pas de React Query), composants présentationnels Tailwind, `app/cockpit/layout.tsx` qui gate l'auth + fournit le contexte user + monte la tab bar. Le mois par défaut devient le mois courant.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, Tailwind 3, Supabase JS, lucide-react, Vitest (nouveau, dev).

---

## File structure

```
lib/cockpit/
  supabase.ts      # client singleton
  types.ts         # TxnType, Txn, Category, Account
  format.ts        # eur, todayISO, currentMonth, monthRange   (+ format.test.ts)
  metrics.ts       # computeMetrics (pur)                       (+ metrics.test.ts)
  hooks.ts         # AuthContext, useAuth, useSession, useTransactions, useCategories, useAccounts

app/cockpit/
  layout.tsx       # AuthGate + AuthProvider + TabBar + shell
  page.tsx         # vue Dashboard
  patrimoine/page.tsx
  projection/page.tsx

components/cockpit/
  LoginForm.tsx  TabBar.tsx  MonthSwitcher.tsx  Fab.tsx
  HeroBand.tsx  StatStrip.tsx  TxnList.tsx  TxnRow.tsx  AddModal.tsx

app/manifest.ts    # manifest PWA minimal
app/layout.tsx     # + viewport themeColor (modif)
vitest.config.ts   # nouveau
package.json       # + vitest, scripts test (modif)
```

---

## Task 1: Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added to devDependencies, install succeeds.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, add to the `"scripts"` object:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run: `npm run test`
Expected: Vitest runs and reports "No test files found" (exit non-fatal) — confirms config is valid.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(cockpit): add vitest for pure-module tests"
```

---

## Task 2: Shared types and Supabase client

**Files:**
- Create: `lib/cockpit/types.ts`
- Create: `lib/cockpit/supabase.ts`

No unit tests (type declarations + env-bound singleton); verified by the build in Task 12.

- [ ] **Step 1: Create the types module**

Create `lib/cockpit/types.ts`:

```ts
export type TxnType = "expense" | "income" | "transfer" | "savings";

export type Txn = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: TxnType;
  category_id?: string | null;
  account_id?: string | null;
};

export type Category = { id: string; name: string; type: string; color: string };
export type Account = { id: string; name: string };
```

- [ ] **Step 2: Create the Supabase singleton**

Create `lib/cockpit/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/types.ts lib/cockpit/supabase.ts
git commit -m "feat(cockpit): extract shared types and supabase client"
```

---

## Task 3: format.ts (TDD)

**Files:**
- Create: `lib/cockpit/format.ts`
- Test: `lib/cockpit/format.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { eur, todayISO, currentMonth, monthRange } from "./format";

describe("eur", () => {
  it("formats in fr-FR euros", () => {
    // fr-FR uses a narrow no-break space as thousands separator and "€" suffix
    expect(eur(1960)).toMatch(/1\s?960,00\s?€/);
  });
  it("formats negatives with a minus sign", () => {
    expect(eur(-29)).toMatch(/-?29,00\s?€/);
  });
});

describe("monthRange", () => {
  it("returns first day of month and first day of next month", () => {
    expect(monthRange("2026-05")).toEqual({ start: "2026-05-01", next: "2026-06-01" });
  });
  it("rolls December into the next year", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", next: "2027-01-01" });
  });
});

describe("todayISO / currentMonth", () => {
  it("todayISO is YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("currentMonth is YYYY-MM and is the prefix of todayISO", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
    expect(todayISO().startsWith(currentMonth())).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- format`
Expected: FAIL — `Cannot find module './format'` / functions undefined.

- [ ] **Step 3: Implement format.ts**

Create `lib/cockpit/format.ts`:

```ts
export const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const currentMonth = () => todayISO().slice(0, 7);

export function monthRange(month: string): { start: string; next: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- format`
Expected: PASS (all format tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/format.ts lib/cockpit/format.test.ts
git commit -m "feat(cockpit): add pure format helpers with tests"
```

---

## Task 4: metrics.ts (TDD)

**Files:**
- Create: `lib/cockpit/metrics.ts`
- Test: `lib/cockpit/metrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";
import type { Txn } from "./types";

const t = (type: Txn["type"], amount: number): Txn => ({
  id: Math.abs(amount) + type,
  date: "2026-05-01",
  amount,
  description: type,
  type,
});

describe("computeMetrics", () => {
  it("sums each type by absolute value", () => {
    const m = computeMetrics([
      t("income", 2980),
      t("expense", -1020),
      t("savings", -1020),
      t("transfer", -320),
    ]);
    expect(m.revenus).toBe(2980);
    expect(m.depenses).toBe(1020);
    expect(m.epargne).toBe(1020);
    expect(m.transferts).toBe(320);
  });

  it("tauxEpargne = epargne / revenus", () => {
    const m = computeMetrics([t("income", 1000), t("savings", -250)]);
    expect(m.tauxEpargne).toBeCloseTo(0.25);
  });

  it("tauxEpargne is 0 when there is no income", () => {
    const m = computeMetrics([t("savings", -250)]);
    expect(m.tauxEpargne).toBe(0);
  });

  it("resteAVivre = revenus - depenses (ignores savings and transfers)", () => {
    const m = computeMetrics([
      t("income", 2980),
      t("expense", -1020),
      t("savings", -1020),
      t("transfer", -320),
    ]);
    expect(m.resteAVivre).toBe(1960);
  });

  it("returns zeros for an empty list", () => {
    const m = computeMetrics([]);
    expect(m).toEqual({
      revenus: 0,
      depenses: 0,
      epargne: 0,
      transferts: 0,
      tauxEpargne: 0,
      resteAVivre: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- metrics`
Expected: FAIL — `Cannot find module './metrics'`.

- [ ] **Step 3: Implement metrics.ts**

Create `lib/cockpit/metrics.ts`:

```ts
import type { Txn, TxnType } from "./types";

export type Metrics = {
  revenus: number;
  depenses: number;
  epargne: number;
  transferts: number;
  tauxEpargne: number;
  resteAVivre: number;
};

const sumAbs = (txns: Txn[], type: TxnType) =>
  txns
    .filter((x) => x.type === type)
    .reduce((acc, x) => acc + Math.abs(Number(x.amount)), 0);

export function computeMetrics(txns: Txn[]): Metrics {
  const revenus = sumAbs(txns, "income");
  const depenses = sumAbs(txns, "expense");
  const epargne = sumAbs(txns, "savings");
  const transferts = sumAbs(txns, "transfer");
  return {
    revenus,
    depenses,
    epargne,
    transferts,
    tauxEpargne: revenus > 0 ? epargne / revenus : 0,
    resteAVivre: revenus - depenses,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- metrics`
Expected: PASS (all metrics tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/metrics.ts lib/cockpit/metrics.test.ts
git commit -m "feat(cockpit): add pure metrics computation with tests"
```

---

## Task 5: Data + auth hooks

**Files:**
- Create: `lib/cockpit/hooks.ts`

No unit test (React + Supabase bound); verified by the build in Task 12.

- [ ] **Step 1: Create hooks.ts**

Create `lib/cockpit/hooks.ts`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "./supabase";
import { monthRange } from "./format";
import type { Txn, Category, Account } from "./types";

export type AuthUser = { id: string; email?: string };

export const AuthContext = createContext<AuthUser | null>(null);

export function useAuth(): AuthUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used within AuthContext.Provider");
  return user;
}

export function useSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser((data.user as AuthUser) ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser((s?.user as AuthUser) ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, ready };
}

export function useTransactions(month: string) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    const { start, next } = monthRange(month);
    setLoading(true);
    supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lt("date", next)
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setError(null);
          setTxns((data as Txn[]) ?? []);
        }
        setLoading(false);
      });
  }, [month]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { txns, loading, error, refetch };
}

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

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    supabase
      .from("accounts")
      .select("id,name")
      .order("name")
      .then(({ data }) => setAccounts((data as Account[]) ?? []));
  }, []);
  return { accounts };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors from `lib/cockpit/hooks.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/cockpit/hooks.ts
git commit -m "feat(cockpit): add auth + data hooks layer"
```

---

## Task 6: Shell components — LoginForm, TabBar, MonthSwitcher, Fab

**Files:**
- Create: `components/cockpit/LoginForm.tsx`
- Create: `components/cockpit/TabBar.tsx`
- Create: `components/cockpit/MonthSwitcher.tsx`
- Create: `components/cockpit/Fab.tsx`

- [ ] **Step 1: Create LoginForm.tsx**

Create `components/cockpit/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/cockpit/supabase";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 min-h-screen">
      <h1 className="font-display text-4xl mb-8">Cockpit</h1>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) setErr(error.message);
        }}
      >
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border border-rule rounded-lg px-3 py-3 bg-white text-base"
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="bg-emerald text-paper rounded-lg py-3.5 font-semibold"
          type="submit"
        >
          Se connecter
        </button>
        {err && <p className="text-strat-a text-sm">{err}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Create TabBar.tsx**

Create `components/cockpit/TabBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Landmark, TrendingUp } from "lucide-react";

const ITEMS = [
  { href: "/cockpit", label: "Dashboard", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-paper border-t border-rule pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[600px] mx-auto flex">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "text-ink" : "text-ink-muted"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create MonthSwitcher.tsx**

Create `components/cockpit/MonthSwitcher.tsx`:

```tsx
"use client";

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <input
      type="month"
      value={month}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono-num text-xs text-ink-muted border border-rule rounded-full px-3 py-1.5 bg-transparent"
    />
  );
}
```

- [ ] **Step 4: Create Fab.tsx**

Create `components/cockpit/Fab.tsx`:

```tsx
"use client";

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Ajouter une transaction"
      className="fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-emerald text-paper text-3xl font-light flex items-center justify-center shadow-lg"
    >
      +
    </button>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/LoginForm.tsx components/cockpit/TabBar.tsx components/cockpit/MonthSwitcher.tsx components/cockpit/Fab.tsx
git commit -m "feat(cockpit): add shell components (login, tabbar, month switcher, fab)"
```

---

## Task 7: Dashboard presentational components — HeroBand, StatStrip, TxnRow, TxnList

**Files:**
- Create: `components/cockpit/HeroBand.tsx`
- Create: `components/cockpit/StatStrip.tsx`
- Create: `components/cockpit/TxnRow.tsx`
- Create: `components/cockpit/TxnList.tsx`

- [ ] **Step 1: Create HeroBand.tsx**

Create `components/cockpit/HeroBand.tsx`:

```tsx
import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function HeroBand({
  metrics,
  monthLabel,
}: {
  metrics: Metrics;
  monthLabel: string;
}) {
  const pct = Math.round(metrics.tauxEpargne * 100);
  return (
    <div className="border-b-2 border-ink pb-5 mb-5">
      <div className="flex justify-between items-end gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
            Taux d&apos;épargne · {monthLabel}
          </div>
          <div className="font-display text-emerald text-5xl leading-none">
            {pct}&thinsp;%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] uppercase tracking-[0.14em] text-ink-muted mb-1.5">
            Reste à vivre
          </div>
          <div className="font-display text-3xl leading-none">
            {eur(metrics.resteAVivre)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StatStrip.tsx**

Create `components/cockpit/StatStrip.tsx`:

```tsx
import type { Metrics } from "@/lib/cockpit/metrics";
import { eur } from "@/lib/cockpit/format";

export function StatStrip({ metrics }: { metrics: Metrics }) {
  const items = [
    { k: "Revenus", v: eur(metrics.revenus), c: "text-emerald" },
    { k: "Dépenses", v: eur(metrics.depenses), c: "text-strat-a" },
    { k: "Épargne", v: eur(metrics.epargne), c: "text-ink" },
    { k: "Transferts", v: eur(metrics.transferts), c: "text-ink" },
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

- [ ] **Step 3: Create TxnRow.tsx**

Create `components/cockpit/TxnRow.tsx`:

```tsx
import type { Txn } from "@/lib/cockpit/types";
import { eur } from "@/lib/cockpit/format";

export function TxnRow({
  txn,
  categoryName,
}: {
  txn: Txn;
  categoryName?: string;
}) {
  const neg = Number(txn.amount) < 0;
  return (
    <button
      type="button"
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

- [ ] **Step 4: Create TxnList.tsx**

Create `components/cockpit/TxnList.tsx`:

```tsx
import type { Txn, Category } from "@/lib/cockpit/types";
import { TxnRow } from "./TxnRow";

export function TxnList({
  txns,
  categories,
  loading,
  error,
  monthLabel,
}: {
  txns: Txn[];
  categories: Category[];
  loading: boolean;
  error: string | null;
  monthLabel: string;
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
          <TxnRow key={t.id} txn={t} categoryName={nameOf(t.category_id)} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/HeroBand.tsx components/cockpit/StatStrip.tsx components/cockpit/TxnRow.tsx components/cockpit/TxnList.tsx
git commit -m "feat(cockpit): add dashboard presentational components"
```

---

## Task 8: AddModal (bottom-sheet, restyled)

**Files:**
- Create: `components/cockpit/AddModal.tsx`

The insert logic is preserved from the current `app/cockpit/page.tsx` (lines 166-253); only styling moves to Tailwind tokens.

- [ ] **Step 1: Create AddModal.tsx**

Create `components/cockpit/AddModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/cockpit/supabase";
import { todayISO } from "@/lib/cockpit/format";
import type { Category, Account } from "@/lib/cockpit/types";

export function AddModal({
  userId,
  categories,
  accounts,
  onClose,
  onSaved,
}: {
  userId: string;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.name.includes("BNP"))?.id ?? accounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    const sign = cat.type === "income" ? 1 : -1;

    setSaving(true);
    const { error: e2 } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      amount: sign * amt,
      description: description || cat.name,
      merchant: description || null,
      category_id: categoryId,
      account_id: accountId,
      type: cat.type,
      source: "manual",
    });
    setSaving(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    onSaved();
  };

  const field =
    "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

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
          <h2 className="font-display text-2xl">Nouvelle transaction</h2>
          <button
            className="text-ink-muted text-sm"
            onClick={onClose}
            type="button"
          >
            Annuler
          </button>
        </header>
        <form onSubmit={save} className="grid gap-3">
          <label className={labelCls}>
            Montant (€)
            <input
              className={field}
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
              className={field}
              type="text"
              placeholder="Ex. Carrefour, Uber, café…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className={labelCls}>
            Catégorie
            <select
              className={field}
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
              className={field}
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
              className={field}
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
git add components/cockpit/AddModal.tsx
git commit -m "feat(cockpit): restyle AddModal as token-based bottom sheet"
```

---

## Task 9: Cockpit layout (auth gate + provider + tab bar)

**Files:**
- Create: `app/cockpit/layout.tsx` (replaces the auth/shell logic currently inside `app/cockpit/page.tsx`)

- [ ] **Step 1: Create layout.tsx**

Create `app/cockpit/layout.tsx`:

```tsx
"use client";

import { AuthContext, useSession } from "@/lib/cockpit/hooks";
import { LoginForm } from "@/components/cockpit/LoginForm";
import { TabBar } from "@/components/cockpit/TabBar";

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();

  if (!ready) {
    return (
      <main className="max-w-[600px] mx-auto px-6 py-16 text-ink-muted">
        Chargement…
      </main>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <AuthContext.Provider value={user}>
      <div className="min-h-screen pb-24">{children}</div>
      <TabBar />
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/layout.tsx
git commit -m "feat(cockpit): add layout with auth gate, provider and tab bar"
```

---

## Task 10: Dashboard page + placeholder views

**Files:**
- Modify (full rewrite): `app/cockpit/page.tsx`
- Create: `app/cockpit/patrimoine/page.tsx`
- Create: `app/cockpit/projection/page.tsx`

- [ ] **Step 1: Rewrite the Dashboard page**

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
import { MonthSwitcher } from "@/components/cockpit/MonthSwitcher";
import { HeroBand } from "@/components/cockpit/HeroBand";
import { StatStrip } from "@/components/cockpit/StatStrip";
import { TxnList } from "@/components/cockpit/TxnList";
import { Fab } from "@/components/cockpit/Fab";
import { AddModal } from "@/components/cockpit/AddModal";

const monthLabelOf = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

export default function DashboardPage() {
  const user = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
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
      />

      <Fab onClick={() => setShowAdd(true)} />

      {showAdd && (
        <AddModal
          userId={user.id}
          categories={categories}
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            refetch();
            setShowAdd(false);
          }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Create the Patrimoine placeholder**

Create `app/cockpit/patrimoine/page.tsx`:

```tsx
export default function PatrimoinePage() {
  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <h1 className="font-display text-2xl mb-2">Patrimoine</h1>
      <p className="font-display italic text-ink-muted">
        Bientôt — consolidation PEA, Natixis, Or et livrets, avec courbe
        d&apos;évolution.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Create the Projection placeholder**

Create `app/cockpit/projection/page.tsx`:

```tsx
export default function ProjectionPage() {
  return (
    <main className="max-w-[600px] mx-auto px-5 pt-8">
      <h1 className="font-display text-2xl mb-2">Projection</h1>
      <p className="font-display italic text-ink-muted">
        Bientôt — branchement du simulateur PEG/PER sur tes vrais flux
        d&apos;épargne mensuels.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/cockpit/page.tsx app/cockpit/patrimoine/page.tsx app/cockpit/projection/page.tsx
git commit -m "feat(cockpit): assemble dashboard view + placeholder routes"
```

---

## Task 11: PWA manifest minimal

**Files:**
- Create: `app/manifest.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create the manifest**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cockpit",
    short_name: "Cockpit",
    start_url: "/cockpit",
    display: "standalone",
    background_color: "#FAF8F4",
    theme_color: "#FAF8F4",
  };
}
```

- [ ] **Step 2: Add the viewport theme-color to the root layout**

In `app/layout.tsx`, add `Viewport` to the type import and export a `viewport` constant. The import line becomes:

```tsx
import type { Metadata, Viewport } from "next";
```

And add, right after the existing `metadata` export:

```tsx
export const viewport: Viewport = {
  themeColor: "#FAF8F4",
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/manifest.ts app/layout.tsx
git commit -m "feat(cockpit): add minimal PWA manifest and theme-color"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS — all `format` and `metrics` tests green.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; routes `/cockpit`, `/cockpit/patrimoine`, `/cockpit/projection` and `/manifest.webmanifest` appear in the output.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev`, open `/cockpit`. Verify: login gate appears when logged out; after login the dashboard renders with hero band + stat strip + transaction list; the month switcher changes data; the tab bar navigates to placeholders; the FAB opens AddModal and saving refreshes the list.

- [ ] **Step 5: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(cockpit): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** file architecture (Task 2/5/6/7/8), auth+hooks (Task 5/9), Option B dashboard (Task 7/10), tab bar + routes + safe-area (Task 6/9/10), metrics model (Task 4), terracotta negative `text-strat-a` (Task 7/8), default month = currentMonth (Task 10), manifest minimal (Task 11), Vitest on pure modules (Task 1/3/4). All covered.
- **No `supabase.from` outside hooks:** AddModal and LoginForm call `supabase.auth.*` / `supabase.from("transactions").insert` directly — this is the documented exception for the write path (insert) and auth, which are action-scoped, not data-fetch hooks. Read fetches all live in `hooks.ts`.
- **Type consistency:** `Metrics` shape used in HeroBand/StatStrip matches Task 4; `Txn.category_id` (Task 2) used by TxnList/TxnRow; `AuthUser` from hooks used by layout.
- **`id` in metrics test** uses `Math.abs(amount) + type` to produce a unique-ish string id; types allow `string`.
