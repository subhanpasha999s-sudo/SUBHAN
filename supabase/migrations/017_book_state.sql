-- Tulmin Book: per-user application state.
-- Book's whole V2State is a single JSON blob, so we persist it as one row per
-- user (mirrors sku_mapping_workspace). RLS scopes every row to its owner.
create table if not exists public.book_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null default gen_random_uuid(),
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists book_state_updated_at_idx
  on public.book_state (updated_at desc);

alter table public.book_state enable row level security;

create policy "book_state_select_own"
  on public.book_state for select
  using (auth.uid () = user_id);

create policy "book_state_insert_own"
  on public.book_state for insert
  with check (auth.uid () = user_id);

create policy "book_state_update_own"
  on public.book_state for update
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create policy "book_state_delete_own"
  on public.book_state for delete
  using (auth.uid () = user_id);
