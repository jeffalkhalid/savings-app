# Boussole — Gestion des catégories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écran de gestion des catégories (ajouter / renommer / recolorer / archiver / réactiver) accessible depuis Réglages, supprimant le besoin de SQL.

**Architecture:** module pur `category-admin.ts` (palette + validation) → API `categories-api.ts` → `CategoriesModal` ouvert depuis `ReglagesModal` ; colonne `active` (archivage soft) ; sélecteurs filtrés sur `active`, lookups gardent tout.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest, lucide-react.

## Global Constraints

- **Aucune suppression dure** : archivage via `categories.active boolean not null default true` (migration SQL exécutée par l'utilisateur).
- **Type non modifiable** après création ; couleur via **palette de préréglages** ; icône dérivée du nom (`categoryIcon`), non stockée.
- Icônes **lucide-react** uniquement, jamais d'emoji.
- Bouton plein emerald : libellé `text-[#FBF3EC]` (PAS `text-paper`, qui devient sombre en dark mode) — cohérent avec `ReglagesModal`.
- Champs de saisie : `bg-card text-ink` (lisibles en dark), jamais `bg-white`.
- Sélecteurs (saisie/import/budgets) n'affichent que les catégories **actives** ; l'affichage/résolution des transactions passées garde la liste complète.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Module pur `category-admin.ts` (TDD)

**Files:** Create `lib/cockpit/category-admin.ts`, `lib/cockpit/category-admin.test.ts`

**Produces:** `CATEGORY_COLORS: string[]`, `CatType`, `CAT_TYPE_LABELS`, `CAT_TYPE_ORDER: CatType[]`, `categoryNameError(name, existingNames): string | null`.

- [ ] **Step 1: Failing test** — `lib/cockpit/category-admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  CAT_TYPE_ORDER,
  categoryNameError,
} from "./category-admin";

describe("categoryNameError", () => {
  it("requires a name", () => {
    expect(categoryNameError("  ", [])).toBe("Nom requis");
  });
  it("rejects a duplicate (case/accent-insensitive)", () => {
    expect(categoryNameError("Énergie", ["energie"])).toBe("Ce nom existe déjà");
  });
  it("accepts a fresh name", () => {
    expect(categoryNameError("Voyages", ["Énergie", "Loisirs"])).toBeNull();
  });
});

describe("palette + types", () => {
  it("has hex colors", () => {
    expect(CATEGORY_COLORS.length).toBeGreaterThan(0);
    for (const c of CATEGORY_COLORS) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
  it("orders all 4 types", () => {
    expect(new Set(CAT_TYPE_ORDER).size).toBe(4);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- category-admin` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/category-admin.ts`:

```ts
export const CATEGORY_COLORS = [
  "#B45342",
  "#C75B39",
  "#B89968",
  "#E3B23C",
  "#3E7D5A",
  "#4F8B82",
  "#4A6FA5",
  "#836FB2",
  "#C62828",
  "#6B6E76",
];

export type CatType = "income" | "expense" | "transfer" | "savings";

export const CAT_TYPE_LABELS: Record<CatType, string> = {
  expense: "Dépenses",
  income: "Revenus",
  savings: "Épargne",
  transfer: "Virements",
};

export const CAT_TYPE_ORDER: CatType[] = [
  "expense",
  "income",
  "savings",
  "transfer",
];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Erreur de validation d'un nom, ou null si valide.
// existingNames = noms des catégories ACTIVES (hors la catégorie éditée).
export function categoryNameError(
  name: string,
  existingNames: string[]
): string | null {
  if (!name.trim()) return "Nom requis";
  const n = norm(name);
  if (existingNames.some((e) => norm(e) === n)) return "Ce nom existe déjà";
  return null;
}
```

- [ ] **Step 4: Run** `npm run test -- category-admin` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/category-admin.ts lib/cockpit/category-admin.test.ts
git commit -m "feat(categories): category-admin pure module (palette + name validation)"
```

---

## Task 2: Data layer (migration + type + hook + API)

**Files:** Create `supabase/2026-07-01-categories-active.sql`, `lib/cockpit/categories-api.ts` ; Modify `lib/cockpit/types.ts`, `lib/cockpit/hooks.ts`

**Consumes:** `CatType` from `category-admin`.
**Produces:** `createCategory`, `updateCategory`, `setCategoryActive` ; `Category.active?: boolean`.

- [ ] **Step 1: Migration** — create `supabase/2026-07-01-categories-active.sql`:

```sql
-- Gestion des catégories : colonne d'archivage + policies RLS d'écriture.
-- À exécuter une fois dans Supabase > SQL Editor.
alter table public.categories add column if not exists active boolean not null default true;

alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
create policy "categories_per_user" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Category type** — in `lib/cockpit/types.ts`, add `active?: boolean;` to the `Category` type (after `is_fixed?: boolean;`):

```ts
export type Category = {
  id: string;
  name: string;
  type: string;
  color: string;
  monthly_budget?: number | null;
  is_fixed?: boolean;
  active?: boolean;
};
```

- [ ] **Step 3: Hook select** — in `lib/cockpit/hooks.ts`, `useCategories`, extend the select to include `active`:

```ts
      .select("id,name,type,color,monthly_budget,is_fixed,active")
```
(Leave `.order("name")` and the rest unchanged. `useCategories` keeps returning ALL categories.)

- [ ] **Step 4: API** — create `lib/cockpit/categories-api.ts`:

```ts
import { supabase } from "./supabase";
import type { CatType } from "./category-admin";

export async function createCategory(
  userId: string,
  input: { name: string; type: CatType; color: string }
): Promise<void> {
  const { error } = await supabase.from("categories").insert({
    user_id: userId,
    name: input.name,
    type: input.type,
    color: input.color,
    active: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateCategory(input: {
  id: string;
  name: string;
  color: string;
}): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ name: input.name, color: input.color })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function setCategoryActive(
  id: string,
  active: boolean
): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .update({ active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Type-check** — `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/2026-07-01-categories-active.sql lib/cockpit/categories-api.ts lib/cockpit/types.ts lib/cockpit/hooks.ts
git commit -m "feat(categories): active column migration + categories-api + hook select"
```

---

## Task 3: `CategoriesModal` component

**Files:** Create `components/cockpit/CategoriesModal.tsx`

**Consumes:** `category-admin` exports, `categories-api` functions, `categoryIcon`, `Category` type.

This is a standalone new component (not yet mounted → tsc stays clean). Full code:

- [ ] **Step 1: Create** `components/cockpit/CategoriesModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Archive, RotateCcw, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Category } from "@/lib/cockpit/types";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import {
  CATEGORY_COLORS,
  CAT_TYPE_LABELS,
  CAT_TYPE_ORDER,
  categoryNameError,
  type CatType,
} from "@/lib/cockpit/category-admin";
import {
  createCategory,
  updateCategory,
  setCategoryActive,
} from "@/lib/cockpit/categories-api";

export function CategoriesModal({
  userId,
  categories,
  onChanged,
  onClose,
}: {
  userId: string;
  categories: Category[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CatType>("expense");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);

  const active = categories.filter((c) => c.active !== false);
  const archived = categories.filter((c) => c.active === false);
  const activeNames = active.map((c) => c.name);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setError("");
    setBusy(true);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = (c: Category, raw: string) => {
    const name = raw.trim();
    if (name === c.name) return;
    const err = categoryNameError(
      name,
      activeNames.filter((n) => n !== c.name)
    );
    if (err) {
      setError(err);
      return;
    }
    run(() => updateCategory({ id: c.id, name, color: c.color }));
  };

  const recolor = (c: Category, color: string) => {
    setColorFor(null);
    run(() => updateCategory({ id: c.id, name: c.name, color }));
  };

  const add = async () => {
    const err = categoryNameError(newName, activeNames);
    if (err) {
      setError(err);
      return;
    }
    const ok = await run(() =>
      createCategory(userId, {
        name: newName.trim(),
        type: newType,
        color: newColor,
      })
    );
    if (ok) setNewName("");
  };

  const swatch = (col: string, selected: boolean, onClick: () => void) => (
    <button
      key={col}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={col}
      className={`w-7 h-7 rounded-full shrink-0 ${
        selected ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""
      }`}
      style={{ backgroundColor: col }}
    />
  );

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
          <h2 className="font-display text-2xl">Catégories</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {CAT_TYPE_ORDER.map((t) => {
          const rows = active.filter((c) => c.type === t);
          if (!rows.length) return null;
          return (
            <section key={t} className="mb-4">
              <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
                {CAT_TYPE_LABELS[t]}
              </h3>
              <div className="grid gap-1.5">
                {rows.map((c) => {
                  const Icon = categoryIcon(c.name);
                  return (
                    <div key={c.id}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setColorFor(colorFor === c.id ? null : c.id)
                          }
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: c.color + "22" }}
                          aria-label="Couleur"
                        >
                          <Icon size={16} style={{ color: c.color }} />
                        </button>
                        <input
                          defaultValue={c.name}
                          disabled={busy}
                          className="flex-1 bg-transparent text-ink text-sm border-b border-transparent focus:border-rule outline-none py-1"
                          onBlur={(e) => rename(c, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => run(() => setCategoryActive(c.id, false))}
                          disabled={busy}
                          className="text-ink-muted p-1.5"
                          aria-label="Archiver"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                      {colorFor === c.id && (
                        <div className="flex flex-wrap gap-1.5 pl-10 pb-1 pt-1">
                          {CATEGORY_COLORS.map((col) =>
                            swatch(
                              col,
                              c.color.toLowerCase() === col.toLowerCase(),
                              () => recolor(c, col)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {archived.length > 0 && (
          <section className="mb-4">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-ink-muted mb-2"
            >
              Archivées ({archived.length})
              {showArchived ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showArchived && (
              <div className="grid gap-1.5">
                {archived.map((c) => {
                  const Icon = categoryIcon(c.name);
                  return (
                    <div key={c.id} className="flex items-center gap-2 opacity-70">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.color + "22" }}
                      >
                        <Icon size={16} style={{ color: c.color }} />
                      </div>
                      <span className="flex-1 text-sm text-ink-muted">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => run(() => setCategoryActive(c.id, true))}
                        disabled={busy}
                        className="text-emerald text-[13px] flex items-center gap-1 p-1.5"
                        aria-label="Réactiver"
                      >
                        <RotateCcw size={15} /> Réactiver
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="border-t border-rule pt-4">
          <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            Ajouter
          </h3>
          <div className="grid gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom de la catégorie"
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CatType)}
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            >
              {CAT_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {CAT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_COLORS.map((col) =>
                swatch(col, newColor === col, () => setNewColor(col))
              )}
            </div>
            <button
              type="button"
              onClick={add}
              disabled={busy || !newName.trim()}
              className="bg-emerald text-[#FBF3EC] rounded-lg py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Plus size={17} /> Ajouter
            </button>
          </div>
        </section>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/CategoriesModal.tsx
git commit -m "feat(categories): CategoriesModal (list/add/rename/recolor/archive)"
```

---

## Task 4: Wiring + picker filtering + verification

**Files:** Modify `components/cockpit/ReglagesModal.tsx`, `app/cockpit/page.tsx`, `components/cockpit/TxnModal.tsx`, `components/cockpit/BudgetsModal.tsx`, `app/cockpit/import/page.tsx`

**Consumes:** `CategoriesModal` (Task 3).

- [ ] **Step 1: `ReglagesModal` — props + button + mount**

Add imports:
```tsx
import type { Category } from "@/lib/cockpit/types";
import { CategoriesModal } from "@/components/cockpit/CategoriesModal";
```
Add to the props type + destructure: `categories: Category[];` and `onCategoriesChanged: () => void;`.
Add state (with the other `useState`s): `const [showCategories, setShowCategories] = useState(false);`
Change the component's outermost `return (` so the modal root and the nested `CategoriesModal` are siblings — wrap in a fragment:
```tsx
  return (
    <>
      <div
        className="fixed inset-0 z-[1000] bg-black/50 flex items-end justify-center"
        onClick={onClose}
      >
        {/* …existing modal content unchanged… */}
      </div>
      {showCategories && (
        <CategoriesModal
          userId={userId}
          categories={categories}
          onChanged={onCategoriesChanged}
          onClose={() => setShowCategories(false)}
        />
      )}
    </>
  );
```
Inside the form, just BEFORE the "Déconnexion" button, add:
```tsx
          <button
            type="button"
            onClick={() => setShowCategories(true)}
            className="text-ink text-sm py-2 border-t border-rule pt-4 text-left"
          >
            Gérer les catégories
          </button>
```

- [ ] **Step 2: `app/cockpit/page.tsx` — pass props to ReglagesModal**

At the `<ReglagesModal … />` usage (around line 346), add:
```tsx
          categories={categories}
          onCategoriesChanged={refetchCategories}
```
(`categories` and `refetchCategories` already exist in this component from `useCategories()`.)

- [ ] **Step 3: `TxnModal` — show only active categories (keep the edited one)**

In `components/cockpit/TxnModal.tsx`, derive the picker list and use it in the category `<select>` instead of `categories`:
```tsx
  const pickCategories = categories.filter(
    (c) => c.active !== false || c.id === txn?.category_id
  );
```
Replace `categories.map((c) => (` inside the Catégorie `<select>` with `pickCategories.map((c) => (`. (Leave the `save()` lookup `categories.find(...)` on the full list unchanged.)

- [ ] **Step 4: `BudgetsModal` — show only active categories**

Read `components/cockpit/BudgetsModal.tsx`. Where it iterates `categories` to render budget rows (expenses), filter active: introduce `const rows = categories.filter((c) => c.active !== false)` (combined with any existing type filter, e.g. `.filter((c) => c.type === "expense")`) and map over that instead of the raw `categories`. Do not change how it writes budgets.

- [ ] **Step 5: `app/cockpit/import/page.tsx` — active categories in the picker only**

The page holds `categories` state and passes it to `<ReviewTable categories={categories} … />`, and also uses `categories.find((c) => c.name === r.categoryName)` in `doImport`. Change ONLY the ReviewTable prop to an active-filtered list; keep `doImport` resolving against the full `categories`:
```tsx
        <ReviewTable
          rows={rows}
          categories={categories.filter((c) => c.active !== false)}
          …
```

- [ ] **Step 6: Verify** — Run:
  - `npx tsc --noEmit` → no errors.
  - `npm run test` → all pass (incl. `category-admin`).
  - `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/ReglagesModal.tsx app/cockpit/page.tsx components/cockpit/TxnModal.tsx components/cockpit/BudgetsModal.tsx app/cockpit/import/page.tsx
git commit -m "feat(categories): mount CategoriesModal from Réglages + filter pickers to active"
```

- [ ] **Step 8: Manual smoke (`npm run dev`, after running the migration)**
  1. Réglages → « Gérer les catégories » → la modale liste les catégories par type.
  2. Ajouter « Voyages » (Dépense, couleur) → apparaît ; sélectionnable dans une nouvelle transaction.
  3. Renommer / recolorer une catégorie → reflété dans la saisie.
  4. Archiver une catégorie → disparaît des sélecteurs (saisie/import/budgets) ; les transactions passées dans cette catégorie restent lisibles ; elle apparaît dans « Archivées » → Réactiver la restaure.
  5. Doublon de nom / nom vide → message d'erreur, pas de création.
  6. Lisible en clair et en sombre.

---

## Self-review notes

- **Spec coverage:** module pur (T1) ; migration+API+type+hook (T2) ; CategoriesModal (T3) ; wiring Réglages + filtrage pickers + vérif (T4). Tous les points de la spec couverts.
- **Placeholder scan:** T1–T3 = code complet ; T4 steps 4 donne une instruction de lecture pour `BudgetsModal` (structure inconnue) mais avec le filtre exact à appliquer — pas un placeholder, une adaptation guidée.
- **Type consistency:** `CatType` (T1) consommé par `categories-api` (T2) + `CategoriesModal` (T3) ; `Category.active?` (T2) lu par `CategoriesModal`/pickers ; `createCategory/updateCategory/setCategoryActive` signatures identiques T2↔T3 ; props `categories`+`onCategoriesChanged` (ReglagesModal T4) fournies par page (T4 step 2).
- **Dark mode:** champs `bg-card text-ink`, bouton emerald `text-[#FBF3EC]`.
- **Archivage vs édition:** TxnModal garde la catégorie courante même archivée (pas de reclassement silencieux) ; `doImport` résout sur la liste complète.
- **Migration:** `supabase/2026-07-01-categories-active.sql`, exécutée par l'utilisateur.
- **Branch:** `boussole-redesign`.
```
