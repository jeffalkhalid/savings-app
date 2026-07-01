# Boussole — Catégories communes + admin (3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire des catégories communes (`categories.user_id IS NULL`, partagées) gérées par un admin, à côté des catégories perso, sans casser les données existantes.

**Architecture:** `user_id` nullable + table `admins` + fonction `is_admin()` en RLS ; hook `useIsAdmin` ; `createCategory(userId|null)` ; `CategoriesModal` refondue en blocs Communes/Mes catégories avec édition admin ; seed par-personne retiré.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest, lucide-react.

## Global Constraints

- **Non destructif** : migration = `user_id` nullable + promotion (update d'un champ) + table admins. Aucun delete, aucun re-pointage (les `id` ne bougent pas → transactions/budgets préservés).
- Écriture d'une commune (`user_id IS NULL`) : réservée aux admins (RLS + UI).
- Icônes lucide, dark mode : champs `bg-card text-ink`, bouton emerald `text-[#FBF3EC]`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: `splitCategories` pure helper (TDD)

**Files:** Modify `lib/cockpit/category-admin.ts`, `lib/cockpit/category-admin.test.ts`

**Produces:** `splitCategories(categories, myUserId): { common, mine }`.

- [ ] **Step 1: Failing test** — append to `lib/cockpit/category-admin.test.ts` (add `splitCategories` to the existing `./category-admin` import):

```ts
describe("splitCategories", () => {
  const cats = [
    { id: "1", user_id: null },
    { id: "2", user_id: "me" },
    { id: "3", user_id: "other" },
  ];
  it("separates common (null) and mine, ignoring other users", () => {
    const { common, mine } = splitCategories(cats, "me");
    expect(common.map((c) => c.id)).toEqual(["1"]);
    expect(mine.map((c) => c.id)).toEqual(["2"]);
  });
});
```

- [ ] **Step 2: Run** `npm run test -- category-admin` → FAIL.

- [ ] **Step 3: Append to `lib/cockpit/category-admin.ts`**:

```ts
export function splitCategories<T extends { user_id?: string | null }>(
  categories: T[],
  myUserId: string
): { common: T[]; mine: T[] } {
  const common = categories.filter((c) => c.user_id == null);
  const mine = categories.filter(
    (c) => c.user_id != null && c.user_id === myUserId
  );
  return { common, mine };
}
```

- [ ] **Step 4: Run** `npm run test -- category-admin` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/category-admin.ts lib/cockpit/category-admin.test.ts
git commit -m "feat(categories): splitCategories(common/mine) helper with test"
```

---

## Task 2: Data layer — migration + type + hooks + API + seed

**Files:** Create `supabase/2026-07-01-common-categories.sql` ; Modify `lib/cockpit/types.ts`, `lib/cockpit/hooks.ts`, `lib/cockpit/categories-api.ts`, `lib/cockpit/seed.ts`

- [ ] **Step 1: Migration** — create `supabase/2026-07-01-common-categories.sql`:

```sql
-- Catégories communes + admin. À exécuter une fois dans Supabase > SQL Editor.
-- 1. user_id nullable (NULL = catégorie commune / partagée)
alter table public.categories alter column user_id drop not null;

-- 2. table des admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id)
);
alter table public.admins enable row level security;
drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins for select using (auth.uid() = user_id);

-- 3. helper is_admin() (security definer pour lire admins sous RLS)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 4. RLS catégories : voir communes + les siennes ; écrire les siennes, ou communes si admin
alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_write" on public.categories;
create policy "categories_select" on public.categories for select
  using (user_id is null or user_id = auth.uid());
create policy "categories_write" on public.categories for all
  using (user_id = auth.uid() or (user_id is null and public.is_admin()))
  with check (user_id = auth.uid() or (user_id is null and public.is_admin()));

-- 5. te seeder comme admin
insert into public.admins (user_id)
select id from auth.users where email = 'jeffalkhalid@gmail.com'
on conflict do nothing;

-- 6. promouvoir TES catégories en communes (même id → transactions/budgets préservés)
update public.categories
set user_id = null
where user_id = (select id from auth.users where email = 'jeffalkhalid@gmail.com');
```

- [ ] **Step 2: Type** — in `lib/cockpit/types.ts`, add `user_id?: string | null;` to the `Category` type.

- [ ] **Step 3: Hook select + `useIsAdmin`** — in `lib/cockpit/hooks.ts`:
  (a) In `useCategories`, add `user_id` to the select → `.select("id,name,type,color,is_fixed,active,user_id")`.
  (b) Add a new hook (near `useCategories`):
```ts
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase
      .from("admins")
      .select("user_id")
      .then(({ data }) => setIsAdmin(((data as unknown[]) ?? []).length > 0));
  }, []);
  return { isAdmin };
}
```
(`useState`, `useEffect`, `supabase` already imported.)

- [ ] **Step 4: API** — in `lib/cockpit/categories-api.ts`, change `createCategory`'s first param type from `userId: string` to `userId: string | null` (body unchanged — `user_id: userId` now allows `null` for common):
```ts
export async function createCategory(
  userId: string | null,
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
```

- [ ] **Step 5: Seed** — in `lib/cockpit/seed.ts`, remove the **categories** seeding block (keep accounts). New file content:
```ts
import { supabase } from "./supabase";
import { DEFAULT_ACCOUNTS, needsSeed } from "./defaults";

// Insère les comptes par défaut manquants (les catégories viennent désormais de
// la base commune partagée, plus de seed par-personne). RLS scope au user courant.
// Renvoie true si quelque chose a été inséré.
export async function ensureSeed(userId: string): Promise<boolean> {
  let seeded = false;

  const { data: accs, error: accSelErr } = await supabase
    .from("accounts")
    .select("id")
    .limit(1);
  if (accSelErr) throw new Error(accSelErr.message);
  if (needsSeed((accs as { id: string }[]) ?? [])) {
    const { error } = await supabase.from("accounts").insert(
      DEFAULT_ACCOUNTS.map((a) => ({
        user_id: userId,
        name: a.name,
        type: a.type,
        institution: "(à préciser)",
        currency: "EUR",
      }))
    );
    if (error) throw new Error(error.message);
    seeded = true;
  }

  return seeded;
}
```
(`DEFAULT_CATEGORIES` import dropped — it's still exported from `defaults.ts` and covered by `defaults.test.ts`, just no longer used here.)

- [ ] **Step 6: Type-check** — `npx tsc --noEmit` → no errors. (`CategoriesModal` still calls `createCategory(userId, …)` with a `string`, assignable to `string | null` — no break.)

- [ ] **Step 7: Commit**

```bash
git add supabase/2026-07-01-common-categories.sql lib/cockpit/types.ts lib/cockpit/hooks.ts lib/cockpit/categories-api.ts lib/cockpit/seed.ts
git commit -m "feat(categories): nullable user_id + admins/is_admin RLS + useIsAdmin + stop per-user category seed"
```

---

## Task 3: CategoriesModal refonte (Communes / Mes catégories + admin)

**Files:** Modify `components/cockpit/CategoriesModal.tsx` (full rewrite)

**Consumes:** `useIsAdmin` (Task 2), `splitCategories` (Task 1), `createCategory(userId|null)` (Task 2), `Category.user_id` (Task 2).

- [ ] **Step 1: Replace the whole file** `components/cockpit/CategoriesModal.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Archive, RotateCcw, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Category } from "@/lib/cockpit/types";
import { categoryIcon } from "@/lib/cockpit/category-icon";
import { useIsAdmin } from "@/lib/cockpit/hooks";
import {
  CATEGORY_COLORS,
  CAT_TYPE_LABELS,
  CAT_TYPE_ORDER,
  categoryNameError,
  splitCategories,
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
  const { isAdmin } = useIsAdmin();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CatType>("expense");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [newScope, setNewScope] = useState<"common" | "perso">("common");

  const { common, mine } = splitCategories(categories, userId);
  const commonActive = common.filter((c) => c.active !== false);
  const mineActive = mine.filter((c) => c.active !== false);
  const activeNames = [...commonActive, ...mineActive].map((c) => c.name);
  const archived = [
    ...mine.filter((c) => c.active === false),
    ...(isAdmin ? common.filter((c) => c.active === false) : []),
  ];

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
    const owner = isAdmin && newScope === "common" ? null : userId;
    const ok = await run(() =>
      createCategory(owner, {
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

  const editableRow = (c: Category) => {
    const Icon = categoryIcon(c.name);
    return (
      <div key={c.id}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setColorFor(colorFor === c.id ? null : c.id)}
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
  };

  const readonlyRow = (c: Category) => {
    const Icon = categoryIcon(c.name);
    return (
      <div key={c.id} className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: c.color + "22" }}
        >
          <Icon size={16} style={{ color: c.color }} />
        </div>
        <span className="flex-1 text-ink text-sm">{c.name}</span>
        <span className="text-[11px] text-ink-muted">commune</span>
      </div>
    );
  };

  const renderBlock = (title: string, rows: Category[], editable: boolean) => {
    if (!rows.length) return null;
    return (
      <div className="mb-5">
        <h3 className="font-display text-[15px] mb-2">{title}</h3>
        {CAT_TYPE_ORDER.map((t) => {
          const list = rows.filter((c) => c.type === t);
          if (!list.length) return null;
          return (
            <section key={t} className="mb-3">
              <h4 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
                {CAT_TYPE_LABELS[t]}
              </h4>
              <div className="grid gap-1.5">
                {list.map((c) => (editable ? editableRow(c) : readonlyRow(c)))}
              </div>
            </section>
          );
        })}
      </div>
    );
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
          <h2 className="font-display text-2xl">Catégories</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {renderBlock("Communes", commonActive, isAdmin)}
        {renderBlock("Mes catégories", mineActive, true)}

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
                      <span className="flex-1 text-sm text-ink-muted">
                        {c.name}
                        {c.user_id == null ? " · commune" : ""}
                      </span>
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
            {isAdmin && (
              <div className="flex gap-1 bg-seg rounded-xl p-1">
                {(["common", "perso"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewScope(s)}
                    className={`flex-1 rounded-lg py-2 text-[13px] font-medium ${
                      newScope === s ? "bg-card text-ink" : "text-ink-muted"
                    }`}
                  >
                    {s === "common" ? "Commune" : "Perso"}
                  </button>
                ))}
              </div>
            )}
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

- [ ] **Step 2: Type-check + build** — `npx tsc --noEmit` → clean ; `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/cockpit/CategoriesModal.tsx
git commit -m "feat(categories): CategoriesModal common/personal blocks + admin editing + scope toggle"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — `npm run test` → PASS (incl. `splitCategories`).
- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`, after running the migration)** — logged in as the admin (you):
  1. Réglages → « Gérer les catégories » : tes catégories apparaissent sous **« Communes »** (éditables) ; le bloc **« Mes catégories »** est vide (ou tes futures perso).
  2. Le sélecteur **Commune / Perso** apparaît dans « Ajouter ». Ajouter une commune → visible ; ajouter une perso → sous « Mes catégories ».
  3. Renommer/recolorer/archiver une commune fonctionne (admin).
  4. (Optionnel, 2e compte non-admin) : les communes sont en lecture seule avec le tag « commune » ; pas de sélecteur de scope ; peut ajouter des perso invisibles à l'admin.
  5. Transactions et budgets existants intacts. Lisible clair/sombre.

---

## Self-review notes

- **Spec coverage:** `splitCategories` (T1) ; migration `user_id` nullable + admins + is_admin RLS + promotion, type, `useIsAdmin`, `createCategory(null)`, seed (T2) ; UI 2 blocs + admin + scope (T3) ; vérif (T4). Couvert.
- **Placeholder scan:** code complet ; T3 = fichier entier.
- **Type consistency:** `splitCategories<T extends {user_id?}>` (T1) sur `Category` (user_id ajouté T2) ; `useIsAdmin` (T2) consommé T3 ; `createCategory(string|null)` (T2) appelé avec `owner: null|string` (T3) ; `Category.user_id` lu par splitCategories + archived tag.
- **Non-destructif / atomicité :** T2 ne casse pas l'ancienne modale (createCategory accepte toujours `string`) ; migration promeut sans delete.
- **Migration:** `supabase/2026-07-01-common-categories.sql`, exécutée par l'utilisateur ; idempotente.
- **Branch:** `boussole-redesign`.
```
