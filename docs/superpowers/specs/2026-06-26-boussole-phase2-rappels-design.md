# Boussole Phase 2 — Rappels

**Date** : 2026-06-26
**Branche** : `boussole-redesign`
**Roadmap parente** : `docs/superpowers/specs/2026-06-25-boussole-redesign-roadmap.md`
**Périmètre** : pense-bêtes ponctuels (label, échéance, montant optionnel, fait). Cloche + badge dans l'en-tête Cockpit ; modale liste + modale ajout/édition. Table `reminders` (RLS).

## Décisions validées

- **Rappels ponctuels** (échéance unique, action « Fait »). Les charges récurrentes restent gérées par `recurring` (charges fixes) — concept distinct.
- **Badge cloche = en retard + aujourd'hui** : rappels non faits dont `due_date <= today`. Les futurs sont dans la liste sans gonfler le badge.
- Montant **optionnel**. Icônes lucide ; modales au motif `AssetModal`.

## Données & sécurité

Migration `supabase/2026-06-26-reminders.sql` (exécutée manuellement) :
```sql
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  label text not null,
  due_date date not null,
  amount numeric,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reminders enable row level security;
create policy "reminders_per_user" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Module pur (testé) — `lib/cockpit/reminders.ts`

```ts
export type Reminder = {
  id: string;
  label: string;
  due_date: string;   // YYYY-MM-DD
  amount?: number | null;
  done: boolean;
  created_at?: string;
};
export type ReminderStatus = "overdue" | "today" | "upcoming" | "done";

export function isDue(r: Reminder, todayISO: string): boolean;
export function dueCount(reminders: Reminder[], todayISO: string): number;
export function activeReminders(reminders: Reminder[]): Reminder[];
export function reminderStatus(r: Reminder, todayISO: string): ReminderStatus;
export function dueLabel(dueDate: string, todayISO: string): string;
```
- `isDue` : `!r.done && r.due_date <= todayISO` (comparaison de chaînes ISO).
- `dueCount` : nombre de `isDue`.
- `activeReminders` : `done === false`, triés par `due_date` croissant.
- `reminderStatus` : `done` → `"done"` ; sinon par `daysBetween(today, due)` : `< 0` → `"overdue"`, `=== 0` → `"today"`, `> 0` → `"upcoming"`.
- `dueLabel` : `< 0` → « en retard » ; `=== 0` → « aujourd'hui » ; `> 0` → « dans N j ». `daysBetween` via `Date.UTC` (pas de `Date.now`).

**Tests** : `isDue` (passé/aujourd'hui dus, futur non, done jamais) ; `dueCount` ; `activeReminders` (exclut done, trie) ; `reminderStatus` (4 cas) ; `dueLabel` (« en retard »/« aujourd'hui »/« dans 3 j »).

## API + hook

### `lib/cockpit/reminders-api.ts`
```ts
export type ReminderFields = { label: string; dueDate: string; amount: number | null };
export async function createReminder(userId: string, f: ReminderFields): Promise<void>;
export async function updateReminder(id: string, f: ReminderFields): Promise<void>;
export async function deleteReminder(id: string): Promise<void>;
export async function setReminderDone(id: string, done: boolean): Promise<void>;
```
- `createReminder` : insert `{ user_id, label, due_date, amount, done: false }`.
- `updateReminder` : update `{ label, due_date, amount }`.
- `setReminderDone` : update `{ done }`.
- Erreurs Supabase → `throw new Error(error.message)`.

### `useReminders()` (dans `hooks.ts`)
Calqué sur `useGoals` : `select id,label,due_date,amount,done,created_at` `order("due_date")` → `{ reminders, loading, error, refetch }`.

## UI

- **En-tête Cockpit** (`app/cockpit/page.tsx`) : bouton **cloche** (lucide `Bell`) **avant le gear**, avec **badge** (`dueCount(reminders, today)`) si > 0 (pastille `accent`, texte `#FBF3EC`). Ouvre `showReminders`.
- **`RemindersModal`** (`components/cockpit/RemindersModal.tsx`) : liste `activeReminders` ; chaque ligne : pastille/icône `Bell` colorée selon `reminderStatus` (`overdue` → `text-accent`, `today` → `text-gold`, `upcoming` → `text-ink-muted`), `label`, sous-ligne `dueLabel` (+ `eur(amount)` si présent), bouton **Fait** (`onToggleDone`), tap ligne → `onEdit`. Bouton pointillé « + Ajouter un rappel » (`onAdd`). État vide (icône `Bell`, « Aucun rappel »).
- **`ReminderModal`** (`components/cockpit/ReminderModal.tsx`, motif `AssetModal`) : `label`, `due_date` (input date, défaut `todayISO()`), montant optionnel ; Enregistrer (`createReminder`/`updateReminder`) ; en édition : Supprimer (`deleteReminder`).
- **Page** : `useReminders` ; états `showReminders: boolean` + `reminderForm: Reminder | "new" | null` ; cloche → `setShowReminders(true)` ; depuis la liste, `onAdd` → `setReminderForm("new")`, `onEdit(r)` → `setReminderForm(r)`, `onToggleDone(r)` → `setReminderDone(r.id, !r.done)` + refetch.

## États & erreurs

- Aucun rappel : pas de badge ; liste vide → état vide + bouton d'ajout.
- Marquer « Fait » : disparaît de la liste active et du badge (réversible en ré-éditant — un rappel `done` n'apparaît plus ; pas de vue archivée en v1).
- Erreur Supabase (create/update/delete/done) : message visible dans la modale concernée.
- `label` vide ou `due_date` absente : message de validation, pas d'enregistrement.

## Hors périmètre

- Récurrence (couverte par `recurring`/charges fixes).
- Notifications push / e-mail.
- Vue des rappels terminés (archive) — `done` masque simplement le rappel.
- Génération auto de rappels depuis les charges fixes.

## Critères de succès

- La cloche affiche le bon compteur (en retard + aujourd'hui) ; ouvre la liste triée par échéance.
- Créer un rappel (label, échéance, montant optionnel) ; « Fait » le retire de la liste/badge ; éditer/supprimer.
- Couleur de statut correcte (retard/aujourd'hui/futur) ; lisible clair + sombre.
- RLS : chaque user ne voit que ses rappels. `npm run test` vert (incl. `reminders`) ; `npx tsc --noEmit` clean ; `npm run build` OK.
- L'utilisateur a exécuté `supabase/2026-06-26-reminders.sql`.
