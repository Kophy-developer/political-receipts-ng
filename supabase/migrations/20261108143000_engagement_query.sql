alter table public.desk_schedule
  add column if not exists engagement_metric text not null default 'replies',
  add column if not exists engagement_minimum integer not null default 20;

alter table public.desk_schedule
  drop constraint if exists desk_schedule_engagement_metric_check;

alter table public.desk_schedule
  add constraint desk_schedule_engagement_metric_check
  check (engagement_metric in ('replies', 'likes', 'reposts'));

alter table public.desk_schedule
  drop constraint if exists desk_schedule_engagement_minimum_check;

alter table public.desk_schedule
  add constraint desk_schedule_engagement_minimum_check
  check (engagement_minimum >= 1 and engagement_minimum <= 1000000);
