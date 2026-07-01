-- Catégories communes + admin. À exécuter une fois dans Supabase > SQL Editor.
-- 1. user_id nullable (NULL = catégorie commune / partagée)
alter table public.categories alter column user_id drop not null;

-- 2. table des admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id)
);
alter table public.admins enable row level security;
drop policy if exists "admins_read_self" on public.admins;
create policy "admins_read_self" on public.admins for select using (auth.uid() = user_id);

-- 3. helper is_admin() (security definer pour lire admins sous RLS)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 4. RLS catégories : voir communes + les siennes ; écrire les siennes, ou communes si admin
alter table public.categories enable row level security;
drop policy if exists "categories_per_user" on public.categories;
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_write" on public.categories;
create policy "categories_select" on public.categories for select
  using (user_id is null or user_id = auth.uid());
create policy "categories_write" on public.categories for all
  using (user_id = auth.uid() or (user_id is null and public.is_admin()))
  with check (user_id = auth.uid() or (user_id is null and public.is_admin()));

-- 5. te seeder comme admin
insert into public.admins (user_id)
select id from auth.users where email = 'jeffalkhalid@gmail.com'
on conflict do nothing;

-- 6. promouvoir TES catégories en communes (même id → transactions/budgets préservés)
update public.categories
set user_id = null
where user_id = (select id from auth.users where email = 'jeffalkhalid@gmail.com');
