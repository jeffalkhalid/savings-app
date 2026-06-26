# Boussole Phase 2 — Pont Épargne ↔ Objectifs

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : relier l'argent réellement épargné aux objectifs. Une opération de type **savings** peut être affectée à un **objectif** (`transactions.goal_id`). La progression d'un objectif = base manuelle (`current_amount`) + somme des opérations d'épargne affectées (toutes périodes). L'épargne **sans objectif** reste possible.

## Décisions validées

- Lien optionnel **opération d'épargne → objectif** via `transactions.goal_id` (nullable). Type ≠ savings → toujours `null`.
- **Épargne libre** : option « Aucun (épargne libre) » dans le sélecteur → `goal_id` nul ; l'opération compte dans la tuile Épargne mais ne pousse aucun objectif.
- Progression objectif = `current_amount` (ajustement manuel, ex. argent hors-app) **+** Σ `abs(amount)` des opérations savings affectées.
- Affectation depuis **`TxnModal`** quand la catégorie choisie est de type épargne. `ContributeModal` reste l'ajustement manuel.

## Données & sécurité

`supabase/2026-06-26-txn-goal-link.sql` (exécutée manuellement) :
```sql
alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;
```
RLS déjà active sur `transactions`. `on delete set null` : supprimer un objectif délie ses opérations sans les effacer.

## Module pur (testé) — `lib/cockpit/goals.ts` (ajout)

```ts
export function applyContributions(
  goals: Goal[],
  contribByGoal: Record<string, number>
): Goal[];
```
- Renvoie chaque objectif avec `current_amount = Number(current_amount) + (contribByGoal[id] ?? 0)`. Les fonctions existantes (`goalProgress`, `goalsSummary`) opèrent ensuite sur ces objectifs « effectifs », inchangées.

**Tests** : base 100 + contrib 50 → 150 ; objectif sans contribution inchangé ; plusieurs objectifs ; map vide → inchangé.

## API + hooks

- **`Txn`** (`types.ts`) += `goal_id?: string | null`.
- **`TxnFields`** (`transactions-api.ts`) += `goalId?: string | null` (optionnel → rétro-compatible). `row()` mappe :
  ```ts
  goal_id: f.categoryType === "savings" ? (f.goalId ?? null) : null,
  ```
  (les autres constructeurs de `TxnFields` — reclassify, `classifyAllTransfers` — n'ont pas à changer ; `goal_id` devient `null` automatiquement.)
- **`useGoalContributions()`** (`hooks.ts`) : lit `goal_id,amount` des opérations `type=savings` avec `goal_id` non nul, somme `abs(amount)` par objectif → `{ contribByGoal: Record<string, number>, refetch }`.

## UI

- **`TxnModal`** : nouvelle prop `goals: Goal[]`. État `goalId` (init `txn?.goal_id ?? ""`). Quand la catégorie sélectionnée est de **type savings**, afficher un select **« Objectif (optionnel) »** : option vide « Aucun (épargne libre) » + les objectifs. À l'enregistrement, `fields.goalId = (cat.type === "savings" && goalId) ? goalId : null`. (Le champ n'apparaît pas pour les autres types.)
- **Page Objectifs** (`app/cockpit/objectifs/page.tsx`) : `useGoals` + `useGoalContributions` → `effGoals = applyContributions(goals, contribByGoal)` ; l'anneau (`goalsSummary(effGoals)`) et les `GoalCard` (objectifs effectifs) affichent la **progression réelle**. `GoalCard`/`GoalRing` inchangés (reçoivent les objectifs effectifs).
- **Page Cockpit** (`app/cockpit/page.tsx`) : `const { goals } = useGoals();` ; passe `goals` aux deux `TxnModal` (ajout + édition).

## Flux

1. J'ajoute/édite une opération d'épargne (ex. −200 € vers PEA) et choisis l'objectif « Apport immo » → `goal_id` posé.
2. La tuile Épargne du Cockpit compte les 200 € (inchangé).
3. Sur Objectifs, « Apport immo » progresse de 200 € (base + versements), sans double saisie.
4. Une épargne « Aucun » compte dans Épargne mais ne touche aucun objectif.

## États & erreurs

- Catégorie non-épargne : pas de sélecteur d'objectif ; `goal_id` forcé `null`.
- Objectif supprimé : les opérations liées repassent `goal_id` nul (`on delete set null`) → reviennent en épargne libre.
- Édition d'une épargne déjà liée : l'objectif est pré-sélectionné, persiste si inchangé.
- Aucune dépendance bloquante : si `useGoals` est vide, le select ne montre que « Aucun ».

## Hors périmètre

- Affectation d'objectif à l'import BNP (l'import reste « épargne libre » ; on relie ensuite via l'édition).
- Retrait/objectif négatif, jalons, multi-objectifs par opération.
- Refonte de `ContributeModal` (conservé comme ajustement manuel).

## Critères de succès

- Affecter une opération d'épargne à un objectif fait progresser cet objectif (anneau + carte) du montant réel ; sans double saisie.
- L'épargne « Aucun » reste possible et n'affecte aucun objectif.
- Supprimer un objectif ne perd pas les opérations.
- `npm run test` vert (incl. `applyContributions`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-txn-goal-link.sql`.
