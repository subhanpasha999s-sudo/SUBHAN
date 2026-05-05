-- Per-user isolation for SKU mapping (production RLS)

drop policy if exists "Allow anon master_skus for development" on public.master_skus;
drop policy if exists "Allow anon sku_map for development" on public.sku_map;

alter table public.master_skus add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.sku_map add column if not exists user_id uuid references auth.users (id) on delete cascade;

delete from public.sku_map;
delete from public.master_skus;

alter table public.master_skus drop constraint if exists master_skus_name_key;
alter table public.sku_map drop constraint if exists sku_map_listing_sku_key;

alter table public.master_skus alter column user_id set not null;
alter table public.sku_map alter column user_id set not null;

create unique index if not exists master_skus_user_id_name_uidx on public.master_skus (user_id, name);
create unique index if not exists sku_map_user_id_listing_sku_uidx on public.sku_map (user_id, listing_sku);

create policy "master_skus_select_own"
on public.master_skus for select
using (auth.uid() = user_id);

create policy "master_skus_insert_own"
on public.master_skus for insert
with check (auth.uid() = user_id);

create policy "master_skus_update_own"
on public.master_skus for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "master_skus_delete_own"
on public.master_skus for delete
using (auth.uid() = user_id);

create policy "sku_map_select_own"
on public.sku_map for select
using (auth.uid() = user_id);

create policy "sku_map_insert_own"
on public.sku_map for insert
with check (auth.uid() = user_id);

create policy "sku_map_update_own"
on public.sku_map for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "sku_map_delete_own"
on public.sku_map for delete
using (auth.uid() = user_id);
