alter table public.desk_schedule
  add column if not exists last_run jsonb;
