-- Evidence engine and the three content pillars.
-- Search groups stay political. Football and finance are not X queries.

create table if not exists public.content_pillars (
  slug text primary key check (slug in ('politics', 'football', 'finance')),
  name text not null,
  target_share integer not null check (target_share between 0 and 100),
  brief text not null,
  voice_note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_tiers (
  id uuid primary key default gen_random_uuid(),
  pillar text not null references public.content_pillars (slug),
  rank integer not null check (rank between 1 and 4),
  name text not null,
  notes text not null,
  domains text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pillar, rank)
);

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  status text not null check (status in ('planned', 'completed', 'stopped', 'failed')),
  provider text,
  max_operations integer not null default 0,
  operations_used integer not null default 0,
  documents_retrieved integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_runs_claim_idx on public.research_runs (claim_id, started_at desc);

alter table public.claims add column if not exists content_pillar text;
alter table public.claims add column if not exists statement_kind text;
alter table public.claims add column if not exists claim_types text[] not null default '{}';
alter table public.claims add column if not exists research_questions text[] not null default '{}';
alter table public.claims add column if not exists attribution_note text;
alter table public.claims add column if not exists proposed_verdict text;
alter table public.claims add column if not exists verdict_reasoning text;
alter table public.claims add column if not exists verdict_caveats text;
alter table public.claims add column if not exists verdict_unknown text;
alter table public.claims add column if not exists verdict_confidence text;
alter table public.claims add column if not exists working_notes text;

alter table public.claims drop constraint if exists claims_content_pillar_check;
alter table public.claims add constraint claims_content_pillar_check check (
  content_pillar is null or content_pillar in ('politics', 'football', 'finance')
);
alter table public.claims drop constraint if exists claims_statement_kind_check;
alter table public.claims add constraint claims_statement_kind_check check (
  statement_kind is null or statement_kind in ('fact', 'analysis', 'opinion')
);
alter table public.claims drop constraint if exists claims_proposed_verdict_check;
alter table public.claims add constraint claims_proposed_verdict_check check (
  proposed_verdict is null or proposed_verdict in (
    'SUPPORTED', 'CONTRADICTED', 'MISLEADING', 'NEEDS CONTEXT', 'UNVERIFIED', 'INSUFFICIENT EVIDENCE'
  )
);
alter table public.claims drop constraint if exists claims_verdict_confidence_check;
alter table public.claims add constraint claims_verdict_confidence_check check (
  verdict_confidence is null or verdict_confidence in ('low', 'moderate', 'high')
);

alter table public.x_posts add column if not exists content_pillar text;
alter table public.x_posts drop constraint if exists x_posts_content_pillar_check;
alter table public.x_posts add constraint x_posts_content_pillar_check check (
  content_pillar is null or content_pillar in ('politics', 'football', 'finance')
);
update public.x_posts set content_pillar = 'politics' where content_pillar is null;

alter table public.drafts add column if not exists content_pillar text;

alter table public.sources add column if not exists domain text;
alter table public.sources add column if not exists pillar text;
alter table public.sources add column if not exists tier_rank integer;

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
      and rel.relname = 'evidence'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'stance'
  loop
    execute format('alter table public.evidence drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.evidence drop constraint if exists evidence_stance_check;
alter table public.evidence add constraint evidence_stance_check check (
  stance in ('supports', 'contradicts', 'contextualizes', 'attribution_only')
);

alter table public.evidence add column if not exists review_status text not null default 'proposed';
alter table public.evidence drop constraint if exists evidence_review_status_check;
alter table public.evidence add constraint evidence_review_status_check check (
  review_status in ('proposed', 'accepted', 'rejected')
);
alter table public.evidence add column if not exists reliability_notes text;

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
  provider in ('x', 'gemini', 'search', 'retrieval')
);

update public.claims
set content_pillar = 'politics',
    statement_kind = coalesce(statement_kind, 'fact')
where content_pillar is null;

insert into public.content_pillars (slug, name, target_share, brief, voice_note)
values
  (
    'politics',
    'Politics and public affairs',
    60,
    'Nigerian politics, elections, policy, public money, institutions, and checkable claims. Evidence stays strict.',
    'Curious and willing to be plain. A political post can be sharp, but a factual verdict still needs a record.'
  ),
  (
    'football',
    'Manchester United',
    20,
    'Manchester United first: matches, players, the manager, transfers, and league news that actually touches the club.',
    'A supporter, not a second newsroom. Humour, frustration, and a prediction are allowed. A scoreline is still a fact.'
  ),
  (
    'finance',
    'Finance and economics',
    20,
    'Banking, rates, inflation, the naira, statements, and literacy. Knowledgeable, and not personal financial advice.',
    'Comfortable with the working. Separate a fact, an analysis, and an opinion. Do not promise an outcome.'
  )
on conflict (slug) do update set
  name = excluded.name,
  target_share = excluded.target_share,
  brief = excluded.brief,
  voice_note = excluded.voice_note;

insert into public.source_tiers (pillar, rank, name, notes, domains)
values
  ('politics', 1, 'Primary record', 'The office that owns the figure or the decision. Social posts do not sit here.', array['inecnigeria.org','nigerianstat.gov.ng','cbn.gov.ng','budgetoffice.gov.ng','dmo.gov.ng','nass.gov.ng','finance.gov.ng','statehouse.gov.ng']),
  ('politics', 2, 'Independent reporting', 'Wire services and established national reporting. Useful, and not a substitute for the primary table.', array['reuters.com','apnews.com','bbc.com','bbc.co.uk']),
  ('politics', 3, 'Specialist verification', 'Organisations whose job is to check a claim against a record.', array['africacheck.org']),
  ('politics', 4, 'Context', 'Other credible material. A social post can show what spread. It cannot settle the fact.', array[]::text[]),
  ('football', 1, 'Club and competition record', 'Manchester United, the Premier League, UEFA, and the FA. Not a government gazette.', array['manutd.com','premierleague.com','uefa.com','thefa.com']),
  ('football', 2, 'Match reporting', 'Reporting of a match or a club decision. Opinion columns stay labelled as opinion.', array['bbc.com','skysports.com']),
  ('football', 3, 'Match data', 'Statistics providers. Cite them for a number, not as the club speaking.', array['fbref.com']),
  ('football', 4, 'Fan context', 'Reaction and colour. It does not prove a score, a fee, or a contract.', array[]::text[]),
  ('finance', 1, 'Official market and macro record', 'The institution that publishes the rate, the index, the debt figure, or the filing.', array['cbn.gov.ng','nigerianstat.gov.ng','dmo.gov.ng','budgetoffice.gov.ng','sec.gov.ng','ngxgroup.com','imf.org','worldbank.org']),
  ('finance', 2, 'Market reporting', 'Reporting of a release or a market move. Not a buy or sell instruction.', array['reuters.com','ft.com']),
  ('finance', 3, 'Professional reference', 'CFA and ICAN material for a concept. It is education, not advice to a named person.', array['cfainstitute.org','icanig.org']),
  ('finance', 4, 'Context', 'Explainers and commentary. An opinion about a market is not a guaranteed result.', array[]::text[])
on conflict (pillar, rank) do update set
  name = excluded.name,
  notes = excluded.notes,
  domains = excluded.domains;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['content_pillars', 'source_tiers', 'research_runs']
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
