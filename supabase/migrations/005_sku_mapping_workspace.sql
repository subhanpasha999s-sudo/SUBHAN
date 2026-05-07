-- Persistent SKU import listing set per user (mappings stay in master_skus + sku_map).
create table if not exists public.sku_mapping_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null default gen_random_uuid(),
  file_name text not null default '',
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  listing_skus jsonb not null default '[]'::jsonb,
  column_used text,
  scanned_rows integer not null default 0,
  revision integer not null default 1
);

create index if not exists sku_mapping_workspace_updated_at_idx
  on public.sku_mapping_workspace (updated_at desc);

alter table public.sku_mapping_workspace enable row level security;

create policy "sku_mapping_workspace_select_own"
  on public.sku_mapping_workspace for select
  using (auth.uid () = user_id);

create policy "sku_mapping_workspace_insert_own"
  on public.sku_mapping_workspace for insert
  with check (auth.uid () = user_id);

create policy "sku_mapping_workspace_update_own"
  on public.sku_mapping_workspace for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create policy "sku_mapping_workspace_delete_own"
  on public.sku_mapping_workspace for delete
  using (auth.uid () = user_id);
