-- Progress for a saved-scan reprocess. Existing ai_attempts rows are not modified.

create table if not exists public.reprocess_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scan_runs (id) on delete cascade,
  request_id uuid not null unique,
  phase text not null check (phase in ('preparing', 'extraction', 'classifying', 'opportunities', 'complete', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  posts integer not null default 0,
  conversations integer not null default 0,
  opportunities integer not null default 0,
  provider text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reprocess_jobs_one_active_uidx
  on public.reprocess_jobs (scan_id)
  where phase in ('preparing', 'extraction', 'classifying', 'opportunities');

create index if not exists reprocess_jobs_scan_idx on public.reprocess_jobs (scan_id, started_at desc);

alter table public.opportunities add column if not exists scan_id uuid references public.scan_runs (id) on delete set null;
create index if not exists opportunities_scan_idx on public.opportunities (scan_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at' and tgrelid = 'public.reprocess_jobs'::regclass
  ) then
    create trigger set_updated_at before update on public.reprocess_jobs
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.reprocess_jobs enable row level security;
alter table public.reprocess_jobs force row level security;
revoke all on table public.reprocess_jobs from anon, authenticated;
grant select, insert, update, delete on table public.reprocess_jobs to service_role;

-- Display rows for the two reprocess clicks that already finished.
-- The attempt ledger is left exactly as stored.
insert into public.reprocess_jobs (
  scan_id, request_id, phase, started_at, finished_at, posts, conversations, opportunities, provider, steps
)
values
  (
    '6dc2ba15-f367-4e35-a715-f18f5f507157',
    'ef5ea219-f11c-4c0a-b643-9a8e3dc7b428',
    'failed',
    '2026-11-05T08:45:21.824+00',
    '2026-11-05T08:45:44.873+00',
    10, 10, 0, 'gemini',
    '[
      {"provider":"groq","state":"failed","classification":"BAD_REQUEST"},
      {"provider":"openrouter","state":"failed","classification":"OUTPUT_TOKEN_LIMIT"},
      {"provider":"gemini","state":"failed","classification":"PROVIDER_SERVER_ERROR"}
    ]'::jsonb
  ),
  (
    '6dc2ba15-f367-4e35-a715-f18f5f507157',
    '08e428c8-5149-44f3-ab8a-2b2caa52b02e',
    'failed',
    '2026-11-05T11:08:56.72+00',
    '2026-11-05T11:09:25.041+00',
    10, 10, 0, 'gemini',
    '[
      {"provider":"groq","state":"failed","classification":"BAD_REQUEST"},
      {"provider":"openrouter","state":"failed","classification":"INVALID_RESPONSE"},
      {"provider":"gemini","state":"failed","classification":"PROVIDER_SERVER_ERROR"}
    ]'::jsonb
  )
on conflict (request_id) do nothing;
