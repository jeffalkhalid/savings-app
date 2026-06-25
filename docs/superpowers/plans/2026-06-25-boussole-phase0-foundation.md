# Boussole Phase 0 — Fondation design & mode sombre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-thématiser l'app vers le système « Boussole » (palette chaude en variables CSS), ajouter le mode sombre (suit le système + bouton mémorisé), passer le corps en DM Sans (Geist Mono gardé pour les montants), restyler le TabBar.

**Architecture:** Couleurs pilotées par variables CSS (`:root` clair / `.dark` sombre) que Tailwind référence via `var(--x)` ; les noms de classes existants sont conservés et repointés. Mode sombre = classe `.dark` sur `<html>`, gérée par un `ThemeProvider` client adossé à un module pur `theme.ts`, avec script anti-flash dans le `<head>`.

**Tech Stack:** Next.js 15 (app router), React 19, TypeScript, Tailwind 3, Vitest, lucide-react.

## Global Constraints

- Aucun backend, aucune logique métier modifiée ; uniquement style + thème + shell.
- Tokens en variables CSS : clair dans `:root`, sombre dans `.dark` ; Tailwind référence `var(--…)`.
- Conserver les noms de classes existants (`paper`, `ink`, `rule`, `emerald`, `strat-a`…), repointer leurs valeurs ; ajouter `card`, `tile`, `seg`, `ink2`, `accent`, `gold`.
- Polices : corps **DM Sans**, titres Fraunces (`.font-display`), montants **Geist Mono** (`.font-mono-num`, inchangé).
- Mode sombre : préférence système au 1er lancement ; bouton dans l'en-tête Cockpit ; choix mémorisé `localStorage('theme')` (valeurs `"light"`/`"dark"`).
- Accès `localStorage`/`matchMedia` toujours encapsulé `try/catch` (mode privé, SSR).
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Module pur `theme.ts` (TDD)

**Files:**
- Create: `lib/cockpit/theme.ts`
- Test: `lib/cockpit/theme.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type Theme = "light" | "dark"`; `resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme`; `nextTheme(current: Theme): Theme`.

- [ ] **Step 1: Write the failing test**

Create `lib/cockpit/theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveInitialTheme, nextTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("uses the stored value when explicit", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
  });
  it("falls back to the system preference when not stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
  it("falls back to the system preference when stored is unknown", () => {
    expect(resolveInitialTheme("", true)).toBe("dark");
    expect(resolveInitialTheme("bogus", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("toggles", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- theme`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Implement theme.ts**

Create `lib/cockpit/theme.ts`:

```ts
export type Theme = "light" | "dark";

// Préférence effective au démarrage : valeur stockée si explicite, sinon préférence système.
export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean
): Theme {
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/theme.ts lib/cockpit/theme.test.ts
git commit -m "feat(redesign): add pure theme resolver with tests"
```

---

## Task 2: Tokens & polices — `tailwind.config.ts` + `app/globals.css`

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: rien.
- Produces: classes Tailwind repointées vers la palette chaude (via variables CSS), nouveaux tokens `card`/`tile`/`seg`/`ink2`/`accent`/`gold`, `darkMode:"class"`, corps en DM Sans. Les variables `--phone/--card/--tile/--seg/--line/--muted/--ink2/--ink/--bg` existent en clair (`:root`) et sombre (`.dark`).

- [ ] **Step 1: Replace `tailwind.config.ts`**

Replace the entire file with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--phone)",
        card: "var(--card)",
        tile: "var(--tile)",
        seg: "var(--seg)",
        rule: "var(--line)",
        ink: "var(--ink)",
        ink2: "var(--ink2)",
        "ink-muted": "var(--muted)",
        emerald: "#3E7D5A",
        accent: "#C75B39",
        gold: "#E3B23C",
        "strat-a": "#C75B39",
        "strat-b": "#4A6FA5",
        "strat-c": "#836FB2",
        "strat-d": "#4F8B82",
        "strat-e": "#B89968",
        "strat-f": "#2D7A4F",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontVariantNumeric: {
        "tabular-nums": "tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Replace the top of `app/globals.css` (import + base + variables + body)**

Replace lines 1–37 (the `@import` through the `.font-mono-num` block) with the following. Leave the rest of the file (range slider + number input rules, from `/* Subtle range slider styling */` onward) untouched:

```css
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Geist+Mono:wght@400;500&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #e7ddcd;
  --phone: #f3ede3;
  --card: #fbf7f0;
  --tile: #efe3cf;
  --seg: #ebe2d2;
  --line: #e6ddcd;
  --muted: #9a8e7c;
  --ink2: #6b6155;
  --ink: #2a241c;
}

.dark {
  --bg: #14110d;
  --phone: #1c1915;
  --card: #262019;
  --tile: #2f2820;
  --seg: #2c261e;
  --line: #372f25;
  --muted: #a89b86;
  --ink2: #c7baa4;
  --ink: #f1eadf;
}

html,
body {
  background: var(--phone);
  color: var(--ink);
  font-family: "DM Sans", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color 0.3s ease;
}

.font-display {
  font-family: "Fraunces", Georgia, serif;
  font-feature-settings: "ss01" 1;
}

.font-mono-num {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

Note: the range-slider rules below already use `var(--color-rule)`/`var(--color-ink)`, which no longer exist. In Step 3 you update them to the new variables.

- [ ] **Step 3: Update the slider variables in the rest of `app/globals.css`**

In the range-slider rules, replace every `var(--color-rule)` with `var(--line)` and every `var(--color-ink)` with `var(--ink)` (4 occurrences total: track `background` in `::-webkit-slider-runnable-track` and `::-moz-range-track` use `--color-rule`; thumb `background` in `::-webkit-slider-thumb` and `::-moz-range-thumb` use `--color-ink`).

- [ ] **Step 4: Type-check + build the CSS**

Run: `npx tsc --noEmit`
Expected: No errors.
Run: `npm run build`
Expected: Build succeeds (Tailwind compiles the new tokens; no "class does not exist" errors).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "feat(redesign): warm Boussole tokens via CSS vars + DM Sans, dark mode class"
```

---

## Task 3: `ThemeProvider` + anti-flash script + layout wiring

**Files:**
- Create: `components/cockpit/ThemeProvider.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/cockpit/layout.tsx`

**Interfaces:**
- Consumes: `resolveInitialTheme`, `nextTheme`, `type Theme` from `@/lib/cockpit/theme` (Task 1).
- Produces: `ThemeProvider` (client component wrapping children); `useTheme(): { theme: Theme; toggle: () => void }` exported from `components/cockpit/ThemeProvider.tsx`.

- [ ] **Step 1: Create `components/cockpit/ThemeProvider.tsx`**

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { resolveInitialTheme, nextTheme, type Theme } from "@/lib/cockpit/theme";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function readInitial(): Theme {
  if (typeof window === "undefined") return "light";
  let stored: string | null = null;
  let prefersDark = false;
  try {
    stored = window.localStorage.getItem("theme");
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    /* mode privé : repli préférence par défaut */
  }
  return resolveInitialTheme(stored, prefersDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Synchronise l'état React avec ce que le script anti-flash a déjà appliqué.
  useEffect(() => {
    setTheme(readInitial());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => nextTheme(t));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 2: Add the anti-flash script + theme color to `app/layout.tsx`**

Replace the entire contents of `app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulateur épargne salariale",
  description:
    "PEG vs PER, recyclage, plafonds d'abondement, fiscalité de sortie — 6 stratégies comparées en temps réel.",
};

export const viewport: Viewport = {
  themeColor: "#F3EDE3",
};

const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='dark'||s==='light'?s:(d?'dark':'light');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Wrap the cockpit shell with `ThemeProvider`**

In `app/cockpit/layout.tsx`, add the import and wrap the provider tree. Add this import after the existing component imports:

```tsx
import { ThemeProvider } from "@/components/cockpit/ThemeProvider";
```

Then change `SeededShell`'s returned JSX so `ThemeProvider` wraps the `AuthContext.Provider`. Replace this block:

```tsx
  return (
    <AuthContext.Provider value={user}>
      <div className="min-h-screen pb-24">{children}</div>
      <TabBar />
    </AuthContext.Provider>
  );
```

with:

```tsx
  return (
    <ThemeProvider>
      <AuthContext.Provider value={user}>
        <div className="min-h-screen pb-24">{children}</div>
        <TabBar />
      </AuthContext.Provider>
    </ThemeProvider>
  );
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/cockpit/ThemeProvider.tsx app/layout.tsx app/cockpit/layout.tsx
git commit -m "feat(redesign): ThemeProvider + anti-flash script, wrap cockpit shell"
```

---

## Task 4: `ThemeToggle` in the Cockpit header

**Files:**
- Create: `components/cockpit/ThemeToggle.tsx`
- Modify: `app/cockpit/page.tsx`

**Interfaces:**
- Consumes: `useTheme` from `@/components/cockpit/ThemeProvider` (Task 3).
- Produces: `ThemeToggle` component (no props).

- [ ] **Step 1: Create `components/cockpit/ThemeToggle.tsx`**

```tsx
"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/cockpit/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
      className="w-9 h-9 rounded-xl border border-rule bg-card text-ink-muted flex items-center justify-center"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
```

- [ ] **Step 2: Add `ThemeToggle` to the Cockpit header**

In `app/cockpit/page.tsx`, add the import next to the other component imports:

```tsx
import { ThemeToggle } from "@/components/cockpit/ThemeToggle";
```

Then, in the header actions `div` (the one containing `MonthSwitcher`, the `Import` `Link`, and the `Déco` button — `<div className="flex items-center gap-2">`), add `<ThemeToggle />` as the first child, immediately before `<MonthSwitcher … />`:

```tsx
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MonthSwitcher month={month} onChange={changeMonth} />
```

(Leave the rest of the header unchanged.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/ThemeToggle.tsx app/cockpit/page.tsx
git commit -m "feat(redesign): theme toggle in cockpit header"
```

---

## Task 5: Restyle the `TabBar`

**Files:**
- Modify: `components/cockpit/TabBar.tsx`

**Interfaces:**
- Consumes: existing `next/link`, `usePathname`, lucide icons.
- Produces: restyled `TabBar` (same 3 routes, warm look, active = accent).

- [ ] **Step 1: Replace `components/cockpit/TabBar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Landmark, TrendingUp } from "lucide-react";

const ITEMS = [
  { href: "/cockpit", label: "Cockpit", Icon: LayoutGrid },
  { href: "/cockpit/patrimoine", label: "Patrimoine", Icon: Landmark },
  { href: "/cockpit/projection", label: "Projection", Icon: TrendingUp },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-rule pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-[600px] mx-auto flex">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                active ? "text-accent" : "text-ink-muted"
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/TabBar.tsx
git commit -m "feat(redesign): restyle TabBar to Boussole look"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites incl. `theme` green.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/cockpit`, `/cockpit/patrimoine`, `/cockpit/projection` present.

- [ ] **Step 4: Manual smoke (dev server)**

Run `npm run dev`, log in, then verify:
1. The whole app renders in the warm palette; body text is DM Sans; money amounts (stat strip, lists) stay monospaced and tabular-aligned.
2. The theme toggle (sun/moon, top of Cockpit header) flips light↔dark instantly; the choice survives a reload.
3. First load with no stored choice follows the OS appearance; there is no light→dark flash on load.
4. The TabBar shows Cockpit / Patrimoine / Projection with the active tab in terracotta; navigating between the three works.
5. Dark mode is legible on all three screens (cards, lines, muted text, accents).

- [ ] **Step 5: Final commit (only if tweaks were needed)**

```bash
git add -A
git commit -m "chore(redesign): Phase 0 verification fixes"
```

---

## Self-review notes

- **Spec coverage:** tokens+vars+DM Sans (Task 2) ; `theme.ts` pur testé (Task 1) ; ThemeProvider + anti-flash + wiring (Task 3) ; ThemeToggle en en-tête Cockpit (Task 4) ; TabBar restylé (Task 5) ; vérif test/tsc/build/smoke incl. mono + pas de flash (Task 6). Tous les points de la spec sont couverts.
- **Placeholder scan:** aucun ; code complet à chaque étape.
- **Type consistency:** `Theme`/`resolveInitialTheme`/`nextTheme` (Task 1) consommés par `ThemeProvider` (Task 3) ; `useTheme()` renvoie `{ theme, toggle }` utilisé par `ThemeToggle` (Task 4) ; tokens `card`/`rule`/`accent`/`ink-muted` (Task 2) utilisés par `ThemeToggle` et `TabBar`.
- **Known note:** le script anti-flash duplique volontairement la logique de `resolveInitialTheme` en JS inline (pas d'import possible dans `<head>`) ; les deux doivent rester cohérents (stored `"dark"`/`"light"` prioritaire, sinon préférence système).
- **Branch note:** continue `boussole-redesign` (contient déjà la roadmap + la spec Phase 0).
