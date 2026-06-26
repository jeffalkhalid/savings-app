-- Réglages utilisateur (Boussole Phase 2). À exécuter dans Supabase SQL editor.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id),
  savings_rate_goal numeric not null default 0.20,
  reporting_currency text not null default 'EUR',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_per_user" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
