# Cockpit — Onboarding (amorçage nouvel utilisateur) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amorcer automatiquement les catégories + comptes par défaut d'un nouvel utilisateur à sa 1ère connexion, et fournir le SQL de correctif RLS des 2 vues, pour qu'un utilisateur inscrit manuellement ait un suivi isolé et fonctionnel.

**Architecture:** Définitions pures `lib/cockpit/defaults.ts`, fonction d'amorçage `lib/cockpit/seed.ts` (`ensureSeed`), hook `useEnsureSeed`, intégration dans `app/cockpit/layout.tsx` (écran « Préparation… » pendant le seed), + un fichier SQL de migration RLS exécuté manuellement.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase JS, Vitest.

## Global Constraints

- Styling : tokens Tailwind (`paper`, `ink`, `ink-muted`, …), mobile-first `max-w-[600px]`.
- Lectures/écritures Supabase scopées par `user_id` (RLS) ; le seed n'insère que les lignes du user courant.
- `categories.type` ∈ `{income, expense, transfer, savings}` (valeurs connues valides).
- Modules purs testés Vitest ; `npx tsc --noEmit` clean ; `npm run build` OK avant fin.
- Le seed est **idempotent** : il n'agit que si l'utilisateur n'a aucune catégorie.

---

## Task 1: defaults.ts pure module (TDD)

**Files:**
- Create: `lib/cockpit/defaults.ts`
- Test: `lib/cockpit/defaults.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `SeedCategory`, `SeedAccount` types; `DEFAULT_CATEGORIES: SeedCategory[]`; `DEFAULT_ACCOUNTS: SeedAccount[]`; `needsSeed(categories: { id: string }[]): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `lib/cockpit/defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

describe("DEFAULT_CATEGORIES", () => {
  it("is non-empty", () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });
  it("only uses valid types", () => {
    const valid = new Set(["income", "expense", "transfer", "savings"]);
    for (const c of DEFAULT_CATEGORIES) expect(valid.has(c.type)).toBe(true);
  });
  it("has unique names", () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("covers each type at least once", () => {
    const types = new Set(DEFAULT_CATEGORIES.map((c) => c.type));
    expect(types.has("income")).toBe(true);
    expect(types.has("expense")).toBe(true);
    expect(types.has("transfer")).toBe(true);
    expect(types.has("savings")).toBe(true);
  });
});

describe("DEFAULT_ACCOUNTS", () => {
  it("is non-empty", () => {
    expect(DEFAULT_ACCOUNTS.length).toBeGreaterThan(0);
  });
});

describe("needsSeed", () => {
  it("is true for an empty list", () => {
    expect(needsSeed([])).toBe(true);
  });
  it("is false when categories exist", () => {
    expect(needsSeed([{ id: "x" }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- defaults`
Expected: FAIL — `Cannot find module './defaults'`.

- [ ] **Step 3: Implement defaults.ts**

Create `lib/cockpit/defaults.ts`:

```ts
export type SeedCategory = {
  name: string;
  type: "income" | "expense" | "transfer" | "savings";
  color: string;
};

export type SeedAccount = { name: string; type: string };

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { name: "Salaire", type: "income", color: "#1B5E40" },
  { name: "Revenus divers", type: "income", color: "#2D7A4F" },
  { name: "Logement", type: "expense", color: "#B45342" },
  { name: "Courses alimentaires", type: "expense", color: "#B89968" },
  { name: "Restaurants & Sorties", type: "expense", color: "#836FB2" },
  { name: "Transport", type: "expense", color: "#4A6FA5" },
  { name: "Énergie", type: "expense", color: "#B45342" },
  { name: "Téléphonie & Internet", type: "expense", color: "#4F8B82" },
  { name: "Assurance", type: "expense", color: "#6B6E76" },
  { name: "Santé", type: "expense", color: "#C62828" },
  { name: "Loisirs", type: "expense", color: "#836FB2" },
  { name: "Vêtements", type: "expense", color: "#B89968" },
  { name: "Frais bancaires", type: "expense", color: "#6B6E76" },
  { name: "Virements", type: "transfer", color: "#0288D1" },
  { name: "Épargne", type: "savings", color: "#1B5E40" },
  { name: "Investissements", type: "savings", color: "#2D7A4F" },
];

export const DEFAULT_ACCOUNTS: SeedAccount[] = [
  { name: "Compte courant", type: "checking" },
  { name: "Livret épargne", type: "savings" },
];

// Un utilisateur a besoin du seed s'il n'a aucune catégorie.
export function needsSeed(categories: { id: string }[]): boolean {
  return categories.length === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- defaults`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/defaults.ts lib/cockpit/defaults.test.ts
git commit -m "feat(onboarding): add default categories/accounts + needsSeed with tests"
```

---

## Task 2: seed.ts + useEnsureSeed hook

**Files:**
- Create: `lib/cockpit/seed.ts`
- Modify: `lib/cockpit/hooks.ts` (append)

**Interfaces:**
- Consumes: `DEFAULT_CATEGORIES`, `DEFAULT_ACCOUNTS`, `needsSeed` from `./defaults` (Task 1); `supabase`; React `useState`/`useEffect`.
- Produces: `ensureSeed(userId: string): Promise<boolean>`; `useEnsureSeed(userId: string): { ready: boolean; error: string | null }`.

- [ ] **Step 1: Create seed.ts**

Create `lib/cockpit/seed.ts`:

```ts
import { supabase } from "./supabase";
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

// Insère les catégories/comptes par défaut si l'utilisateur n'a aucune catégorie.
// Renvoie true s'il a seedé, false sinon. RLS scope les lignes au user courant.
export async function ensureSeed(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("categories").select("id").limit(1);
  if (error) throw new Error(error.message);
  if (!needsSeed((data as { id: string }[]) ?? [])) return false;

  const { error: catErr } = await supabase.from("categories").insert(
    DEFAULT_CATEGORIES.map((c) => ({
      user_id: userId,
      name: c.name,
      type: c.type,
      color: c.color,
    }))
  );
  if (catErr) throw new Error(catErr.message);

  const { error: accErr } = await supabase.from("accounts").insert(
    DEFAULT_ACCOUNTS.map((a) => ({
      user_id: userId,
      name: a.name,
      type: a.type,
      currency: "EUR",
    }))
  );
  if (accErr) throw new Error(accErr.message);

  return true;
}
```

- [ ] **Step 2: Append useEnsureSeed to hooks.ts**

In `lib/cockpit/hooks.ts`, add this import after the existing `import type { Recurring } from "./fixed";` line:

```ts
import { ensureSeed } from "./seed";
```

Append at the END of the file:

```ts
export function useEnsureSeed(userId: string) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureSeed(userId)
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { ready, error };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/seed.ts lib/cockpit/hooks.ts
git commit -m "feat(onboarding): add ensureSeed + useEnsureSeed hook"
```

---

## Task 3: Layout integration (seed gate)

**Files:**
- Modify (full rewrite): `app/cockpit/layout.tsx`

**Interfaces:**
- Consumes: `useEnsureSeed` (Task 2); existing `AuthContext`, `useSession`, `AuthUser` from `@/lib/cockpit/hooks`; `LoginForm`, `TabBar`.
- Produces: the cockpit layout that gates on auth then on seed.

- [ ] **Step 1: Rewrite app/cockpit/layout.tsx**

Replace the entire contents of `app/cockpit/layout.tsx` with:

```tsx
"use client";

import {
  AuthContext,
  useSession,
  useEnsureSeed,
  type AuthUser,
} from "@/lib/cockpit/hooks";
import { LoginForm } from "@/components/cockpit/LoginForm";
import { TabBar } from "@/components/cockpit/TabBar";

function Loading({ text }: { text: string }) {
  return (
    <main className="max-w-[600px] mx-auto px-6 py-16 text-ink-muted">
      {text}
    </main>
  );
}

function SeededShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const { ready } = useEnsureSeed(user.id);
  if (!ready) return <Loading text="Préparation de votre espace…" />;
  return (
    <AuthContext.Provider value={user}>
      <div className="min-h-screen pb-24">{children}</div>
      <TabBar />
    </AuthContext.Provider>
  );
}

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, ready } = useSession();

  if (!ready) return <Loading text="Chargement…" />;
  if (!user) return <LoginForm />;
  return <SeededShell user={user}>{children}</SeededShell>;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (confirms `AuthUser` is exported from hooks and `useEnsureSeed` resolves).

- [ ] **Step 3: Commit**

```bash
git add app/cockpit/layout.tsx
git commit -m "feat(onboarding): seed defaults on first login via layout gate"
```

---

## Task 4: RLS view fix (SQL deliverable)

**Files:**
- Create: `supabase/2026-06-19-rls-views.sql`

**Interfaces:** none (SQL run manually in Supabase; not imported by the app).

- [ ] **Step 1: Create the migration SQL**

Create `supabase/2026-06-19-rls-views.sql`:

```sql
-- Sécurise les vues d'agrégation : avec security_invoker, elles évaluent la RLS
-- des tables sous-jacentes avec le rôle de l'appelant (auth.uid() = user_id),
-- au lieu du rôle propriétaire. Sans ça, les vues exposent les lignes de tous
-- les utilisateurs. Postgres 15+ (Supabase). À exécuter une fois dans
-- Supabase > SQL Editor.

alter view public.v_patrimoine set (security_invoker = on);
alter view public.v_monthly_by_category set (security_invoker = on);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-19-rls-views.sql
git commit -m "chore(onboarding): add SQL to enforce RLS on aggregate views"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `defaults` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit` present.

- [ ] **Step 4: Manual smoke (dev server) — the real onboarding test**

1. In **Supabase → Authentication → Add user**, create a fresh email+password user.
2. Run `npm run dev`, open `/cockpit`, log in as that new user.
3. Expect a brief "Préparation de votre espace…" then the dashboard. Verify in Supabase (or in the app) that ~16 categories and 2 accounts now exist for that user.
4. Open the FAB "Ajouter une transaction": the category and account selects are populated; saving a transaction works.
5. Log out and back in as the same user: no re-seed (still ~16 categories, not 32), and the "Préparation…" flash is brief.
6. Log in as the original user (jeff): their existing categories/accounts are unchanged (not re-seeded).

**Constraint guardrail:** if step 3 fails with a Postgres `violates check constraint` / `null value` error on the `accounts` insert (`type`) or `categories` insert (`color`), the seed hit a column constraint. Capture the failing column, adjust `DEFAULT_ACCOUNTS`/`DEFAULT_CATEGORIES` in `lib/cockpit/defaults.ts` to satisfy it (e.g. a valid `accounts.type` value), re-run. Report the real constraint rather than guessing further.

- [ ] **Step 5: (Manual, outside the repo) apply the RLS SQL**

Paste `supabase/2026-06-19-rls-views.sql` into **Supabase → SQL Editor** and run it once. Then, logged in as the new user, confirm Patrimoine/Projection only reflect that user's data.

- [ ] **Step 6: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore(onboarding): verification pass fixes"
```

---

## Self-review notes

- **Spec coverage:** default data + `needsSeed` pure & tested (Task 1); `ensureSeed` idempotent insert of categories + accounts + `useEnsureSeed` (Task 2); layout "Préparation…" gate on first login, no re-seed after (Task 3); RLS `security_invoker` SQL deliverable (Task 4); verification incl. fresh-user smoke, no-re-seed, jeff-unchanged, constraint guardrail, and the manual SQL step + runbook (Task 5). All spec points covered.
- **Placeholder scan:** none; full code in every step. The constraint guardrail is an explicit, bounded contingency (mirrors the import `source` fix), not a vague "handle errors".
- **Type consistency:** `SeedCategory`/`SeedAccount`/`DEFAULT_CATEGORIES`/`DEFAULT_ACCOUNTS`/`needsSeed` (Task 1) consumed by `seed.ts` (Task 2); `ensureSeed` consumed by `useEnsureSeed` (Task 2); `useEnsureSeed`/`AuthUser`/`AuthContext`/`useSession` (existing + Task 2) consumed by the layout (Task 3). `AuthUser` is already exported from `hooks.ts` (used by the existing `AuthContext`).
- **Hook rules:** `useEnsureSeed` is called unconditionally inside `SeededShell` (only mounted once `user` is non-null), avoiding a conditional-hook violation in the layout's early returns.
- **Branch note:** `onboarding-seed` from `main`. The RLS SQL (Task 4) is a repo-tracked deliverable, applied manually; it is not exercised by tests/build.
