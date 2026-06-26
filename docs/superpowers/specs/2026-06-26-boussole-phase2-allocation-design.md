# Boussole Phase 2 — Allocation cible

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : définir une **allocation cible** en % par type d'actif et la comparer à la **répartition réelle** du patrimoine (barre réelle + repère cible + delta), sur l'écran Patrimoine. Table `allocation_targets` (RLS).

## Décisions validées

- Cibles **informatives** : on affiche la somme des cibles et on signale si ≠ 100 %, **sans bloquer** l'enregistrement.
- Types d'actifs = ensemble connu **`stock`, `savings`, `cash`, `commodity`** (mêmes que `AssetModal`/`typeLabel`).
- Réel via `withShares(lines)` (déjà existant) ; `target_pct ≤ 0` = pas de cible.

## Données & sécurité

`supabase/2026-06-26-allocation-targets.sql` (exécutée manuellement) :
```sql
create table if not exists public.allocation_targets (
  user_id uuid not null references auth.users(id),
  asset_type text not null,
  target_pct numeric not null,
  primary key (user_id, asset_type)
);
alter table public.allocation_targets enable row level security;
create policy "allocation_targets_per_user" on public.allocation_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Module pur (testé) — `lib/cockpit/allocation.ts`

```ts
import type { PatrimoineLine } from "./patrimoine";

export const ALLOCATION_TYPES: string[]; // ["stock","savings","cash","commodity"]

export type AllocationRow = {
  type: string;
  realPct: number;          // 0..100
  targetPct: number | null; // null si pas de cible
  delta: number | null;     // realPct - targetPct, null si pas de cible
};

export function allocationRows(
  lines: PatrimoineLine[],
  targets: Record<string, number>
): AllocationRow[];

export function targetsTotal(targets: Record<string, number>): number;
```
- `allocationRows` : calcule le total réel (`Σ total_value`) ; pour chaque type de l'**union** (types avec avoirs réels ∪ types avec cible > 0), `realPct = total>0 ? value/total*100 : 0`, `targetPct = targets[type] > 0 ? targets[type] : null`, `delta = targetPct != null ? realPct − targetPct : null`. Trié par `realPct` décroissant puis `targetPct`.
- `targetsTotal` : somme des cibles `> 0`.

**Tests** : realPct depuis lines ; type avec cible mais sans avoir (realPct 0, delta négatif) ; type avec avoir sans cible (targetPct/delta null) ; `delta = réel − cible` ; `targetsTotal` ; total réel 0 → realPct 0 sans division par zéro.

## API + hook

### `lib/cockpit/allocation-api.ts`
```ts
export async function getAllocationTargets(userId: string): Promise<Record<string, number>>;
export async function saveAllocationTargets(
  userId: string,
  targets: Record<string, number>
): Promise<void>;
```
- `getAllocationTargets` : select `asset_type,target_pct` → map ; erreur → throw.
- `saveAllocationTargets` : `upsert` une ligne par type (`{ user_id, asset_type, target_pct }`, `onConflict: "user_id,asset_type"`). Une valeur `0`/absente = pas de cible (stockée 0).

### `useAllocationTargets(userId)` (dans `hooks.ts`)
`getAllocationTargets` → `{ targets: Record<string, number>, refetch }` (map vide si rien).

## UI

- **Écran Patrimoine** (`app/cockpit/patrimoine/page.tsx`) : `useAllocationTargets(user.id)` ; `rows = allocationRows(lines, targets)` ; nouvelle section **`AllocationTargets`** sous `TypeBreakdown` ; état `showAlloc` ; `BudgetsModal`-like editor.
- **`AllocationTargets`** (`components/cockpit/patrimoine/AllocationTargets.tsx`) : titre « Allocation cible » + bouton **« Éditer »** (`onEdit`). Si aucune cible (`targetsTotal(targets) === 0`) → invite « Définis ton allocation cible » + bouton. Sinon, pour chaque `AllocationRow` : libellé `typeLabel(type)` ; à droite `réel%` + `cible%` (`—` si null) + **chip delta** (`+Δ`/`−Δ pts`, `text-ink-muted`) ; une **barre** : piste `bg-rule`, remplissage réel `bg-emerald` (`width realPct%`), **repère vertical** (trait `bg-ink`) positionné à `targetPct%` quand non null (dans un conteneur non rogné pour le repère).
- **`AllocationModal`** (`components/cockpit/patrimoine/AllocationModal.tsx`, motif `BudgetsModal`) : pour chaque `ALLOCATION_TYPES`, champ **%** (pré-rempli depuis `targets`) avec `typeLabel` ; affiche la **somme** courante (badge `text-accent` si ≠ 100, sinon `text-ink-muted`) ; Enregistrer → `saveAllocationTargets(user.id, valeurs)` (`onSaved` → refetch + close). Pas de blocage si ≠ 100.

## États & erreurs

- Aucune cible : section en mode invite ; pas de repères.
- Type avec cible mais sans avoir : barre réelle vide + repère à la cible (delta négatif).
- Somme ≠ 100 % : badge informatif, enregistrement autorisé.
- Champ % invalide (non numérique) : message dans la modale, pas d'enregistrement.
- Erreur Supabase (get/save) : message visible ; get en échec → cibles vides (pas de crash).

## Hors périmètre

- Rééquilibrage automatique / suggestions d'ordres.
- Cibles par actif individuel (on reste par type).
- Historique des cibles.

## Critères de succès

- Définir des cibles par type via la modale ; la section Patrimoine montre réel vs cible avec repère + delta ; la somme ≠ 100 % est signalée sans bloquer.
- Persistance ; chaque user ne voit que ses cibles (RLS).
- `npm run test` vert (incl. `allocation`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-allocation-targets.sql`.
