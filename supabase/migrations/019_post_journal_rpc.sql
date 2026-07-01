-- Tulmin Book — Phase 1: transactional posting RPCs.
--
-- The client posts via the browser Supabase client (RLS-scoped). A journal
-- entry is header + N lines and must be inserted in ONE transaction so the
-- deferred balanced-entry trigger sees the whole entry. PostgREST runs each
-- table write as its own transaction, so posting must go through a function.

-- ── ensure_org(): get-or-create the caller's organization ─────────────
-- SECURITY DEFINER so it can create the org + rely on the bootstrap trigger
-- (which seeds the COA and adds the caller as owner). Auto-create-one-org-
-- per-signed-in-user, per the Phase 1 integration decision.
create or replace function public.ensure_org(p_name text default 'My Business')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select m.org_id into v_org
    from public.organization_members m
    where m.user_id = auth.uid()
    order by m.created_at
    limit 1;
  if v_org is not null then
    return v_org;
  end if;
  insert into public.organizations (name, created_by)
    values (coalesce(nullif(p_name, ''), 'My Business'), auth.uid())
    returning id into v_org;   -- trg_bootstrap_organization seeds COA + owner
  return v_org;
end;
$$;

grant execute on function public.ensure_org(text) to authenticated;

-- ── post_journal_entry(): insert a balanced entry atomically ──────────
-- SECURITY INVOKER: runs as the caller so RLS (org membership) governs writes.
-- Idempotent on (org_id, external_id): re-posting the same external_id returns
-- the existing entry unchanged — safe to re-run the derived-GL port.
create or replace function public.post_journal_entry(
  p_org         uuid,
  p_entry_date  date,
  p_source_type public.gl_source_type,
  p_lines       jsonb,          -- [{ account_code, debit, credit, memo }]
  p_memo        text default null,
  p_source_id   text default null,
  p_external_id text default null
)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_entry  uuid;
  v_line   jsonb;
  v_acct   uuid;
  v_debit  numeric(14,2);
  v_credit numeric(14,2);
  v_sum_d  numeric(14,2) := 0;
  v_sum_c  numeric(14,2) := 0;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member of org %', p_org;
  end if;

  -- idempotency
  if p_external_id is not null then
    select id into v_entry from public.journal_entries
      where org_id = p_org and external_id = p_external_id;
    if v_entry is not null then
      return v_entry;
    end if;
  end if;

  insert into public.journal_entries
    (org_id, entry_date, memo, source_type, source_id, external_id, created_by)
    values (p_org, p_entry_date, p_memo, p_source_type, p_source_id, p_external_id, auth.uid())
    returning id into v_entry;

  for v_line in select value from jsonb_array_elements(p_lines) as t(value)
  loop
    v_debit  := round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_line->>'credit')::numeric, 0), 2);
    select id into v_acct from public.accounts
      where org_id = p_org and code = (v_line->>'account_code');
    if v_acct is null then
      raise exception 'unknown account code % for org %', v_line->>'account_code', p_org;
    end if;
    insert into public.journal_lines (entry_id, org_id, account_id, debit, credit, memo)
      values (v_entry, p_org, v_acct, v_debit, v_credit, v_line->>'memo');
    v_sum_d := v_sum_d + v_debit;
    v_sum_c := v_sum_c + v_credit;
  end loop;

  -- fail fast with a clear message (the deferred trigger also enforces this)
  if round(v_sum_d, 2) <> round(v_sum_c, 2) then
    raise exception 'unbalanced entry: debit % <> credit %', v_sum_d, v_sum_c;
  end if;

  return v_entry;
end;
$$;

grant execute on function
  public.post_journal_entry(uuid, date, public.gl_source_type, jsonb, text, text, text)
  to authenticated;
