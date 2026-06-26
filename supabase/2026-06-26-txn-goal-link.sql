-- Pont Épargne ↔ Objectifs (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.transactions
  add column if not exists goal_id uuid references public.goals(id) on delete set null;
