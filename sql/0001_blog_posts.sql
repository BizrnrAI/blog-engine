-- Canonical blog storage for every site on the engine.
--
-- One table, partitioned logically by site_id, so a new site is a row in the registry rather
-- than a schema change. Publishing is an upsert; a rollback is a status flip. Nothing here
-- requires a deploy, a pull request, or CI.
--
-- Apply once per Supabase project:  psql "$DATABASE_URL" -f sql/0001_blog_posts.sql

create table if not exists public.blog_posts (
  id                 uuid primary key default gen_random_uuid(),
  site_id            text        not null,
  slug               text        not null,
  title              text        not null,
  description        text        not null default '',
  category           text        not null default '',
  tags               text[]      not null default '{}',
  answer             text        not null default '',   -- the 40-60 word quick answer (AEO)
  content            text        not null default '',   -- Markdown body the site renders
  markdown           text,                              -- exact engine file output (lossless export)
  read_mins          integer,
  author             text,
  faqs               jsonb       not null default '[]', -- [{question, answer}]
  sources            jsonb       not null default '[]', -- [{title, url, publisher}]
  hero_image         text,
  hero_image_alt     text,
  hero_image_width   integer,
  hero_image_height  integer,
  hero_image_srcset  text,
  og_image           text,
  status             text        not null default 'published'
                       check (status in ('draft', 'published', 'blocked')),
  published_at       date        not null default current_date,
  updated_at         date        not null default current_date,
  created_at         timestamptz not null default now(),
  constraint blog_posts_site_slug_key unique (site_id, slug)
);

-- The engine's hot paths: "all published posts for this site, newest first".
create index if not exists blog_posts_site_status_pub_idx
  on public.blog_posts (site_id, status, published_at desc);

-- Cadence guard / rank rescue look posts up by slug within a site.
create index if not exists blog_posts_site_slug_idx
  on public.blog_posts (site_id, slug);

alter table public.blog_posts enable row level security;

-- Anonymous readers see published posts only. Sites render with the anon key; the generation
-- service writes with the service-role key, which bypasses RLS.
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read
  on public.blog_posts for select
  using (status = 'published' and published_at <= current_date);

-- Assets bucket (heroes, OG cards, responsive variants). Public read, service-role write.
insert into storage.buckets (id, name, public)
values ('blog-assets', 'blog-assets', true)
on conflict (id) do nothing;

drop policy if exists blog_assets_public_read on storage.objects;
create policy blog_assets_public_read
  on storage.objects for select
  using (bucket_id = 'blog-assets');
