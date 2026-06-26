-- Allocation cible (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.allocation_targets (
  user_id uuid not null references auth.users(id),
  asset_type text not null,
  target_pct numeric not null,
  primary key (user_id, asset_type)
);

alter table public.allocation_targets enable row level security;

create policy "allocation_targets_per_user" on public.allocation_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
