-- Idempotent billing foundation.
-- Safe to run on a fresh project or an already-partially-migrated production database.

create table if not exists public.tulmin_user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'free',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tulmin_billing_settings (
  id boolean primary key default true check (id = true),
  provider text not null default 'razorpay',
  mode text not null default 'test',
  checkout_enabled boolean not null default false,
  razorpay_key_id text,
  razorpay_key_secret_encrypted text,
  razorpay_key_secret_last4 text,
  razorpay_webhook_secret_encrypted text,
  razorpay_webhook_secret_last4 text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tulmin_plan_settings (
  plan text primary key,
  enabled boolean not null default true,
  monthly_price integer not null default 0 check (monthly_price >= 0),
  yearly_monthly_equivalent integer not null default 0 check (yearly_monthly_equivalent >= 0),
  yearly_total integer not null default 0 check (yearly_total >= 0),
  label_limit integer check (label_limit is null or label_limit >= 0),
  daily_limit integer check (daily_limit is null or daily_limit >= 0),
  razorpay_monthly_plan_id text,
  razorpay_yearly_plan_id text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tulmin_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null default 'filter',
  label_count integer not null check (label_count >= 0),
  month_key text not null,
  billing_period_key text,
  device_hash text,
  ip_hash text,
  ua_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tulmin_device_trials (
  device_hash text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text,
  ua_hash text,
  free_usage_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (device_hash, user_id)
);

create table if not exists public.tulmin_payment_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'razorpay',
  provider_event_id text,
  provider_payment_id text,
  provider_order_id text,
  provider_invoice_id text,
  provider_subscription_id text,
  plan text,
  billing_cycle text,
  label_credits integer not null default 0 check (label_credits >= 0),
  amount integer not null default 0 check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'created',
  failure_reason text,
  invoice_url text,
  metadata jsonb not null default '{}'::jsonb,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.tulmin_rate_limits (
  key text primary key,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.tulmin_usage_events
  add column if not exists billing_period_key text;
alter table public.tulmin_usage_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tulmin_payment_events
  add column if not exists provider_order_id text;
alter table public.tulmin_payment_events
  add column if not exists provider_invoice_id text;
alter table public.tulmin_payment_events
  add column if not exists billing_cycle text;
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

alter table public.tulmin_usage_events
  drop constraint if exists tulmin_usage_events_action_check;
alter table public.tulmin_usage_events
  add constraint tulmin_usage_events_action_check
  check (action in ('import', 'export', 'filter', 'crop', 'processed'));

create index if not exists tulmin_usage_events_user_month_idx
  on public.tulmin_usage_events (user_id, month_key, created_at desc);
create index if not exists tulmin_usage_events_action_month_idx
  on public.tulmin_usage_events (user_id, action, month_key, created_at desc);
create index if not exists tulmin_usage_events_device_idx
  on public.tulmin_usage_events (device_hash, month_key)
  where device_hash is not null;
create index if not exists tulmin_device_trials_seen_idx
  on public.tulmin_device_trials (device_hash, last_seen_at desc);
create unique index if not exists tulmin_payment_events_provider_event_idx
  on public.tulmin_payment_events (provider, provider_event_id)
  where provider_event_id is not null;
create unique index if not exists tulmin_payment_events_order_idx
  on public.tulmin_payment_events (provider, provider_order_id)
  where provider_order_id is not null;
create index if not exists tulmin_payment_events_user_idx
  on public.tulmin_payment_events (user_id, created_at desc);
create index if not exists tulmin_label_credit_grants_user_idx
  on public.tulmin_label_credit_grants (user_id, expires_at, created_at desc);
create index if not exists tulmin_abuse_events_device_idx
  on public.tulmin_abuse_events (device_hash, blocked_until, created_at desc)
  where device_hash is not null;
create index if not exists tulmin_rate_limits_reset_idx
  on public.tulmin_rate_limits (reset_at);

insert into public.tulmin_billing_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.tulmin_plan_settings
  (plan, monthly_price, yearly_monthly_equivalent, yearly_total, label_limit, daily_limit)
values
  ('free', 0, 0, 0, 150, null),
  ('starter', 99, 70, 840, 1500, 50),
  ('pro', 199, 141, 1692, null, null),
  ('business', 499, 354, 4248, null, null)
on conflict (plan) do nothing;

alter table public.tulmin_user_subscriptions enable row level security;
alter table public.tulmin_billing_settings enable row level security;
alter table public.tulmin_plan_settings enable row level security;
alter table public.tulmin_usage_events enable row level security;
alter table public.tulmin_device_trials enable row level security;
alter table public.tulmin_payment_events enable row level security;
alter table public.tulmin_label_credit_grants enable row level security;
alter table public.tulmin_abuse_events enable row level security;
alter table public.tulmin_rate_limits enable row level security;

drop policy if exists "Users can read own Tulmin subscription" on public.tulmin_user_subscriptions;
create policy "Users can read own Tulmin subscription"
  on public.tulmin_user_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own Tulmin usage" on public.tulmin_usage_events;
create policy "Users can read own Tulmin usage"
  on public.tulmin_usage_events
  for select
  using (auth.uid() = user_id);

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
