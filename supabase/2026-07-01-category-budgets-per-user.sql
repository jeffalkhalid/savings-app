-- Budgets par catégorie déplacés en par-utilisateur (prérequis catégories communes).
-- À exécuter une fois dans Supabase > SQL Editor.
create table if not exists public.category_budgets (
  user_id uuid not null references auth.users(id),
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_budget numeric not null,
  primary key (user_id, category_id)
);
alter table public.category_budgets enable row level security;
drop policy if exists "category_budgets_per_user" on public.category_budgets;
create policy "category_budgets_per_user" on public.category_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- reprise des budgets existants (par propriétaire)
insert into public.category_budgets (user_id, category_id, monthly_budget)
select user_id, id, monthly_budget
from public.categories
where monthly_budget is not null and user_id is not null
on conflict (user_id, category_id) do nothing;
