-- Gestion des catégories : colonne d'archivage + policies RLS d'écriture.
-- À exécuter une fois dans Supabase > SQL Editor.
alter table public.categories add column if not exists active boolean not null default true;

alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
create policy "categories_per_user" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
