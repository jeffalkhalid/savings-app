-- Fix : "new row violates row-level security policy for table assets" à la
-- création d'un asset (Patrimoine). La RLS était activée sur assets /
-- asset_valuations mais sans policy d'écriture → SELECT passe (assets existants
-- visibles) mais INSERT/UPDATE/DELETE sont refusés.
-- Ajoute une policy par utilisateur (auth.uid() = user_id) couvrant toutes les
-- opérations. Idempotent. À exécuter une fois dans Supabase > SQL Editor.

alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;

drop policy if exists "assets_per_user" on public.assets;
create policy "assets_per_user" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_valuations_per_user" on public.asset_valuations;
create policy "asset_valuations_per_user" on public.asset_valuations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
