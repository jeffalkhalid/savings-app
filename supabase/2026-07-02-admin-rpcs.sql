-- 3b : RPC de gestion des admins (réservées aux admins). Réutilise is_admin() (3a).
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function public.list_admins()
returns table (user_id uuid, email text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  return query
    select a.user_id, u.email::text
    from public.admins a
    join auth.users u on u.id = a.user_id
    order by u.email;
end;
$$;

create or replace function public.add_admin_by_email(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Aucun utilisateur avec cet email'; end if;
  insert into public.admins (user_id) values (v_id) on conflict do nothing;
end;
$$;

create or replace function public.remove_admin(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux admins'; end if;
  if p_user_id = auth.uid() then raise exception 'Impossible de vous retirer vous-même'; end if;
  delete from public.admins where user_id = p_user_id;
end;
$$;

grant execute on function public.list_admins() to authenticated;
grant execute on function public.add_admin_by_email(text) to authenticated;
grant execute on function public.remove_admin(uuid) to authenticated;
