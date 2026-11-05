alter table public.profiles
  add column account_status text not null default 'active'
    check (account_status in ('active', 'deletion_pending')),
  add column deletion_requested_at timestamptz,
  add column deletion_scheduled_for timestamptz;

alter table public.profiles
  add constraint profiles_deletion_window_check
  check (
    (
      account_status = 'active'
      and deletion_requested_at is null
      and deletion_scheduled_for is null
    )
    or
    (
      account_status = 'deletion_pending'
      and deletion_requested_at is not null
      and deletion_scheduled_for is not null
      and deletion_scheduled_for >= deletion_requested_at + interval '7 days'
    )
  );

insert into public.profiles (user_id)
select users.id
from auth.users users
on conflict (user_id) do nothing;

with empty_users as (
  select users.id
  from auth.users users
  where not exists (
    select 1
    from public.categories categories
    where categories.user_id = users.id
      and categories.deleted_at is null
  )
),
defaults(name, description) as (
  values
    ('技术', '编程、工程与产品技术'),
    ('阅读', '书籍、文章与灵感摘录'),
    ('工作', '工作资料与方法论'),
    ('生活', '生活记录与兴趣')
)
insert into public.categories (user_id, name, description)
select empty_users.id, defaults.name, defaults.description
from empty_users
cross join defaults;

drop index if exists public.categories_user_name_unique;

create unique index categories_user_parent_name_unique
  on public.categories (
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where deleted_at is null;

create unique index if not exists categories_id_user_unique
  on public.categories (id, user_id);

alter table public.categories
  add constraint categories_parent_same_user
  foreign key (parent_id, user_id)
  references public.categories (id, user_id);

create or replace function private.enforce_category_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'category cannot parent itself' using errcode = '23514';
  end if;

  select c.parent_id
    into parent_parent_id
  from public.categories c
  where c.id = new.parent_id
    and c.user_id = new.user_id
    and c.deleted_at is null;

  if not found then
    raise exception 'parent category is unavailable' using errcode = '23503';
  end if;

  if parent_parent_id is not null then
    raise exception 'category depth cannot exceed two' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.categories child
    where child.parent_id = new.id
      and child.user_id = new.user_id
      and child.deleted_at is null
  ) then
    raise exception 'category with children cannot become a child' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_category_hierarchy() from public;

create trigger categories_enforce_hierarchy
before insert or update of parent_id, user_id on public.categories
for each row execute function private.enforce_category_hierarchy();

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  email_normalized text not null
    check (length(email_normalized) between 3 and 320),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'claimed', 'used', 'revoked', 'needs_attention')),
  claim_id uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete cascade,
  revoked_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  check (email_normalized = lower(btrim(email_normalized))),
  check (expires_at > created_at),
  check (status <> 'claimed' or (claim_id is not null and claimed_at is not null and claim_expires_at is not null)),
  check (status <> 'used' or (used_at is not null and used_by is not null))
);

create unique index invitations_one_open_per_email
  on public.invitations (email_normalized)
  where used_at is null
    and revoked_at is null
    and status in ('active', 'claimed', 'needs_attention');

create index invitations_owner_created_idx
  on public.invitations (created_by, created_at desc);

create index invitations_claim_expiry_idx
  on public.invitations (claim_expires_at)
  where status = 'claimed';

alter table public.invitations enable row level security;
revoke all on table public.invitations from anon, authenticated;
grant all on table public.invitations to service_role;

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from anon, authenticated;
grant all on table public.audit_events to service_role;

create table public.error_events (
  request_id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  method text not null,
  path text not null,
  status integer not null check (status between 400 and 599),
  code text not null,
  safe_message text not null,
  retryable boolean not null default false,
  created_at timestamptz not null default now()
);

create index error_events_created_idx
  on public.error_events (created_at desc);

create index error_events_code_created_idx
  on public.error_events (code, created_at desc);

alter table public.error_events enable row level security;
revoke all on table public.error_events from anon, authenticated;
grant all on table public.error_events to service_role;

revoke update on table public.profiles from authenticated;
revoke insert on table public.profiles from authenticated;

grant insert (
  user_id,
  display_name,
  avatar_url,
  daily_recall_enabled,
  daily_recall_count,
  auto_classify_threshold,
  review_threshold,
  auto_merge_enabled,
  ai_auto_title,
  ai_auto_summary,
  ai_auto_classify,
  ai_embeddings_enabled,
  ai_last_error,
  ai_last_error_at
) on table public.profiles to authenticated;

grant update (
  display_name,
  avatar_url,
  daily_recall_enabled,
  daily_recall_count,
  auto_classify_threshold,
  review_threshold,
  auto_merge_enabled,
  ai_auto_title,
  ai_auto_summary,
  ai_auto_classify,
  ai_embeddings_enabled,
  ai_last_error,
  ai_last_error_at,
  updated_at
) on table public.profiles to authenticated;

revoke update (account_status, deletion_requested_at, deletion_scheduled_for)
  on table public.profiles from authenticated;

alter table public.jobs
  drop constraint if exists jobs_job_type_check;

alter table public.jobs
  add constraint jobs_job_type_check
  check (
    job_type in (
      'parse',
      'classify',
      'link',
      'dedupe',
      'daily_recall',
      'export',
      'delete_account',
      'cleanup_trash',
      'invite_recovery'
    )
  );

create or replace function public.session_is_valid(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session
    where session.id = p_session_id
      and session.user_id = p_user_id
  );
$$;

revoke all on function public.session_is_valid(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.session_is_valid(uuid, uuid)
  to service_role;
