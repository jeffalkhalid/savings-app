-- Rappels (Boussole Phase 2). À exécuter dans Supabase SQL editor.
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
