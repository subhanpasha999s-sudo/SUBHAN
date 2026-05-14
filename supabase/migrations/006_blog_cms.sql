-- Tulmin Blog CMS schema
-- Internal admin CMS tables. Public Tulmin users should only read published blog output.

create table if not exists public.blog_authors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('super_admin', 'editor')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.blogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  seo_title text,
  meta_description text,
  content jsonb not null default '[]'::jsonb,
  featured_image text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  author text,
  category_id uuid references public.blog_categories(id) on delete set null,
  author_id uuid references public.blog_authors(id) on delete set null,
  subtitle text,
  feature_image_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.blogs is
  'Admin blog CMS table. App fields map as: seoTitle -> seo_title, metaDescription -> meta_description, featuredImage -> featured_image, createdAt -> created_at, updatedAt -> updated_at, publishedAt -> published_at.';

alter table public.blogs add column if not exists seo_title text;
alter table public.blogs add column if not exists meta_description text;
alter table public.blogs add column if not exists featured_image text;
alter table public.blogs add column if not exists author text;
alter table public.blogs add column if not exists subtitle text;
alter table public.blogs add column if not exists feature_image_url text;
alter table public.blogs add column if not exists scheduled_for timestamptz;
alter table public.blogs add column if not exists published_at timestamptz;
alter table public.blogs add column if not exists created_at timestamptz not null default now();
alter table public.blogs add column if not exists updated_at timestamptz not null default now();

create index if not exists blogs_status_updated_at_idx on public.blogs(status, updated_at desc);
create index if not exists blogs_slug_idx on public.blogs(slug);

create table if not exists public.blog_seo (
  blog_id uuid primary key references public.blogs(id) on delete cascade,
  meta_title text,
  meta_description text,
  og_image_url text,
  canonical_url text,
  keywords text[] not null default '{}',
  internal_links jsonb not null default '[]'::jsonb,
  schema_json jsonb not null default '{}'::jsonb
);

create table if not exists public.blog_analytics (
  id uuid primary key default gen_random_uuid(),
  blog_id uuid references public.blogs(id) on delete cascade,
  event_name text not null,
  source text,
  visitor_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_audit_logs (
  id uuid primary key default gen_random_uuid(),
  blog_id uuid references public.blogs(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  actor_role text not null check (actor_role in ('super_admin', 'editor')),
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_tag_map (
  blog_id uuid references public.blogs(id) on delete cascade,
  tag_id uuid references public.blog_tags(id) on delete cascade,
  primary key (blog_id, tag_id)
);

alter table public.blog_authors enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blogs enable row level security;
alter table public.blog_seo enable row level security;
alter table public.blog_analytics enable row level security;
alter table public.blog_audit_logs enable row level security;
alter table public.blog_tag_map enable row level security;

create policy "Public can read published blogs"
  on public.blogs for select
  using (status = 'published' and (published_at is null or published_at <= now()));

create policy "Public can read published blog seo"
  on public.blog_seo for select
  using (
    exists (
      select 1 from public.blogs
      where blogs.id = blog_seo.blog_id
      and blogs.status = 'published'
      and (blogs.published_at is null or blogs.published_at <= now())
    )
  );

-- Admin writes should be performed through protected server APIs/service role.
-- Do not add broad authenticated write policies here.
