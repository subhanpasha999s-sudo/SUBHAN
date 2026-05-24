create table if not exists public.tulmin_billing_settings (
  id boolean primary key default true check (id = true),
  provider text not null default 'razorpay' check (provider in ('razorpay')),
  mode text not null default 'test' check (mode in ('test', 'live')),
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
  plan text primary key check (plan in ('free', 'starter', 'pro', 'business')),
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

create table if not exists public.tulmin_payment_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'razorpay',
  provider_event_id text,
  provider_payment_id text,
  provider_subscription_id text,
  plan text check (plan in ('free', 'starter', 'pro', 'business')),
  amount integer not null default 0 check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'created',
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists tulmin_payment_events_provider_event_idx
  on public.tulmin_payment_events (provider, provider_event_id)
  where provider_event_id is not null;

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

alter table public.tulmin_billing_settings enable row level security;
alter table public.tulmin_plan_settings enable row level security;
alter table public.tulmin_payment_events enable row level security;

-- Admin billing reads/writes are handled only through service-role API routes.
