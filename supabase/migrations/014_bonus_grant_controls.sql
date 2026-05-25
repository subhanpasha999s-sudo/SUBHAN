-- Admin controls for bonus credits and unlimited label allowances.
-- Existing UUID relations remain the storage key; email stays the support/admin identifier.

alter table public.tulmin_label_credit_grants
  add column if not exists status text not null default 'active';

alter table public.tulmin_label_credit_grants
  add column if not exists grant_kind text not null default 'labels';

alter table public.tulmin_label_credit_grants
  add column if not exists updated_at timestamptz not null default now();

alter table public.tulmin_label_credit_grants
  add column if not exists renewed_at timestamptz;

create index if not exists tulmin_label_credit_grants_status_idx
  on public.tulmin_label_credit_grants (status, expires_at, created_at desc);

create index if not exists tulmin_label_credit_grants_kind_idx
  on public.tulmin_label_credit_grants (grant_kind, status, expires_at);
