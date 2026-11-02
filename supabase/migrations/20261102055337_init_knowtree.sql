create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  daily_recall_enabled boolean not null default true,
  daily_recall_count integer not null default 3 check (daily_recall_count between 1 and 3),
  auto_classify_threshold numeric(4, 3) not null default 0.750 check (auto_classify_threshold between 0 and 1),
  review_threshold numeric(4, 3) not null default 0.500 check (review_threshold between 0 and 1),
  auto_merge_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_threshold <= auto_classify_threshold)
);

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  description text,
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create unique index categories_user_name_unique
  on public.categories (user_id, lower(btrim(name)))
  where deleted_at is null;
create index categories_user_created_idx
  on public.categories (user_id, created_at desc)
  where deleted_at is null;

create table public.sources (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  url_hash text not null,
  domain text,
  title text,
  favicon_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sources_user_url_hash_unique
  on public.sources (user_id, url_hash)
  where deleted_at is null;

create table public.entries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  title text not null default '未命名知识',
  summary text,
  content text not null default '',
  content_hash text not null,
  source_url text,
  capture_type text not null default 'manual'
    check (capture_type in ('web', 'manual', 'clip', 'image')),
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'parsed', 'classified', 'linked', 'failed')),
  classification_status text not null default 'uncategorized'
    check (classification_status in ('auto', 'pending_review', 'uncategorized')),
  classification_confidence numeric(4, 3) check (classification_confidence between 0 and 1),
  suggested_category_id uuid references public.categories(id) on delete set null,
  weight integer not null default 1 check (weight >= 1),
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz,
  embedding extensions.vector(1024),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index entries_user_content_hash_unique
  on public.entries (user_id, content_hash)
  where deleted_at is null;
create index entries_user_created_idx
  on public.entries (user_id, created_at desc)
  where deleted_at is null;
create index entries_user_category_idx
  on public.entries (user_id, category_id, created_at desc)
  where deleted_at is null;
create index entries_user_classification_idx
  on public.entries (user_id, classification_status, created_at desc)
  where deleted_at is null;
create index entries_embedding_hnsw_idx
  on public.entries using hnsw (embedding extensions.vector_cosine_ops)
  where deleted_at is null and embedding is not null;

create table public.entry_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  title text not null,
  content text not null default '',
  content_hash text,
  note text,
  created_at timestamptz not null default now()
);

create index entry_versions_user_entry_created_idx
  on public.entry_versions (user_id, entry_id, created_at desc);

create table public.links (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_entry_id uuid not null references public.entries(id) on delete cascade,
  target_entry_id uuid not null references public.entries(id) on delete cascade,
  score numeric(6, 5) not null default 0 check (score between 0 and 1),
  reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (source_entry_id <> target_entry_id)
);

create unique index links_user_source_target_unique
  on public.links (user_id, source_entry_id, target_entry_id)
  where deleted_at is null;
create index links_user_source_score_idx
  on public.links (user_id, source_entry_id, score desc)
  where deleted_at is null;

create table public.jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_type text not null
    check (job_type in ('parse', 'classify', 'link', 'dedupe', 'daily_recall', 'export', 'delete_account')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  next_run_at timestamptz not null default now(),
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_due_idx
  on public.jobs (next_run_at, created_at)
  where status = 'pending';
create index jobs_user_created_idx
  on public.jobs (user_id, created_at desc);

create table public.daily_recalls (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  recall_date date not null,
  weight integer not null default 1 check (weight >= 1),
  status text not null default 'pending'
    check (status in ('pending', 'done', 'skipped')),
  created_at timestamptz not null default now()
);

create unique index daily_recalls_user_date_entry_unique
  on public.daily_recalls (user_id, recall_date, entry_id);
create index daily_recalls_user_date_idx
  on public.daily_recalls (user_id, recall_date, created_at);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();
create trigger sources_set_updated_at
before update on public.sources
for each row execute function private.set_updated_at();
create trigger entries_set_updated_at
before update on public.entries
for each row execute function private.set_updated_at();
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.sources enable row level security;
alter table public.entries enable row level security;
alter table public.entry_versions enable row level security;
alter table public.links enable row level security;
alter table public.jobs enable row level security;
alter table public.daily_recalls enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.sources from anon, authenticated;
revoke all on table public.entries from anon, authenticated;
revoke all on table public.entry_versions from anon, authenticated;
revoke all on table public.links from anon, authenticated;
revoke all on table public.jobs from anon, authenticated;
revoke all on table public.daily_recalls from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.sources to authenticated;
grant select, insert, update, delete on table public.entries to authenticated;
grant select, insert, update, delete on table public.entry_versions to authenticated;
grant select, insert, update, delete on table public.links to authenticated;
grant select, insert on table public.jobs to authenticated;
grant select, insert, update, delete on table public.daily_recalls to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.categories to service_role;
grant all on table public.sources to service_role;
grant all on table public.entries to service_role;
grant all on table public.entry_versions to service_role;
grant all on table public.links to service_role;
grant all on table public.jobs to service_role;
grant all on table public.daily_recalls to service_role;

create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy categories_select_own on public.categories
for select to authenticated
using ((select auth.uid()) = user_id);
create policy categories_insert_own on public.categories
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy categories_update_own on public.categories
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy categories_delete_own on public.categories
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy sources_select_own on public.sources
for select to authenticated
using ((select auth.uid()) = user_id);
create policy sources_insert_own on public.sources
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy sources_update_own on public.sources
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy sources_delete_own on public.sources
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy entries_select_own on public.entries
for select to authenticated
using ((select auth.uid()) = user_id);
create policy entries_insert_own on public.entries
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy entries_update_own on public.entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy entries_delete_own on public.entries
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy entry_versions_select_own on public.entry_versions
for select to authenticated
using ((select auth.uid()) = user_id);
create policy entry_versions_insert_own on public.entry_versions
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy entry_versions_update_own on public.entry_versions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy entry_versions_delete_own on public.entry_versions
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy links_select_own on public.links
for select to authenticated
using ((select auth.uid()) = user_id);
create policy links_insert_own on public.links
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy links_update_own on public.links
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy links_delete_own on public.links
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy jobs_select_own on public.jobs
for select to authenticated
using ((select auth.uid()) = user_id);
create policy jobs_insert_own on public.jobs
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy daily_recalls_select_own on public.daily_recalls
for select to authenticated
using ((select auth.uid()) = user_id);
create policy daily_recalls_insert_own on public.daily_recalls
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy daily_recalls_update_own on public.daily_recalls
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy daily_recalls_delete_own on public.daily_recalls
for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.match_entries(
  p_user_id uuid,
  p_query_embedding extensions.vector(1024),
  p_exclude_entry_id uuid default null,
  p_min_similarity double precision default 0,
  p_match_count integer default 10
)
returns table (
  entry_id uuid,
  title text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    e.id as entry_id,
    e.title,
    round((1 - (e.embedding <=> p_query_embedding))::numeric, 4)::double precision as similarity
  from public.entries e
  where e.user_id = p_user_id
    and ((select auth.uid()) is null or e.user_id = (select auth.uid()))
    and e.deleted_at is null
    and e.embedding is not null
    and (p_exclude_entry_id is null or e.id <> p_exclude_entry_id)
    and (1 - (e.embedding <=> p_query_embedding)) >= greatest(least(p_min_similarity, 1), -1)
  order by e.embedding <=> p_query_embedding
  limit greatest(least(p_match_count, 50), 1);
$$;

revoke all on function public.match_entries(
  uuid,
  extensions.vector,
  uuid,
  double precision,
  integer
) from public, anon;
grant execute on function public.match_entries(
  uuid,
  extensions.vector,
  uuid,
  double precision,
  integer
) to authenticated, service_role;

create or replace function public.claim_due_jobs(p_limit integer default 5)
returns setof public.jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with candidates as (
    select j.id
    from public.jobs j
    where j.status = 'pending'
      and j.next_run_at <= now()
      and j.attempt_count < j.max_attempts
    order by j.next_run_at asc, j.created_at asc
    for update skip locked
    limit greatest(least(p_limit, 50), 1)
  )
  update public.jobs j
  set status = 'running', updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_due_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_jobs(integer) to service_role;
