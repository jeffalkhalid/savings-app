-- Règles de catégorisation par commerçant. À exécuter dans Supabase SQL editor.
create table if not exists public.category_rules (
  user_id uuid not null references auth.users(id),
  payee_key text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, payee_key)
);

alter table public.category_rules enable row level security;

drop policy if exists "category_rules_per_user" on public.category_rules;
create policy "category_rules_per_user" on public.category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Règles d'amorçage pour jeffalkhalid@gmail.com.
-- Les catégories sont résolues PAR NOM : un id codé en dur ne survivrait pas
-- d'une base à l'autre. Une règle dont la catégorie n'existe pas est ignorée.
insert into public.category_rules (user_id, payee_key, category_id)
select u.id, r.payee_key, c.id
from auth.users u
cross join (values
  ('carrefour banque',      'Courses alimentaires'),
  ('elior entretris',       'Restaurants & Sorties'),
  ('campus carrefou',       'Restaurants & Sorties'),
  ('campus carrefou massy', 'Restaurants & Sorties'),
  ('carrefour france',      'Salaire')
) as r(payee_key, category_name)
join public.categories c
  on c.name = r.category_name
 and (c.user_id is null or c.user_id = u.id)
where lower(u.email) = 'jeffalkhalid@gmail.com'
on conflict (user_id, payee_key) do nothing;
