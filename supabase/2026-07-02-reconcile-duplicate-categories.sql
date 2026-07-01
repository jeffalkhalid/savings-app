-- Réconciliation des catégories en doublon.
-- Un utilisateur inscrit AVANT la bascule en catégories communes a reçu ses
-- propres copies (seed par-personne) qui font désormais doublon avec les communes.
-- On re-pointe ses transactions + budgets vers la commune équivalente (même nom+type),
-- PUIS on supprime la copie perso. Rien n'est décatégorisé (re-point avant delete).
-- S'applique à TOUS les utilisateurs non-admin ; idempotent ; à exécuter une fois
-- dans Supabase > SQL Editor (le rôle SQL traverse la RLS).

-- 1. transactions : copie perso -> commune équivalente
update public.transactions t
set category_id = c.id
from public.categories p
join public.categories c
  on c.user_id is null
 and c.type = p.type
 and lower(c.name) = lower(p.name)
where p.user_id is not null
  and t.category_id = p.id;

-- 2. budgets : déplacer vers la commune (sauf si un budget existe déjà dessus)
update public.category_budgets b
set category_id = c.id
from public.categories p
join public.categories c
  on c.user_id is null
 and c.type = p.type
 and lower(c.name) = lower(p.name)
where p.user_id is not null
  and b.category_id = p.id
  and not exists (
    select 1 from public.category_budgets b2
    where b2.user_id = b.user_id and b2.category_id = c.id
  );

-- 3. supprimer les copies perso en doublon d'une commune
--    (les transactions sont déjà re-pointées ; les budgets résiduels tombent via on delete cascade)
delete from public.categories p
using public.categories c
where p.user_id is not null
  and c.user_id is null
  and c.type = p.type
  and lower(c.name) = lower(p.name);
