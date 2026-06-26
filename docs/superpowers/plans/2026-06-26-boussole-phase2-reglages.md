# Boussole Phase 2 — Réglages / user_settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écran Réglages (modale) + table `user_settings` : thème (light/dark/**system**, device-local), objectif de taux d'épargne (remplace le 20 % codé en dur du hero), devise de reporting.

**Architecture:** `user_settings` (goal + devise) via API/hook ; thème reste en localStorage avec rework `theme.ts`/`ThemeProvider` pour supporter « system » ; modale Réglages depuis l'en-tête Cockpit (ThemeToggle + Déco retirés, déplacés dedans).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, lucide-react, Vitest.

## Global Constraints

- Table `user_settings` créée par migration SQL **exécutée manuellement** ; RLS `auth.uid() = user_id`.
- Thème **device-local** (localStorage clé `theme`, valeurs `light|dark|system`). Le script anti-flash de `app/layout.tsx` gère déjà `system`/absent → **inchangé**.
- `user_settings` ne stocke **pas** le thème (seulement `savings_rate_goal` + `reporting_currency`).
- Icônes lucide ; montants `.font-mono-num` ; modale au motif `AssetModal` (`bg-paper`, champs `bg-white`, bouton `bg-emerald`, texte sur emerald `text-[#FBF3EC]`).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Migration SQL `user_settings`

**Files:** Create `supabase/2026-06-26-user-settings.sql`

- [ ] **Step 1: Create the file**

```sql
-- Réglages utilisateur (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id),
  savings_rate_goal numeric not null default 0.20,
  reporting_currency text not null default 'EUR',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_per_user" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/2026-06-26-user-settings.sql
git commit -m "feat(settings): SQL migration for user_settings + RLS"
```

(Not auto-applied — the user runs it before live testing. Build/tests don't touch the DB.)

---

## Task 2: `settings.ts` pure module (TDD)

**Files:** Create `lib/cockpit/settings.ts`, `lib/cockpit/settings.test.ts`

**Interfaces:**
- Produces: `UserSettings` type; `DEFAULT_SETTINGS`; `CURRENCIES: string[]`; `coerceSettings(row): UserSettings`.

- [ ] **Step 1: Write the failing test** — `lib/cockpit/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { coerceSettings, DEFAULT_SETTINGS } from "./settings";

describe("coerceSettings", () => {
  it("returns defaults for null", () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps a complete row", () => {
    expect(
      coerceSettings({ savings_rate_goal: 0.3, reporting_currency: "USD" })
    ).toEqual({ savings_rate_goal: 0.3, reporting_currency: "USD" });
  });
  it("fills missing/invalid fields with defaults", () => {
    expect(coerceSettings({ reporting_currency: "" }).savings_rate_goal).toBe(0.2);
    expect(coerceSettings({ reporting_currency: "" }).reporting_currency).toBe("EUR");
    expect(coerceSettings({ savings_rate_goal: 0 }).savings_rate_goal).toBe(0.2);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- settings` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/settings.ts`:

```ts
export type UserSettings = {
  savings_rate_goal: number;
  reporting_currency: string;
};

export const DEFAULT_SETTINGS: UserSettings = {
  savings_rate_goal: 0.2,
  reporting_currency: "EUR",
};

export const CURRENCIES: string[] = ["EUR", "USD", "GBP", "CHF", "CAD"];

export function coerceSettings(
  row: Partial<UserSettings> | null | undefined
): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const goal = Number(row.savings_rate_goal);
  const ccy = row.reporting_currency;
  return {
    savings_rate_goal:
      isFinite(goal) && goal > 0 ? goal : DEFAULT_SETTINGS.savings_rate_goal,
    reporting_currency:
      typeof ccy === "string" && ccy.trim()
        ? ccy
        : DEFAULT_SETTINGS.reporting_currency,
  };
}
```

- [ ] **Step 4: Run** `npm run test -- settings` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/settings.ts lib/cockpit/settings.test.ts
git commit -m "feat(settings): settings defaults + coerceSettings with tests"
```

---

## Task 3: `user-settings-api.ts` + `useUserSettings` hook

**Files:** Create `lib/cockpit/user-settings-api.ts`; Modify `lib/cockpit/hooks.ts`

**Interfaces:**
- Consumes: `supabase`; `UserSettings`, `coerceSettings`, `DEFAULT_SETTINGS` from `./settings` (Task 2).
- Produces: `getUserSettings(userId): Promise<UserSettings | null>`; `saveUserSettings(userId, { savingsRateGoal, reportingCurrency }): Promise<void>`; `useUserSettings(userId): { settings, refetch }`.

- [ ] **Step 1: Create `lib/cockpit/user-settings-api.ts`**

```ts
import { supabase } from "./supabase";
import type { UserSettings } from "./settings";

export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("savings_rate_goal,reporting_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettings) ?? null;
}

export async function saveUserSettings(
  userId: string,
  s: { savingsRateGoal: number; reportingCurrency: string }
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      savings_rate_goal: s.savingsRateGoal,
      reporting_currency: s.reportingCurrency,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Add `useUserSettings` to `lib/cockpit/hooks.ts`**

Add these imports (after the existing `./goals` import line added earlier):
```ts
import { getUserSettings } from "./user-settings-api";
import { coerceSettings, DEFAULT_SETTINGS, type UserSettings } from "./settings";
```
Append at the END of the file:
```ts
export function useUserSettings(userId: string) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const refetch = useCallback(() => {
    getUserSettings(userId)
      .then((row) => setSettings(coerceSettings(row)))
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { settings, refetch };
}
```

- [ ] **Step 3: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/cockpit/user-settings-api.ts lib/cockpit/hooks.ts
git commit -m "feat(settings): user-settings-api (get/upsert) + useUserSettings hook"
```

---

## Task 4: Theme system rework (light/dark/system)

**Files:** Modify `lib/cockpit/theme.ts`, `lib/cockpit/theme.test.ts`, `components/cockpit/ThemeProvider.tsx`, `app/cockpit/page.tsx`; Delete `components/cockpit/ThemeToggle.tsx`

**Interfaces:**
- Produces: `ThemePref = "light"|"dark"|"system"`; `Theme = "light"|"dark"`; `normalizePref(stored): ThemePref`; `resolveTheme(pref, prefersDark): Theme`; `nextTheme(theme): Theme`; `useTheme(): { theme, pref, setPref }`.
- Removes: `resolveInitialTheme`; `ThemeToggle` component; `useTheme().toggle`.

- [ ] **Step 1: Replace `lib/cockpit/theme.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizePref, resolveTheme, nextTheme } from "./theme";

describe("normalizePref", () => {
  it("keeps valid prefs", () => {
    expect(normalizePref("light")).toBe("light");
    expect(normalizePref("dark")).toBe("dark");
    expect(normalizePref("system")).toBe("system");
  });
  it("defaults unknown/null to system", () => {
    expect(normalizePref(null)).toBe("system");
    expect(normalizePref("")).toBe("system");
    expect(normalizePref("bogus")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the OS when system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("uses the explicit pref otherwise", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("toggles", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
```

- [ ] **Step 2: Run** `npm run test -- theme` → FAIL (`normalizePref`/`resolveTheme` not exported).

- [ ] **Step 3: Replace `lib/cockpit/theme.ts`**

```ts
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export function normalizePref(stored: string | null): ThemePref {
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): Theme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
```

- [ ] **Step 4: Run** `npm run test -- theme` → PASS.

- [ ] **Step 5: Replace `components/cockpit/ThemeProvider.tsx`**

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  normalizePref,
  resolveTheme,
  type Theme,
  type ThemePref,
} from "@/lib/cockpit/theme";

const ThemeContext = createContext<{
  theme: Theme;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}>({
  theme: "light",
  pref: "system",
  setPref: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    return normalizePref(window.localStorage.getItem("theme"));
  } catch {
    return "system";
  }
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>("system");
  const [theme, setTheme] = useState<Theme>("light");

  // Init après montage (le script anti-flash a déjà posé la classe).
  useEffect(() => {
    const p = readPref();
    setPref(p);
    setTheme(resolveTheme(p, prefersDark()));
  }, []);

  // Recalcule + persiste quand la préférence change ; suit l'OS en mode system.
  useEffect(() => {
    setTheme(resolveTheme(pref, prefersDark()));
    try {
      window.localStorage.setItem("theme", pref);
    } catch {
      /* ignore */
    }
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(resolveTheme("system", mq.matches));
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, pref, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 6: Remove `ThemeToggle` from the Cockpit header**

In `app/cockpit/page.tsx`: delete the import line
```tsx
import { ThemeToggle } from "@/components/cockpit/ThemeToggle";
```
and delete the `<ThemeToggle />` line inside the header actions `div` (the first child, just before `<MonthSwitcher …`).

- [ ] **Step 7: Delete the now-unused component**

```bash
git rm components/cockpit/ThemeToggle.tsx
```

- [ ] **Step 8: Type-check** — Run `npx tsc --noEmit` → no errors (nothing references `resolveInitialTheme`, `toggle`, or `ThemeToggle` anymore).

- [ ] **Step 9: Commit**

```bash
git add lib/cockpit/theme.ts lib/cockpit/theme.test.ts components/cockpit/ThemeProvider.tsx app/cockpit/page.tsx
git commit -m "feat(settings): theme prefs (light/dark/system), drop ThemeToggle"
```

---

## Task 5: `ReglagesModal`

**Files:** Create `components/cockpit/ReglagesModal.tsx`

**Interfaces:**
- Consumes: `saveUserSettings` (Task 3); `CURRENCIES`, `UserSettings` (Task 2); `useTheme` (Task 4); `ThemePref` (Task 4); `supabase`.
- Produces: `ReglagesModal({ userId, settings, onClose, onSaved })`.

- [ ] **Step 1: Create `components/cockpit/ReglagesModal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { saveUserSettings } from "@/lib/cockpit/user-settings-api";
import { CURRENCIES, type UserSettings } from "@/lib/cockpit/settings";
import { useTheme } from "@/components/cockpit/ThemeProvider";
import { supabase } from "@/lib/cockpit/supabase";
import type { ThemePref } from "@/lib/cockpit/theme";

const THEME_OPTS: { v: ThemePref; label: string }[] = [
  { v: "light", label: "Clair" },
  { v: "dark", label: "Sombre" },
  { v: "system", label: "Système" },
];

export function ReglagesModal({
  userId,
  settings,
  onClose,
  onSaved,
}: {
  userId: string;
  settings: UserSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pref, setPref } = useTheme();
  const [goalPct, setGoalPct] = useState(
    String(Math.round(settings.savings_rate_goal * 100))
  );
  const [currency, setCurrency] = useState(settings.reporting_currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const field = "border border-rule rounded-lg px-3 py-3 bg-white text-base w-full";
  const labelCls = "grid gap-1.5 text-[13px] text-ink-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const g = parseFloat(goalPct.replace(",", "."));
    if (!isFinite(g) || g <= 0) {
      setError("Objectif invalide");
      return;
    }
    setSaving(true);
    try {
      await saveUserSettings(userId, {
        savingsRateGoal: g / 100,
        reportingCurrency: currency,
      });
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
          <h2 className="font-display text-2xl">Réglages</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>
        <form onSubmit={submit} className="grid gap-4">
          <div className={labelCls}>
            Thème
            <div className="flex gap-1 bg-seg rounded-xl p-1">
              {THEME_OPTS.map((o) => {
                const on = pref === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setPref(o.v)}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
                      on ? "bg-card text-ink" : "text-ink-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className={labelCls}>
            Objectif de taux d&apos;épargne (%)
            <input
              className={field}
              type="text"
              inputMode="decimal"
              value={goalPct}
              onChange={(e) => setGoalPct(e.target.value)}
              required
            />
          </label>
          <label className={labelCls}>
            Devise de reporting
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            className="bg-emerald text-[#FBF3EC] rounded-lg py-3.5 font-semibold disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {error && <p className="text-accent text-sm">{error}</p>}
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="text-accent text-sm py-2 mt-2 border-t border-rule pt-4"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/ReglagesModal.tsx
git commit -m "feat(settings): ReglagesModal (theme/goal/currency/logout)"
```

---

## Task 6: Wire the Cockpit page (gear + settings goal)

**Files:** Modify `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `useUserSettings` (Task 3); `ReglagesModal` (Task 5); `Settings` (lucide).

- [ ] **Step 1: Imports**

Add `useUserSettings` to the hooks import block (`from "@/lib/cockpit/hooks"`). Add `Settings` to the existing lucide import line `import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, type LucideIcon } from "lucide-react";` → `import { Wallet, TrendingUp, PiggyBank, ArrowLeftRight, Settings, type LucideIcon } from "lucide-react";`. Add:
```tsx
import { ReglagesModal } from "@/components/cockpit/ReglagesModal";
```

- [ ] **Step 2: Replace the hardcoded goal with the setting**

Delete the line:
```tsx
const GOAL = 0.2;
```
Add a `showSettings` state next to the other `useState` flags:
```tsx
  const [showSettings, setShowSettings] = useState(false);
```
Add the settings hook with the other hooks (near `useRecurring`):
```tsx
  const { settings, refetch: refetchSettings } = useUserSettings(user.id);
```
Add, right after `const transfers = useMemo(...)` (before `mood`):
```tsx
  const goal = settings.savings_rate_goal;
```
Change the `mood` memo:
```tsx
  const mood = useMemo(
    () => savingsMood(metrics.tauxEpargne, GOAL),
    [metrics.tauxEpargne]
  );
```
to:
```tsx
  const mood = useMemo(
    () => savingsMood(metrics.tauxEpargne, goal),
    [metrics.tauxEpargne, goal]
  );
```
Change the `HeroCard` prop `goal={GOAL}` to `goal={goal}`.

- [ ] **Step 3: Header — replace « Déco » with a Settings gear**

In the header actions `div`, replace the « Déco » button:
```tsx
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-ink-muted text-sm"
          >
            Déco
          </button>
```
with:
```tsx
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Réglages"
            className="text-ink-muted"
            type="button"
          >
            <Settings size={18} />
          </button>
```

- [ ] **Step 4: Render the modal**

Just before the final `</main>` (after the `{editTxn && (...)}` block), add:
```tsx
      {showSettings && (
        <ReglagesModal
          userId={user.id}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            refetchSettings();
            setShowSettings(false);
          }}
        />
      )}
```

- [ ] **Step 5: Type-check** — Run `npx tsc --noEmit` → no errors. (`supabase` import stays — still used elsewhere? If the only remaining `supabase` use was the Déco button, the import is now unused. Check: if `supabase` becomes unused in `page.tsx`, remove its import line `import { supabase } from "@/lib/cockpit/supabase";` to satisfy lint/tsc. Verify with a search before deciding.)

- [ ] **Step 6: Commit**

```bash
git add app/cockpit/page.tsx
git commit -m "feat(settings): cockpit gear → ReglagesModal, hero uses settings goal"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — Run `npm run test` → PASS (incl. `settings`, `theme`).
- [ ] **Step 2: Type-check** — Run `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — Run `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`)** — **requires running `supabase/2026-06-26-user-settings.sql` first.** Then:
  1. Cockpit header shows a gear (no ThemeToggle, no « Déco »). It opens Réglages.
  2. Thème segmenté Clair/Sombre/Système applies instantly; reload keeps the choice; « Système » follows the OS appearance.
  3. Change the savings-rate goal → after Enregistrer, the hero progress bar/mood reflect the new goal; reload persists it.
  4. Currency selection persists.
  5. Déconnexion (from Réglages) logs out.
  6. No light→dark flash on load; legible in light and dark.
- [ ] **Step 5: Final commit (only if tweaks needed)**

```bash
git add -A
git commit -m "chore(settings): Phase 2 Réglages verification fixes"
```

---

## Self-review notes

- **Spec coverage:** SQL (Task 1) ; settings pure (Task 2) ; api + hook (Task 3) ; theme rework incl. system + ThemeToggle removal (Task 4) ; ReglagesModal (Task 5) ; page wiring incl. hero goal + gear + logout-moved (Task 6) ; verification incl. SQL-first + 3 themes (Task 7). All covered.
- **Placeholder scan:** none; full code in every step.
- **Type consistency:** `UserSettings`/`coerceSettings`/`DEFAULT_SETTINGS` (2) used by api/hook (3), ReglagesModal (5), page (6) ; `ThemePref`/`resolveTheme`/`normalizePref` (4) used by ThemeProvider (4) + ReglagesModal (5) ; `useTheme()` now returns `{ theme, pref, setPref }` (no `toggle`) — only consumer is ReglagesModal (5) since ThemeToggle is deleted ; `useUserSettings` returns `{ settings, refetch }` consumed by page (6).
- **Anti-flash:** `app/layout.tsx` script already maps `'dark'|'light'` else OS — unchanged; consistent with `normalizePref`/`resolveTheme`.
- **Ordering:** Task 4 reworks theme.ts + ThemeProvider + deletes ThemeToggle + removes its page usage in one task, so tsc is clean at the task boundary (no dangling `resolveInitialTheme`/`toggle`/`ThemeToggle` refs).
- **DB note:** table by manual SQL; tests/build don't hit the DB; live smoke needs the migration first.
- **Branch note:** continues `boussole-redesign`; docs on the branch.
