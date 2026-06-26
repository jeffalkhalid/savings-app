# Boussole Phase 2 — Objectifs (épargne par objectif)

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : nouvel écran **Objectifs** (4ᵉ onglet) — épargner vers des objectifs nommés avec cible, montant courant, échéance optionnelle, et action « Contribuer ». Nouvelle table `goals` (RLS).

## Décisions validées

- **Montant courant simple** : champ `current_amount` sur l'objectif ; « Contribuer » l'augmente ; modifiable. Pas d'historique de versements (YAGNI).
- **Échéance optionnelle** (`deadline`) → si présente, afficher « reste N mois » et un **rythme conseillé** (reste ÷ mois restants).
- Objectifs **autonomes** (non liés aux comptes/assets pour l'instant).
- Icônes **lucide** (jamais d'emoji) ; montants en `.font-mono-num` ; titres `.font-display`.
- Modales calquées sur `AssetModal` (héritent de la palette) ; pas de nouvelle primitive Sheet.

## Données & sécurité

Migration SQL (l'utilisateur l'exécute dans Supabase, comme `supabase/2026-06-19-rls-views.sql`) — fichier `supabase/2026-06-26-goals.sql` :

```sql
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  icon text not null default 'target',
  target_amount numeric not null,
  current_amount numeric not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);
alter table public.goals enable row level security;
create policy "goals_per_user" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Modules purs (testés)

### `lib/cockpit/goals.ts`
```ts
export type Goal = {
  id: string;
  name: string;
  icon: string;
  target_amount: number;
  current_amount: number;
  deadline?: string | null; // YYYY-MM-DD
  created_at?: string;
};

export function goalProgress(goal: Goal): { pct: number; remaining: number; done: boolean };
export function monthsLeft(deadline: string | null | undefined, todayISO: string): number | null;
export function suggestedMonthly(goal: Goal, todayISO: string): number | null;
export function goalsSummary(goals: Goal[]): { totalCurrent: number; totalTarget: number; pct: number };
```
- `goalProgress` : `pct = target>0 ? clamp(current/target,0,1) : 0` ; `remaining = max(0, target−current)` ; `done = target>0 && current>=target`.
- `monthsLeft` : `null` si pas de `deadline` ou `deadline <= todayISO` ; sinon `months = (dy−ty)*12 + (dm−tm)`, `−1` si le jour cible < jour courant, puis `max(1, months)`.
- `suggestedMonthly` : `null` si `done` ou `monthsLeft` null ; sinon `remaining / monthsLeft`.
- `goalsSummary` : sommes ; `pct = totalTarget>0 ? clamp(totalCurrent/totalTarget) : 0`.

**Tests** : pct plafonné à 1 quand current>target ; remaining jamais négatif ; done ; monthsLeft (échéance dans 6 mois → 6 ; passée → null ; absente → null ; même mois futur → 1) ; suggestedMonthly (=remaining/mois ; null si atteint/sans échéance) ; goalsSummary (sommes + pct, liste vide → 0).

### `lib/cockpit/goal-icon.ts`
```ts
import type { LucideIcon } from "lucide-react";
export const GOAL_ICONS: string[]; // clés sélectionnables (picker)
export function goalIcon(key: string): LucideIcon;
```
- Clés → lucide : `target→Target, home→Home, car→Car, plane→Plane, graduation→GraduationCap, gift→Gift, heart→Heart, piggy→PiggyBank, shield→Shield, umbrella→Umbrella, baby→Baby, phone→Smartphone` ; défaut `Target`.

**Tests** : `goalIcon("home") === Home` ; inconnu → `Target` ; `GOAL_ICONS` non vide et toutes les clés résolvent vers un composant.

## API + hook

### `lib/cockpit/goals-api.ts`
```ts
export type GoalFields = {
  name: string;
  icon: string;
  targetAmount: number;
  deadline: string | null;
};
export async function createGoal(userId: string, f: GoalFields): Promise<void>;
export async function updateGoal(id: string, f: GoalFields): Promise<void>;
export async function deleteGoal(id: string): Promise<void>;
export async function contributeToGoal(id: string, newCurrent: number): Promise<void>;
```
- `createGoal` : insert `{ user_id, name, icon, target_amount: targetAmount, current_amount: 0, deadline }`.
- `updateGoal` : update `{ name, icon, target_amount, deadline }` (ne touche pas `current_amount`).
- `contributeToGoal` : update `{ current_amount: newCurrent }`.
- Erreurs Supabase → `throw new Error(error.message)`.

### `useGoals()` (dans `lib/cockpit/hooks.ts`)
Calqué sur `useAssets` : `select id,name,icon,target_amount,current_amount,deadline,created_at` `order("created_at")` → `{ goals, loading, error, refetch }`.

## UI

- **Nav** (`components/cockpit/TabBar.tsx`) : ajouter le 4ᵉ onglet `{ href: "/cockpit/objectifs", label: "Objectifs", Icon: Target }` (lucide).
- **`GoalRing`** (`components/cockpit/goals/GoalRing.tsx`) : anneau SVG (cercle de progression `goalsSummary.pct`, couleur `#3E7D5A`) au centre `%` global, dessous `totalCurrent / totalTarget` (`.font-mono-num`).
- **`GoalCard`** (`components/cockpit/goals/GoalCard.tsx`) : tuile `bg-tile` `<Icon=goalIcon(icon) />`, nom, ligne `current / target` (`.font-mono-num`), barre de progression (`bg-rule` piste, `bg-emerald` remplissage), `%`, sous-ligne : `done` → « Atteint ✓ » ; sinon échéance → « reste N mois · {suggestedMonthly}/mois » ; sinon « reste {remaining} ». Bouton **Contribuer** (`onContribute`). Tap carte → `onEdit`.
- **Écran** (`app/cockpit/objectifs/page.tsx`) : `useGoals` ; `GoalRing` (depuis `goalsSummary`) ; liste de `GoalCard` ; bouton pointillé « + Ajouter un objectif » ; état vide soigné (icône `Target`, message). États `showCreate`, `editGoal: Goal | null`, `contribGoal: Goal | null`. `today = todayISO()`.
- **`GoalModal`** (`components/cockpit/goals/GoalModal.tsx`, calqué sur `AssetModal`) : champs nom, **picker d'icône** (grille de `GOAL_ICONS` rendues en lucide, sélection mise en évidence), montant cible, échéance (date, optionnelle). En édition : bouton Supprimer (`deleteGoal`). `onSaved` → refetch + close.
- **`ContributeModal`** (`components/cockpit/goals/ContributeModal.tsx`) : affiche l'objectif + champ montant à ajouter → `contributeToGoal(id, current_amount + montant)` ; `onSaved` → refetch + close.

## États & erreurs

- Aucun objectif : anneau à 0 % (ou masqué si `totalTarget===0`), liste vide → état vide + bouton d'ajout.
- `target_amount = 0` (sécurité) : `pct = 0`, pas de division par zéro ; `done = false`.
- Échéance passée ou absente : pas de « reste N mois » ni de rythme.
- Erreur Supabase (create/update/delete/contribute) : message visible dans la modale concernée.
- Contribution dépassant la cible : autorisée ; `pct` plafonné à 100 %, `done = true`.

## Hors périmètre

- Historique/courbe des versements (modèle simple retenu).
- Lien objectif ↔ compte/asset (alimentation automatique) — possible plus tard.
- Bottom-sheets dédiées (on réutilise le motif modale existant).
- Réglages/Budgets/Rappels/Allocation/multi-devises (autres features de Phase 2).

## Critères de succès

- Onglet **Objectifs** présent ; on crée un objectif (nom, icône lucide, cible, échéance optionnelle), on **Contribue**, la barre/anneau et le « reste N mois · rythme » se mettent à jour ; on édite et supprime.
- Tout en icônes lucide, montants alignés mono, lisible clair + sombre.
- RLS : un utilisateur ne voit que ses objectifs.
- `npm run test` vert (incl. `goals`, `goal-icon`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-goals.sql` avant le test live.
