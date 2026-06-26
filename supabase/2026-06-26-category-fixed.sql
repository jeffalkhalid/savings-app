-- Charges fixes (Boussole). À exécuter dans Supabase SQL editor.
alter table public.categories add column if not exists is_fixed boolean not null default false;
