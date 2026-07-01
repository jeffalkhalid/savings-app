-- Ajoute deux catégories de dépense au compte existant (le seed initial ne
-- s'exécute que sur un compte à zéro catégorie, donc il faut les insérer ici).
-- Sans doublon si relancé. À exécuter une fois dans Supabase > SQL Editor.

insert into public.categories (user_id, name, type, color)
select u.id, v.name, 'expense', v.color
from auth.users u
cross join (values
  ('Famille et cadeaux', '#C75B39'),
  ('Autres',             '#6B6E76')
) as v(name, color)
where u.email = 'jeffalkhalid@gmail.com'
  and not exists (
    select 1 from public.categories c
    where c.user_id = u.id and c.name = v.name
  );
