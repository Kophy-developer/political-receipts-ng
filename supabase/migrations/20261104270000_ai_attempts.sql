-- One row per provider attempt. Credentials are never stored.
-- Several rows may share one request_id when a single editor action falls through a technical failure.

create table if not exists public.ai_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  task text not null,
  provider text not null,
  model text not null,
  status text not null,
  called boolean not null default false,
  failure_reason text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12, 6),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  latency_ms integer not null,
  created_at timestamptz not null default now(),
  constraint ai_attempts_task_check check (task in ('draft', 'draft_regenerate', 'health')),
  constraint ai_attempts_provider_check check (provider in ('groq', 'openrouter', 'gemini')),
  constraint ai_attempts_status_check check (status in ('success', 'failure', 'rejected')),
  constraint ai_attempts_latency_check check (latency_ms >= 0)
);

create index if not exists ai_attempts_completed_idx on public.ai_attempts (completed_at desc);
create index if not exists ai_attempts_request_idx on public.ai_attempts (request_id);

alter table public.ai_attempts enable row level security;
alter table public.ai_attempts force row level security;
revoke all on table public.ai_attempts from anon, authenticated;
grant select, insert, update, delete on table public.ai_attempts to service_role;
