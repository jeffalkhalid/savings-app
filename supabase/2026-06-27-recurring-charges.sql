-- Engagements récurrents (Boussole). À exécuter dans Supabase SQL editor.
create table if not exists public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  label text not null,
  expected_amount numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, payee_key)
);
alter table public.recurring_charges enable row level security;
create policy "recurring_charges_per_user" on public.recurring_charges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
