-- Phase 1 (upgrade spec): period locking + COA hygiene, enforced in the DB.
--
-- 1. Posting into a CLOSED accounting period is rejected by trigger, so the
--    lock holds for every write path (RPC, PostgREST, SQL).
-- 2. post_journal_entry refuses archived accounts.
-- 3. System accounts cannot be archived (the ledger's control accounts).

-- ── 1. Closed-period enforcement ──────────────────────────────────────
create or replace function public.enforce_open_period()
returns trigger language plpgsql as $$
declare v_period record;
begin
  select id, name into v_period
    from public.accounting_periods
    where org_id = new.org_id
      and status = 'closed'
      and new.entry_date between start_date and end_date
    limit 1;
  if v_period.id is not null then
    raise exception 'period % is closed — reopen it or use a different entry date', v_period.name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_open_period on public.journal_entries;
create trigger trg_enforce_open_period
  before insert or update of entry_date, org_id on public.journal_entries
  for each row execute function public.enforce_open_period();

-- ── 2. Archived accounts refuse new lines (RPC path) ─────────────────
create or replace function public.post_journal_entry(
  p_org         uuid,
  p_entry_date  date,
  p_source_type public.gl_source_type,
  p_lines       jsonb,
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
      where org_id = p_org and code = (v_line->>'account_code') and not archived;
    if v_acct is null then
      raise exception 'unknown or archived account code % for org %', v_line->>'account_code', p_org;
    end if;
    insert into public.journal_lines (entry_id, org_id, account_id, debit, credit, memo)
      values (v_entry, p_org, v_acct, v_debit, v_credit, v_line->>'memo');
    v_sum_d := v_sum_d + v_debit;
    v_sum_c := v_sum_c + v_credit;
  end loop;

  if round(v_sum_d, 2) <> round(v_sum_c, 2) then
    raise exception 'unbalanced entry: debit % <> credit %', v_sum_d, v_sum_c;
  end if;

  return v_entry;
end;
$$;

-- ── 3. System accounts cannot be archived ─────────────────────────────
create or replace function public.protect_system_accounts()
returns trigger language plpgsql as $$
begin
  if old.is_system and new.archived then
    raise exception 'system account % (%) cannot be archived', old.code, old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_system_accounts on public.accounts;
create trigger trg_protect_system_accounts
  before update of archived on public.accounts
  for each row execute function public.protect_system_accounts();
