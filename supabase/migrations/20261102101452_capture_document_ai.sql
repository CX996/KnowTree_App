alter table public.entries
  drop constraint if exists entries_capture_type_check;

alter table public.entries
  add constraint entries_capture_type_check
  check (capture_type in ('web', 'manual', 'clip', 'image', 'file'));

alter table public.entries
  add column source_name text,
  add column source_mime text,
  add column title_source text not null default 'legacy'
    check (title_source in ('manual', 'ai', 'fallback', 'imported', 'legacy')),
  add column summary_source text
    check (summary_source in ('manual', 'ai', 'fallback', 'imported', 'legacy'));

alter table public.profiles
  add column ai_auto_title boolean not null default true,
  add column ai_auto_summary boolean not null default true,
  add column ai_auto_classify boolean not null default true,
  add column ai_embeddings_enabled boolean not null default true,
  add column ai_last_error text,
  add column ai_last_error_at timestamptz;
