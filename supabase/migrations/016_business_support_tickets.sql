create table if not exists public.tulmin_business_tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_name text,
  company text,
  plan text not null default 'business' check (plan in ('free', 'starter', 'pro', 'business')),
  subject text not null default 'Business account request',
  status text not null default 'open' check (status in ('open', 'user_replied', 'admin_replied', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_user_message_at timestamptz,
  last_admin_message_at timestamptz
);

create table if not exists public.tulmin_business_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tulmin_business_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin')),
  sender_id uuid references auth.users(id) on delete set null,
  sender_email text not null,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 5000),
  created_at timestamptz not null default now()
);

create index if not exists tulmin_business_tickets_user_updated_idx
  on public.tulmin_business_tickets (user_id, updated_at desc);

create index if not exists tulmin_business_tickets_status_updated_idx
  on public.tulmin_business_tickets (status, updated_at desc);

create index if not exists tulmin_business_ticket_messages_ticket_created_idx
  on public.tulmin_business_ticket_messages (ticket_id, created_at asc);

alter table public.tulmin_business_tickets enable row level security;
alter table public.tulmin_business_ticket_messages enable row level security;

-- User and admin access is mediated through service-role API routes so ticket
-- details can include account metadata without exposing cross-user reads.
