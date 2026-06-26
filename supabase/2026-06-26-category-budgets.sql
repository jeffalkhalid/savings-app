-- Budgets par catégorie (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.categories add column if not exists monthly_budget numeric;
