-- SKU master mapping storage (adjust RLS for production / multi-tenant use)
create extension if not exists "pgcrypto";

create table if not exists public.sku_mappings (
  id uuid primary key default gen_random_uuid(),
  meesho_sku text not null unique,
  master_sku text not null,
  category text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.sku_mappings enable row level security;

create policy "Allow anon sku_mappings for development"
on public.sku_mappings
for all
using (true)
with check (true);
