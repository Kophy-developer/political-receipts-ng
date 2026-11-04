-- Search inventory is the list a provider already returned.
-- A row here is not evidence. Retrieval status records whether the page was opened later.

create table if not exists public.search_results (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs (id) on delete cascade,
  claim_id uuid not null references public.claims (id) on delete cascade,
  usage_id uuid references public.api_usage (id) on delete set null,
  provider text not null,
  question text not null,
  query text not null,
  result_rank integer not null check (result_rank > 0),
  title text not null default '',
  url text not null,
  domain text,
  snippet text,
  published_label text,
  target_tier text,
  in_domain boolean not null,
  retrieval_status text not null default 'not_retrieved',
  rejection_reason text,
  relevance_score integer not null default 0,
  relevance_reason text,
  recommended boolean not null default false,
  created_at timestamptz not null default now(),
  constraint search_results_status_check check (
    retrieval_status in ('not_retrieved', 'retrieved', 'rejected', 'failed')
  ),
  constraint search_results_run_query_rank unique (research_run_id, query, result_rank)
);

create index if not exists search_results_claim_idx on public.search_results (claim_id, created_at);
create index if not exists search_results_run_idx on public.search_results (research_run_id);

alter table public.evidence add column if not exists page_label text;
alter table public.evidence add column if not exists research_question text;
