create table if not exists public.tulmin_user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'business')),
  status text not null default 'free' check (status in ('free', 'trialing', 'active', 'past_due')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tulmin_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('import', 'export')),
  label_count integer not null check (label_count >= 0),
  month_key text not null,
  device_hash text,
  ip_hash text,
  ua_hash text,
  created_at timestamptz not null default now()
);

create index if not exists tulmin_usage_events_user_month_idx
  on public.tulmin_usage_events (user_id, month_key, created_at desc);

create index if not exists tulmin_usage_events_device_idx
  on public.tulmin_usage_events (device_hash, month_key)
  where device_hash is not null;

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

create index if not exists tulmin_device_trials_seen_idx
  on public.tulmin_device_trials (device_hash, last_seen_at desc);

alter table public.tulmin_user_subscriptions enable row level security;
alter table public.tulmin_usage_events enable row level security;
alter table public.tulmin_device_trials enable row level security;

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

-- Writes are intentionally handled by trusted route handlers/service role only.
