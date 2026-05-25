alter table public.tulmin_usage_events
  drop constraint if exists tulmin_usage_events_action_check;

alter table public.tulmin_usage_events
  add constraint tulmin_usage_events_action_check
  check (action in ('import', 'export', 'filter', 'crop', 'processed'));

alter table public.tulmin_usage_events
  add column if not exists billing_period_key text;

alter table public.tulmin_usage_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists tulmin_usage_events_action_month_idx
  on public.tulmin_usage_events (user_id, action, month_key, created_at desc);

create table if not exists public.tulmin_label_credit_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label_count integer not null check (label_count > 0),
  used_label_count integer not null default 0 check (used_label_count >= 0),
  reason text not null default 'manual',
  payment_event_id bigint references public.tulmin_payment_events(id) on delete set null,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tulmin_label_credit_grants_user_idx
  on public.tulmin_label_credit_grants (user_id, expires_at, created_at desc);

alter table public.tulmin_payment_events
  add column if not exists provider_order_id text;

alter table public.tulmin_payment_events
  add column if not exists provider_invoice_id text;

alter table public.tulmin_payment_events
  add column if not exists billing_cycle text
  check (billing_cycle is null or billing_cycle in ('monthly', 'yearly', 'topup'));

alter table public.tulmin_payment_events
  add column if not exists label_credits integer not null default 0 check (label_credits >= 0);

alter table public.tulmin_payment_events
  add column if not exists failure_reason text;

alter table public.tulmin_payment_events
  add column if not exists invoice_url text;

alter table public.tulmin_payment_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tulmin_payment_events
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists tulmin_payment_events_order_idx
  on public.tulmin_payment_events (provider, provider_order_id)
  where provider_order_id is not null;

create index if not exists tulmin_payment_events_user_idx
  on public.tulmin_payment_events (user_id, created_at desc);

create table if not exists public.tulmin_abuse_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  device_hash text,
  ip_hash text,
  ua_hash text,
  risk_score integer not null default 0 check (risk_score >= 0),
  reason text not null,
  blocked_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tulmin_abuse_events_device_idx
  on public.tulmin_abuse_events (device_hash, blocked_until, created_at desc)
  where device_hash is not null;

alter table public.tulmin_label_credit_grants enable row level security;
alter table public.tulmin_abuse_events enable row level security;

drop policy if exists "Users can read own Tulmin label credits" on public.tulmin_label_credit_grants;
create policy "Users can read own Tulmin label credits"
  on public.tulmin_label_credit_grants
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own Tulmin payments" on public.tulmin_payment_events;
create policy "Users can read own Tulmin payments"
  on public.tulmin_payment_events
  for select
  using (auth.uid() = user_id);

-- Writes stay behind trusted service-role route handlers and Razorpay webhooks.
