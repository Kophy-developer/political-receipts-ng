-- Opportunity-first assessments. Historical opportunity rows are not deleted or rewritten.

create table if not exists public.editorial_assessments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  scan_id uuid references public.scan_runs (id) on delete set null,
  version integer not null check (version > 0),
  worth_talking_about boolean not null,
  opportunity_type text check (opportunity_type is null or opportunity_type in (
    'reaction', 'opinion', 'check', 'analysis', 'original_insight', 'humour', 'question'
  )),
  priority text check (priority is null or priority in ('high', 'medium', 'low')),
  research_need text check (research_need is null or research_need in ('yes', 'recommended', 'no')),
  timeliness text not null check (timeliness in ('high', 'medium', 'low')),
  possible_angle text not null default '',
  reason text not null,
  pass_reason text,
  claim_extraction_needed boolean not null default false,
  content_score numeric,
  queue_rank integer,
  lifecycle text not null check (lifecycle in (
    'DISCOVERED', 'ASSESSED', 'RANKED', 'RESEARCHING', 'EVIDENCE_READY',
    'ANGLE_READY', 'DRAFTING', 'READY_FOR_EDITOR', 'APPROVED', 'PUBLISHED', 'PASSED'
  )),
  next_stage text check (next_stage is null or next_stage in (
    'DISCOVERED', 'ASSESSED', 'RANKED', 'RESEARCHING', 'EVIDENCE_READY',
    'ANGLE_READY', 'DRAFTING', 'READY_FOR_EDITOR', 'APPROVED', 'PUBLISHED', 'PASSED'
  )),
  discovered_at timestamptz not null default now(),
  source text not null default 'rules' check (source in ('rules', 'model')),
  model_called boolean not null default false,
  x_requests integer not null default 0 check (x_requests = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editorial_assessments_scan_idx
  on public.editorial_assessments (scan_id, conversation_id, version desc);

alter table public.opportunities drop constraint if exists opportunities_source_check;
alter table public.opportunities add constraint opportunities_source_check
  check (source in ('rules', 'model', 'manual', 'assessment'));

alter table public.opportunities add column if not exists lifecycle text;
alter table public.opportunities drop constraint if exists opportunities_lifecycle_check;
alter table public.opportunities add constraint opportunities_lifecycle_check check (
  lifecycle is null or lifecycle in (
    'DISCOVERED', 'ASSESSED', 'RANKED', 'RESEARCHING', 'EVIDENCE_READY',
    'ANGLE_READY', 'DRAFTING', 'READY_FOR_EDITOR', 'APPROVED', 'PUBLISHED', 'PASSED'
  )
);

alter table public.opportunities add column if not exists queue_rank integer;
alter table public.opportunities add column if not exists timeliness text;
alter table public.opportunities add column if not exists priority text;
alter table public.opportunities add column if not exists claim_extraction_needed boolean;
alter table public.opportunities add column if not exists pass_reason text;
alter table public.opportunities add column if not exists content_score numeric;
alter table public.opportunities add column if not exists assessment_version integer;
alter table public.opportunities add column if not exists discovered_at timestamptz;
alter table public.opportunities add column if not exists possible_angle text;

alter table public.opportunities drop constraint if exists opportunities_timeliness_check;
alter table public.opportunities add constraint opportunities_timeliness_check
  check (timeliness is null or timeliness in ('high', 'medium', 'low'));

alter table public.opportunities drop constraint if exists opportunities_priority_check;
alter table public.opportunities add constraint opportunities_priority_check
  check (priority is null or priority in ('high', 'medium', 'low'));

create index if not exists opportunities_lifecycle_idx
  on public.opportunities (lifecycle, queue_rank);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'public.editorial_assessments'::regclass
  ) then
    create trigger set_updated_at before update on public.editorial_assessments
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.editorial_assessments enable row level security;
alter table public.editorial_assessments force row level security;
revoke all on table public.editorial_assessments from anon, authenticated;
grant select, insert, update, delete on table public.editorial_assessments to service_role;
