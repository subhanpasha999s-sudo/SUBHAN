-- Staff access: real logins for team members.
--
-- Flow: the owner generates an invite code (role-scoped). A staff member signs
-- in with their OWN account and redeems the code → they become an
-- organization_member and gain RLS access to the owner's Book workspace
-- (book_state row). Their role comes from organization_members, enforced by
-- the app's guard() on every action.

-- ── 1. Link the Book workspace blob to an organization ────────────────
alter table public.book_state
  add column if not exists org_id uuid references public.organizations (id);

create index if not exists book_state_org_idx on public.book_state (org_id);

-- Members of the org may read AND update the shared workspace row.
-- (Policies are permissive → these OR with the existing own-row policies.)
create policy "book_state_select_org_member"
  on public.book_state for select
  using (org_id is not null and public.is_org_member(org_id));

create policy "book_state_update_org_member"
  on public.book_state for update
  using (org_id is not null and public.is_org_member(org_id))
  with check (org_id is not null and public.is_org_member(org_id));

-- ── 2. Track the member's email for display (filled on join) ──────────
alter table public.organization_members
  add column if not exists email text;

-- ── 3. Invites ─────────────────────────────────────────────────────────
create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  code       text not null unique,
  role       public.org_role not null default 'viewer',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by    uuid references auth.users (id),
  used_at    timestamptz
);

alter table public.org_invites enable row level security;

-- Owners/managers create + see their org's invites.
create policy org_invites_select on public.org_invites
  for select using (public.has_org_role(org_id, array['owner','manager']::public.org_role[]));
create policy org_invites_insert on public.org_invites
  for insert with check (
    public.has_org_role(org_id, array['owner','manager']::public.org_role[])
    and role <> 'owner'  -- an invite can never grant ownership
  );
create policy org_invites_delete on public.org_invites
  for delete using (public.has_org_role(org_id, array['owner','manager']::public.org_role[]));

-- ── 4. Redeem an invite (SECURITY DEFINER — the joiner isn't a member yet) ──
create or replace function public.accept_org_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite record;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'sign in first, then redeem the invite code';
  end if;
  select * into v_invite from public.org_invites
    where code = p_code and used_at is null and expires_at > now()
    for update;
  if v_invite.id is null then
    raise exception 'invalid, used, or expired invite code';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.organization_members (org_id, user_id, role, email)
    values (v_invite.org_id, auth.uid(), v_invite.role, v_email)
    on conflict (org_id, user_id) do update set role = excluded.role, email = excluded.email;
  update public.org_invites set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  return v_invite.org_id;
end;
$$;

grant execute on function public.accept_org_invite(text) to authenticated;
