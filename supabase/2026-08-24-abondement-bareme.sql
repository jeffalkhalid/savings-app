-- Barème d'abondement employeur par utilisateur. À exécuter dans Supabase SQL editor.
-- NULL = barème Carrefour par défaut (aucune donnée = aucun changement de comportement).
alter table public.user_settings
  add column if not exists abondement_bareme jsonb;
