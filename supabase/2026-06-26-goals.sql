-- Objectifs d'épargne (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.goals (
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
