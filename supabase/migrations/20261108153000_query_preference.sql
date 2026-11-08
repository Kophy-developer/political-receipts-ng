alter table public.desk_schedule
  add column if not exists query_preference jsonb not null default '{}'::jsonb;
