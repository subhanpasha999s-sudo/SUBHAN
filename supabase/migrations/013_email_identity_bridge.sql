-- Email-first identity bridge for admin analytics and billing operations.
-- UUID foreign keys stay in place for referential integrity while email becomes
-- the human-facing identifier for SaaS reporting and support workflows.

alter table public.tulmin_user_subscriptions
  add column if not exists user_email text;

alter table public.tulmin_usage_events
  add column if not exists user_email text;

alter table public.tulmin_payment_events
  add column if not exists user_email text;

alter table public.tulmin_label_credit_grants
  add column if not exists user_email text;

create index if not exists tulmin_user_subscriptions_email_idx
  on public.tulmin_user_subscriptions (lower(user_email))
  where user_email is not null;

create index if not exists tulmin_usage_events_email_month_idx
  on public.tulmin_usage_events (lower(user_email), month_key, created_at desc)
  where user_email is not null;

create index if not exists tulmin_payment_events_email_idx
  on public.tulmin_payment_events (lower(user_email), created_at desc)
  where user_email is not null;

create index if not exists tulmin_label_credit_grants_email_idx
  on public.tulmin_label_credit_grants (lower(user_email), created_at desc)
  where user_email is not null;
