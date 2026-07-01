# Boussole — Gestion des co-admins (3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écran in-app (admin-only) pour lister / ajouter / retirer des co-admins par email, via des RPC Postgres sécurisées.

**Architecture:** helper pur `adminEmailError` → RPC `security definer` admin-only (`list_admins`/`add_admin_by_email`/`remove_admin`) → `admins-api` → `AdminsModal` ouvert depuis Réglages (bouton visible si admin).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 3, Supabase, Vitest, lucide-react.

## Global Constraints

- RPC réservées aux admins (`is_admin()` vérifié **côté base**) ; garde-fou : on ne peut pas se retirer soi-même.
- On ne promeut qu'un **compte existant** (email trouvé dans `auth.users`).
- Icônes lucide ; champs `bg-card text-ink` ; bouton emerald `text-[#FBF3EC]`.
- Vérif finale : `npm run test` vert, `npx tsc --noEmit` clean, `npm run build` OK.

---

## Task 1: Helper pur `adminEmailError` (TDD)

**Files:** Create `lib/cockpit/admins.ts`, `lib/cockpit/admins.test.ts`

- [ ] **Step 1: Failing test** — `lib/cockpit/admins.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adminEmailError } from "./admins";

describe("adminEmailError", () => {
  it("requires an email", () => {
    expect(adminEmailError("   ")).toBe("Email requis");
  });
  it("rejects an invalid email", () => {
    expect(adminEmailError("abc")).toBe("Email invalide");
  });
  it("accepts a valid email", () => {
    expect(adminEmailError("a@b.co")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npm run test -- admins` → FAIL.

- [ ] **Step 3: Implement** `lib/cockpit/admins.ts`:

```ts
export function adminEmailError(email: string): string | null {
  const e = email.trim();
  if (!e) return "Email requis";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return "Email invalide";
  return null;
}
```

- [ ] **Step 4: Run** `npm run test -- admins` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cockpit/admins.ts lib/cockpit/admins.test.ts
git commit -m "feat(admins): adminEmailError pure helper with test"
```

---

## Task 2: RPC Postgres + API

**Files:** Create `supabase/2026-07-02-admin-rpcs.sql`, `lib/cockpit/admins-api.ts`

**Produces:** `AdminRow`, `listAdmins`, `addAdminByEmail`, `removeAdmin`.

- [ ] **Step 1: Migration** — create `supabase/2026-07-02-admin-rpcs.sql`:

```sql
-- 3b : RPC de gestion des admins (réservées aux admins). Réutilise is_admin() (3a).
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.list_admins()
returns table (user_id uuid, email text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  return query
    select a.user_id, u.email::text
    from public.admins a
    join auth.users u on u.id = a.user_id
    order by u.email;
end;
$$;

create or replace function public.add_admin_by_email(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  select id into v_id from auth.users where email = lower(trim(p_email));
  if v_id is null then raise exception 'Aucun utilisateur avec cet email'; end if;
  insert into public.admins (user_id) values (v_id) on conflict do nothing;
end;
$$;

create or replace function public.remove_admin(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  if p_user_id = auth.uid() then raise exception 'Impossible de vous retirer vous-même'; end if;
  delete from public.admins where user_id = p_user_id;
end;
$$;

grant execute on function public.list_admins() to authenticated;
grant execute on function public.add_admin_by_email(text) to authenticated;
grant execute on function public.remove_admin(uuid) to authenticated;
```

- [ ] **Step 2: API** — create `lib/cockpit/admins-api.ts`:

```ts
import { supabase } from "./supabase";

export type AdminRow = { user_id: string; email: string };

export async function listAdmins(): Promise<AdminRow[]> {
  const { data, error } = await supabase.rpc("list_admins");
  if (error) throw new Error(error.message);
  return (data as AdminRow[]) ?? [];
}

export async function addAdminByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc("add_admin_by_email", { p_email: email });
  if (error) throw new Error(error.message);
}

export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_admin", { p_user_id: userId });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/2026-07-02-admin-rpcs.sql lib/cockpit/admins-api.ts
git commit -m "feat(admins): admin-only RPCs (list/add/remove) + admins-api"
```

---

## Task 3: `AdminsModal` + Réglages wiring

**Files:** Create `components/cockpit/AdminsModal.tsx` ; Modify `components/cockpit/ReglagesModal.tsx`

**Consumes:** `admins-api` (Task 2), `adminEmailError` (Task 1), `useIsAdmin` (existing, 3a).

- [ ] **Step 1: Create** `components/cockpit/AdminsModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import {
  listAdmins,
  addAdminByEmail,
  removeAdmin,
  type AdminRow,
} from "@/lib/cockpit/admins-api";
import { adminEmailError } from "@/lib/cockpit/admins";

export function AdminsModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refetch = () => {
    setLoading(true);
    listAdmins()
      .then((a) => {
        setAdmins(a);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setError("");
    setBusy(true);
    try {
      await fn();
      refetch();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const err = adminEmailError(email);
    if (err) {
      setError(err);
      return;
    }
    const ok = await run(() => addAdminByEmail(email.trim()));
    if (ok) setEmail("");
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
          <h2 className="font-display text-2xl">Admins</h2>
          <button className="text-ink-muted text-sm" onClick={onClose} type="button">
            Fermer
          </button>
        </header>

        {loading ? (
          <p className="text-ink-muted text-sm py-4">Chargement…</p>
        ) : (
          <div className="grid gap-1.5 mb-5">
            {admins.map((a) => (
              <div key={a.user_id} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{a.email}</span>
                {a.user_id === userId ? (
                  <span className="text-[11px] text-ink-muted">toi</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(() => removeAdmin(a.user_id))}
                    disabled={busy}
                    className="text-accent p-1.5"
                    aria-label="Retirer"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <section className="border-t border-rule pt-4">
          <h3 className="text-xs uppercase tracking-[0.1em] text-ink-muted mb-2">
            Ajouter un admin
          </h3>
          <div className="grid gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              type="email"
              inputMode="email"
              className="border border-rule rounded-lg px-3 py-2.5 bg-card text-ink text-sm w-full"
            />
            <p className="text-[11px] text-ink-muted">
              La personne doit déjà avoir un compte.
            </p>
            <button
              type="button"
              onClick={add}
              disabled={busy || !email.trim()}
              className="bg-emerald text-[#FBF3EC] rounded-lg py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <UserPlus size={17} /> Ajouter
            </button>
          </div>
        </section>

        {error && <p className="text-accent text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ReglagesModal`** — in `components/cockpit/ReglagesModal.tsx`:
  (a) Add imports:
```tsx
import { useIsAdmin } from "@/lib/cockpit/hooks";
import { AdminsModal } from "@/components/cockpit/AdminsModal";
```
  (b) Add near the top of the component body (with the other hooks/state):
```tsx
  const { isAdmin } = useIsAdmin();
  const [showAdmins, setShowAdmins] = useState(false);
```
  (c) Just AFTER the "Gérer les catégories" button and BEFORE the "Déconnexion" button, add:
```tsx
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdmins(true)}
              className="text-ink text-sm py-2 text-left"
            >
              Gérer les admins
            </button>
          )}
```
  (d) In the fragment, after the `{showCategories && ( <CategoriesModal … /> )}` block, add:
```tsx
    {showAdmins && (
      <AdminsModal userId={userId} onClose={() => setShowAdmins(false)} />
    )}
```

- [ ] **Step 3: Type-check + build** — `npx tsc --noEmit` → clean ; `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/AdminsModal.tsx components/cockpit/ReglagesModal.tsx
git commit -m "feat(admins): AdminsModal + admin-only entry from Réglages"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — `npm run test` → PASS (incl. `adminEmailError`).
- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → no errors.
- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Manual smoke (`npm run dev`, after running the migration)**, logged in as admin:
  1. Réglages → un bouton **« Gérer les admins »** apparaît (admin only) → ouvre la modale, ta ligne affiche « toi » (pas de bouton retirer).
  2. Ajouter par email d'un **compte existant** → il apparaît ; par un email inconnu → « Aucun utilisateur avec cet email ».
  3. Retirer un autre admin → disparaît. Tenter de te retirer → impossible (pas de bouton).
  4. (2e compte non-admin) : pas de bouton « Gérer les admins ».
  5. Lisible clair/sombre.

---

## Self-review notes

- **Spec coverage:** helper (T1) ; RPC + API (T2) ; AdminsModal + Réglages (T3) ; vérif (T4). Couvert.
- **Placeholder scan:** code complet partout.
- **Type consistency:** `AdminRow` (T2) utilisé par `AdminsModal` (T3) ; `adminEmailError` (T1) appelé T3 ; `useIsAdmin` (3a) réutilisé ; RPC noms/params (`p_email`, `p_user_id`) cohérents entre SQL (T2 step 1) et API (T2 step 2).
- **Sécurité:** défense en profondeur — RPC rejettent non-admins côté base ; UI cache le bouton et désactive l'auto-retrait.
- **Migration:** `supabase/2026-07-02-admin-rpcs.sql`, exécutée par l'utilisateur.
- **Branch:** `boussole-redesign`.
```
