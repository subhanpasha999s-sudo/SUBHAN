-- Remove legacy flat mapping table; app uses master_skus + sku_map only.

drop policy if exists "Allow anon sku_mappings for development" on public.sku_mappings;

drop table if exists public.sku_mappings;
