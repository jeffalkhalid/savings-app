-- Multi-devises (Boussole Phase 2). À exécuter dans Supabase SQL editor.
alter table public.assets add column if not exists currency text not null default 'EUR';
