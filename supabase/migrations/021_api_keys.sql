-- Phase 10 (upgrade spec §5.10): API keys for the public REST API.
--
-- Only the SHA-256 hash is stored; the plaintext is shown to the user once.
-- Keys are org-scoped. The REST API (server routes) verifies a bearer token by
-- hashing it and looking up a live key, then scopes every query to that org.

create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  key_prefix  text not null,             -- display only, e.g. "tul_live_ab12cd34"
  key_hash    text not null unique,      -- SHA-256 hex of the plaintext key
  scopes      text[] not null default array['read']::text[],  -- 'read' | 'write'
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

create index if not exists api_keys_org_idx on public.api_keys (org_id);
create index if not exists api_keys_hash_idx on public.api_keys (key_hash) where revoked_at is null;

alter table public.api_keys enable row level security;

-- Org members manage their org's keys through the app (RLS). The REST API does
-- NOT use these policies — it authenticates with the service role and resolves
-- the org from the key hash itself.
create policy api_keys_select on public.api_keys
  for select using (public.is_org_member(org_id));
create policy api_keys_write on public.api_keys
  for all using (public.has_org_role(org_id, array['owner','manager']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner','manager']::public.org_role[]));
