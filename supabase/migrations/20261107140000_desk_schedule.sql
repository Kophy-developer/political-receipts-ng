create table if not exists public.desk_schedule (
  id text primary key default 'default',
  enabled boolean not null default false,
  mode text not null default 'manual',
  custom_hours integer,
  running_since timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint desk_schedule_mode_check check (mode in ('manual', 'every-3-hours', 'every-4-hours', 'custom')),
  constraint desk_schedule_custom_check check (custom_hours is null or (custom_hours >= 3 and custom_hours <= 24)),
  constraint desk_schedule_off_by_default check (enabled = false or mode <> 'manual')
);

insert into public.desk_schedule (id, enabled, mode)
values ('default', false, 'manual')
on conflict (id) do nothing;
