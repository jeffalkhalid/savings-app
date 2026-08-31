-- Rattachement du salaire au mois suivant, par utilisateur.
-- À exécuter dans Supabase SQL editor.
-- NULL = aucun rattachement (comportement historique inchangé).
alter table public.user_settings
  add column if not exists salary_shift jsonb;
