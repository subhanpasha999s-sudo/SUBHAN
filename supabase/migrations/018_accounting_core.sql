-- Tulmin Book — Phase 1: core double-entry ledger foundation.
--
-- Introduces per-ORG tenancy + a stored, immutable double-entry ledger.
-- Additive only: does not touch existing tables (book_state, sku_*, billing…).
-- The existing JSON-blob app keeps working; these tables are the new backing
-- store the strangler-fig migration posts into (see docs/ARCHITECTURE.md).
--
-- Design guarantees enforced in the DB (not just app code):
--   * every journal entry balances (Σ debit = Σ credit)              [trigger]
--   * posted entries are append-only (correct via reversal)          [trigger]
--   * every row is scoped to an organization via RLS                 [policies]

-- ─────────────────────────────────────────────────────────────────────
-- 1. Tenancy: organizations + members
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  gstin       text,
  state_code  text,                         -- GST state code, e.g. "09"
  base_currency text not null default 'INR',
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create type public.org_role as enum ('owner', 'manager', 'accountant', 'returns_manager', 'viewer');

create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_idx on public.organization_members (user_id);

-- Membership helper (SECURITY DEFINER so RLS policies can call it without
-- recursing into organization_members' own RLS).
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Chart of Accounts
-- ─────────────────────────────────────────────────────────────────────
create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');

create table if not exists public.accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  code          text not null,
  name          text not null,
  type          public.account_type not null,
  credit_normal boolean not null,           -- liabilities/equity/revenue = true
  is_system     boolean not null default false,  -- seeded default account
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (org_id, code)
);

create index if not exists accounts_org_idx on public.accounts (org_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Accounting periods (fiscal calendar + locking)
-- ─────────────────────────────────────────────────────────────────────
create type public.period_status as enum ('open', 'closed');

create table if not exists public.accounting_periods (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,                 -- e.g. "FY2026-07"
  start_date date not null,
  end_date   date not null,
  status     public.period_status not null default 'open',
  closed_at  timestamptz,
  closed_by  uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  check (end_date >= start_date)
);

create index if not exists periods_org_idx on public.accounting_periods (org_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Journal entries + lines (the immutable ledger)
-- ─────────────────────────────────────────────────────────────────────
create type public.entry_status as enum ('posted', 'void');

-- Mirrors GlSourceType in engine/accounting.ts, plus 'manual' + 'opening_balance'.
create type public.gl_source_type as enum (
  'order_settlement', 'purchase', 'expense', 'cogs', 'adjustment',
  'bank_import', 'invoice', 'bill', 'payment', 'manual', 'opening_balance'
);

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  entry_date  date not null,
  memo        text,
  source_type public.gl_source_type not null default 'manual',
  source_id   text,                          -- e.g. subOrderNo / purchaseId
  -- Stable idempotency key so porting derived GL is safe to re-run (upsert).
  external_id text,
  period_id   uuid references public.accounting_periods (id),
  status      public.entry_status not null default 'posted',
  reverses    uuid references public.journal_entries (id),  -- this entry reverses …
  reversed_by uuid references public.journal_entries (id),  -- … was reversed by
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  posted_at   timestamptz not null default now(),
  unique (org_id, external_id)
);

create index if not exists je_org_date_idx on public.journal_entries (org_id, entry_date);
create index if not exists je_source_idx on public.journal_entries (org_id, source_type, source_id);

create table if not exists public.journal_lines (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.journal_entries (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  debit      numeric(14,2) not null default 0,
  credit     numeric(14,2) not null default 0,
  memo       text,
  -- exactly one side is non-zero, and both are non-negative
  check (debit  >= 0 and credit >= 0),
  check ((debit = 0) <> (credit = 0))
);

create index if not exists jl_entry_idx on public.journal_lines (entry_id);
create index if not exists jl_account_idx on public.journal_lines (org_id, account_id);

-- ── 4a. Balanced-entry enforcement (deferrable: check at commit) ──────
create or replace function public.enforce_balanced_entry()
returns trigger language plpgsql as $$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
  v_debit numeric(14,2);
  v_credit numeric(14,2);
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debit, v_credit
  from public.journal_lines where entry_id = v_entry;

  -- allow a fully-deleted entry (no lines) to pass; block unbalanced ones
  if v_debit <> v_credit then
    raise exception 'journal entry % is unbalanced: debit % <> credit %',
      v_entry, v_debit, v_credit;
  end if;
  return null;
end;
$$;

create constraint trigger trg_balanced_entry
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.enforce_balanced_entry();

-- ── 4b. Immutability: posted entries are append-only ──────────────────
-- Correct a posted entry by inserting a reversing entry + a new one, never by
-- editing. Voiding (status posted→void, setting reversed_by) is permitted.
create or replace function public.prevent_posted_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' and old.reversed_by is null then
      raise exception 'cannot delete a posted journal entry (reverse it instead)';
    end if;
    return old;
  end if;
  -- UPDATE: only allow the void/reversal bookkeeping columns to change
  if old.status = 'posted' then
    if (new.entry_date, new.memo, new.source_type, new.source_id,
        new.external_id, new.org_id)
       is distinct from
       (old.entry_date, old.memo, old.source_type, old.source_id,
        old.external_id, old.org_id) then
      raise exception 'cannot edit a posted journal entry (reverse it instead)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_posted_mutation
  before update or delete on public.journal_entries
  for each row execute function public.prevent_posted_mutation();

-- Lines of a posted, non-reversed entry are frozen too.
create or replace function public.prevent_posted_line_mutation()
returns trigger language plpgsql as $$
declare v_status public.entry_status; v_reversed uuid;
begin
  select status, reversed_by into v_status, v_reversed
  from public.journal_entries
  where id = coalesce(new.entry_id, old.entry_id);
  if v_status = 'posted' and v_reversed is null then
    raise exception 'cannot modify lines of a posted journal entry (reverse it instead)';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_prevent_posted_line_mutation
  before update or delete on public.journal_lines
  for each row execute function public.prevent_posted_line_mutation();

-- ─────────────────────────────────────────────────────────────────────
-- 5. Default Chart of Accounts seeding (mirrors engine/accounting.ts COA)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.seed_default_accounts(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.accounts (org_id, code, name, type, credit_normal, is_system)
  values
    (p_org, '1000', 'Cash & Bank Receipts',   'asset',     false, true),
    (p_org, '1100', 'Accounts Receivable',     'asset',     false, true),
    (p_org, '1200', 'Inventory',               'asset',     false, true),
    (p_org, '1300', 'TDS Receivable',          'asset',     false, true),
    (p_org, '1400', 'TCS Receivable',          'asset',     false, true),
    (p_org, '2000', 'Accounts Payable',        'liability', true,  true),
    (p_org, '2100', 'GST Payable',             'liability', true,  true),
    (p_org, '3000', 'Retained Earnings',       'equity',    true,  true),
    (p_org, '3100', 'Owner Equity',            'equity',    true,  true),
    (p_org, '4000', 'Sales Revenue',           'revenue',   true,  true),
    (p_org, '4100', 'Exchange Income',         'revenue',   true,  true),
    (p_org, '4200', 'Claims & Compensation',   'revenue',   true,  true),
    (p_org, '4300', 'Lost Order Compensation', 'revenue',   true,  true),
    (p_org, '5000', 'Cost of Goods Sold',      'expense',   false, true),
    (p_org, '5100', 'Return & RTO Losses',     'expense',   false, true),
    (p_org, '6000', 'Platform & Affiliate Fees','expense',  false, true),
    (p_org, '6100', 'Advertising',             'expense',   false, true),
    (p_org, '6200', 'QC Damage Write-offs',    'expense',   false, true),
    (p_org, '6300', 'Operating Expenses',      'expense',   false, true)
  on conflict (org_id, code) do nothing;
$$;

-- When an org is created, auto-add creator as owner + seed the COA.
create or replace function public.bootstrap_organization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_members (org_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  perform public.seed_default_accounts(new.id);
  return new;
end;
$$;

create trigger trg_bootstrap_organization
  after insert on public.organizations
  for each row execute function public.bootstrap_organization();

-- ─────────────────────────────────────────────────────────────────────
-- 6. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.accounts              enable row level security;
alter table public.accounting_periods    enable row level security;
alter table public.journal_entries       enable row level security;
alter table public.journal_lines         enable row level security;

-- organizations: members can read; any authenticated user can create;
-- only owner/manager can update.
create policy org_select on public.organizations
  for select using (public.is_org_member(id));
create policy org_insert on public.organizations
  for insert with check (created_by = auth.uid());
create policy org_update on public.organizations
  for update using (public.has_org_role(id, array['owner','manager']::public.org_role[]));

-- members: a user sees rows for orgs they belong to; owners/managers manage.
create policy members_select on public.organization_members
  for select using (public.is_org_member(org_id));
create policy members_write on public.organization_members
  for all using (public.has_org_role(org_id, array['owner','manager']::public.org_role[]))
  with check (public.has_org_role(org_id, array['owner','manager']::public.org_role[]));

-- accounts / periods / entries / lines: full access to org members
-- (finer write-roles are enforced in the postJournal service, layer 2).
create policy accounts_all on public.accounts
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy periods_all on public.accounting_periods
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy entries_all on public.journal_entries
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy lines_all on public.journal_lines
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
