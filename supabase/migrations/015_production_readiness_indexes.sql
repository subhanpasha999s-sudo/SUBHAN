-- Production-readiness indexes and idempotency guards for higher traffic.

create unique index if not exists tulmin_label_credit_grants_payment_event_unique_idx
  on public.tulmin_label_credit_grants (payment_event_id)
  where payment_event_id is not null;

create index if not exists tulmin_payment_events_status_created_idx
  on public.tulmin_payment_events (status, created_at desc);

create index if not exists tulmin_payment_events_plan_status_created_idx
  on public.tulmin_payment_events (plan, status, created_at desc)
  where plan is not null;

create index if not exists tulmin_user_subscriptions_status_plan_idx
  on public.tulmin_user_subscriptions (status, plan, current_period_end);

create index if not exists tulmin_usage_events_month_created_idx
  on public.tulmin_usage_events (month_key, created_at desc);

create index if not exists tulmin_usage_events_created_idx
  on public.tulmin_usage_events (created_at desc);
