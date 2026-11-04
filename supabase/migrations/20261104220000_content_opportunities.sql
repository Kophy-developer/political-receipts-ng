-- Content opportunities. X search groups stay political.
-- Research usage can name Tavily and Brave separately.

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete set null,
  content_pillar text not null default 'politics' check (content_pillar in ('politics', 'football', 'finance')),
  opportunity_type text not null check (opportunity_type in (
    'reaction', 'opinion', 'check', 'analysis', 'original_insight', 'humour', 'question'
  )),
  research_required text not null check (research_required in ('yes', 'recommended', 'no')),
  score text not null check (score in ('high', 'medium', 'low')),
  score_reason text not null,
  what_happened text not null,
  why_interesting text not null,
  what_could_add text not null,
  angles jsonb not null default '[]'::jsonb,
  research_questions text[] not null default '{}',
  voice text not null check (voice in ('fact', 'analysis', 'opinion', 'prediction', 'humour')),
  status text not null default 'open' check (status in ('open', 'talk', 'ignored', 'research', 'saved')),
  editor_angle text,
  editor_take text,
  source text not null check (source in ('rules', 'model', 'manual')),
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_status_idx on public.opportunities (status, created_at desc);
create index if not exists opportunities_conversation_idx on public.opportunities (conversation_id);

create unique index if not exists opportunities_rules_uidx
  on public.opportunities (conversation_id, opportunity_type)
  where source = 'rules';

create table if not exists public.opportunity_reviews (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  model_status text not null check (model_status in ('unavailable', 'not_requested', 'failed', 'completed')),
  rules_status text not null check (rules_status in ('filed', 'nothing_to_say')),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunity_reviews_conversation_idx
  on public.opportunity_reviews (conversation_id, created_at desc);

alter table public.api_usage add column if not exists selection_reason text;
alter table public.api_usage add column if not exists fallback_reason text;
alter table public.api_usage add column if not exists credits_reported integer;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'api_usage'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.api_usage drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.api_usage add constraint api_usage_provider_check check (
  provider in ('x', 'gemini', 'search', 'retrieval', 'tavily', 'brave')
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['opportunities', 'opportunity_reviews']
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'set_updated_at' and tgrelid = ('public.' || table_name)::regclass
    ) then
      execute format(
        'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        table_name
      );
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;
