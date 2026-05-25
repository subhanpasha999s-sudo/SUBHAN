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

alter table public.tulmin_usage_events
  drop constraint if exists tulmin_usage_events_action_check;

alter table public.tulmin_usage_events
  add constraint tulmin_usage_events_action_check
  check (action in ('import', 'export', 'filter', 'crop', 'processed'));

alter table public.tulmin_usage_events
  add column if not exists billing_period_key text;

alter table public.tulmin_usage_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists tulmin_usage_events_user_month_idx
  on public.tulmin_usage_events (user_id, month_key, created_at desc);

create index if not exists tulmin_usage_events_action_month_idx
  on public.tulmin_usage_events (user_id, action, month_key, created_at desc);

create index if not exists tulmin_usage_events_device_idx
  on public.tulmin_usage_events (device_hash, month_key)
  where device_hash is not null;

alter table public.tulmin_usage_events enable row level security;

drop policy if exists "Users can read own Tulmin usage" on public.tulmin_usage_events;
create policy "Users can read own Tulmin usage"
  on public.tulmin_usage_events
  for select
  using (auth.uid() = user_id);

create or replace function public.tulmin_reserve_usage_labels(
  p_user_id uuid,
  p_action text,
  p_requested_label_count integer,
  p_allow_partial boolean,
  p_month_key text,
  p_day_key text,
  p_monthly_limit integer,
  p_daily_limit integer,
  p_billing_period_key text,
  p_device_hash text,
  p_ip_hash text,
  p_ua_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  accepted_label_count integer,
  rejected_label_count integer,
  monthly_limit_hit boolean,
  daily_limit_hit boolean,
  labels_used_after integer,
  daily_labels_used_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month_usage integer := 0;
  current_day_usage integer := 0;
  month_remaining integer;
  day_remaining integer;
  effective_remaining integer;
begin
  p_requested_label_count := greatest(0, coalesce(p_requested_label_count, 0));
  p_metadata := coalesce(p_metadata, '{}'::jsonb);

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_month_key, 0));

  select coalesce(sum(label_count), 0)::integer
    into current_month_usage
    from public.tulmin_usage_events
    where user_id = p_user_id
      and month_key = p_month_key
      and action in ('import', 'export', 'filter', 'crop', 'processed');

  select coalesce(sum(label_count), 0)::integer
    into current_day_usage
    from public.tulmin_usage_events
    where user_id = p_user_id
      and month_key = p_month_key
      and created_at >= (p_day_key::date)::timestamptz
      and created_at < ((p_day_key::date + 1)::timestamptz)
      and action in ('import', 'export', 'filter', 'crop', 'processed');

  month_remaining := case
    when p_monthly_limit is null then null
    else greatest(0, p_monthly_limit - current_month_usage)
  end;
  day_remaining := case
    when p_daily_limit is null then null
    else greatest(0, p_daily_limit - current_day_usage)
  end;
  effective_remaining := least(
    coalesce(month_remaining, 2147483647),
    coalesce(day_remaining, 2147483647)
  );
  if month_remaining is null and day_remaining is null then
    effective_remaining := p_requested_label_count;
  end if;

  monthly_limit_hit := month_remaining is not null and p_requested_label_count > month_remaining;
  daily_limit_hit := day_remaining is not null and p_requested_label_count > day_remaining;

  accepted_label_count := case
    when p_requested_label_count <= 0 then 0
    when p_allow_partial then least(p_requested_label_count, effective_remaining)
    when p_requested_label_count > effective_remaining then 0
    else p_requested_label_count
  end;
  rejected_label_count := greatest(0, p_requested_label_count - accepted_label_count);

  if accepted_label_count > 0 then
    insert into public.tulmin_usage_events (
      user_id,
      action,
      label_count,
      month_key,
      billing_period_key,
      device_hash,
      ip_hash,
      ua_hash,
      metadata
    )
    values (
      p_user_id,
      case
        when p_action in ('import', 'export', 'filter', 'crop', 'processed') then p_action
        else 'filter'
      end,
      accepted_label_count,
      p_month_key,
      p_billing_period_key,
      p_device_hash,
      p_ip_hash,
      p_ua_hash,
      p_metadata || jsonb_build_object(
        'requestedLabelCount', p_requested_label_count,
        'rejectedLabelCount', rejected_label_count,
        'allowPartial', p_allow_partial
      )
    );
  end if;

  labels_used_after := current_month_usage + accepted_label_count;
  daily_labels_used_after := current_day_usage + accepted_label_count;
  return next;
end;
$$;

revoke all on function public.tulmin_reserve_usage_labels(
  uuid,
  text,
  integer,
  boolean,
  text,
  text,
  integer,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.tulmin_reserve_usage_labels(
  uuid,
  text,
  integer,
  boolean,
  text,
  text,
  integer,
  integer,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
