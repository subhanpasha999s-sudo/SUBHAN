-- Normalized master ↔ listing mapping (replaces single-table sku_mappings for new flows)
create extension if not exists "pgcrypto";

create table if not exists public.master_skus (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.sku_map (
  id uuid primary key default gen_random_uuid(),
  listing_sku text not null unique,
  master_sku_id uuid references public.master_skus (id) on delete set null,
  category text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sku_map_master_sku_id_idx on public.sku_map (master_sku_id);

alter table public.master_skus enable row level security;
alter table public.sku_map enable row level security;

create policy "Allow anon master_skus for development"
on public.master_skus
for all
using (true)
with check (true);

create policy "Allow anon sku_map for development"
on public.sku_map
for all
using (true)
with check (true);
