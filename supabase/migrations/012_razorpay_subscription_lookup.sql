alter table public.tulmin_payment_events
  add column if not exists provider_subscription_id text;

create index if not exists tulmin_payment_events_subscription_idx
  on public.tulmin_payment_events (provider, provider_subscription_id)
  where provider_subscription_id is not null;
