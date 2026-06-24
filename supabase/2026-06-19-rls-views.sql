-- Sécurise les vues d'agrégation : avec security_invoker, elles évaluent la RLS
-- des tables sous-jacentes avec le rôle de l'appelant (auth.uid() = user_id),
-- au lieu du rôle propriétaire. Sans ça, les vues exposent les lignes de tous
-- les utilisateurs. Postgres 15+ (Supabase). À exécuter une fois dans
-- Supabase > SQL Editor.

alter view public.v_patrimoine set (security_invoker = on);
alter view public.v_monthly_by_category set (security_invoker = on);
