-- Manual intelligence scan: search configuration, ingested posts, usage, and claim ranking.
-- Search terms are configuration, not demonstration claims.

alter table public.claims add column if not exists importance text;
alter table public.claims add column if not exists importance_reason text;
alter table public.claims add column if not exists verifiability_reason text;
alter table public.claims add column if not exists evidence_needed text;
alter table public.claims add column if not exists ai_confidence text;
alter table public.claims add column if not exists mentioned_entities text[] not null default '{}';

alter table public.conversations add column if not exists post_count integer not null default 0;
alter table public.conversations add column if not exists last_detected_at timestamptz;

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
      and rel.relname = 'claims'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'status'
      and pg_get_constraintdef(con.oid) !~* 'importance|ai_confidence|origin|verification'
  loop
    execute format('alter table public.claims drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.claims drop constraint if exists claims_status_check;
alter table public.claims add constraint claims_status_check check (
  status in ('new', 'researching', 'verified', 'contradicted', 'needs_context', 'unverified', 'dismissed')
);

alter table public.claims drop constraint if exists claims_importance_check;
alter table public.claims add constraint claims_importance_check check (
  importance is null or importance in ('high', 'medium', 'low')
);

alter table public.claims drop constraint if exists claims_ai_confidence_check;
alter table public.claims add constraint claims_ai_confidence_check check (
  ai_confidence is null or ai_confidence in ('low', 'moderate', 'high')
);

create unique index if not exists conversations_external_id_uidx
  on public.conversations (external_id)
  where external_id is not null;

create unique index if not exists claims_post_claim_uidx
  on public.claims (original_post_id, claim_text)
  where original_post_id is not null;

create table if not exists public.search_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  query text not null,
  topic_slug text not null,
  terms text[] not null default '{}',
  anchored_terms text[] not null default '{}',
  kind text not null check (kind in ('topic', 'entity')),
  enabled boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.x_posts (
  id uuid primary key default gen_random_uuid(),
  x_post_id text not null unique,
  text text not null,
  author_id text,
  username text,
  display_name text,
  posted_at timestamptz,
  public_metrics jsonb not null default '{}'::jsonb,
  x_conversation_id text,
  referenced jsonb not null default '[]'::jsonb,
  language text,
  source_query text,
  retrieved_at timestamptz not null default now(),
  relevance text not null default 'not_political' check (relevance in ('political', 'possibly_political', 'not_political')),
  relevance_reason text,
  conversation_id uuid references public.conversations (id) on delete set null,
  scan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists x_posts_retrieved_idx on public.x_posts (retrieved_at desc);
create index if not exists x_posts_conversation_idx on public.x_posts (conversation_id);

create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'completed', 'stopped', 'failed')),
  x_requests integer not null default 0,
  posts_returned integer not null default 0,
  posts_stored integer not null default 0,
  relevant_posts integer not null default 0,
  conversations_created integer not null default 0,
  claims_extracted integer not null default 0,
  gemini_requests integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  error text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scan_runs_one_running_uidx
  on public.scan_runs ((true))
  where status = 'running';

alter table public.x_posts drop constraint if exists x_posts_scan_id_fkey;
alter table public.x_posts
  add constraint x_posts_scan_id_fkey
  foreign key (scan_id) references public.scan_runs (id) on delete set null;

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  provider text not null check (provider in ('x', 'gemini')),
  operation text not null,
  requests integer not null default 1,
  units integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  scan_id uuid references public.scan_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_usage_occurred_idx on public.api_usage (occurred_at desc);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  prompt_version text not null,
  subject_type text,
  subject_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['search_groups', 'x_posts', 'scan_runs', 'api_usage', 'ai_analyses']
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

insert into public.topics (name, slug, origin)
values
  ('Elections', 'desk-elections', 'live'),
  ('National Assembly', 'desk-national-assembly', 'live'),
  ('Federal Government', 'desk-federal-government', 'live'),
  ('Cost of living', 'desk-cost-of-living', 'live'),
  ('Electricity', 'desk-electricity', 'live'),
  ('Security', 'desk-security', 'live'),
  ('Education', 'desk-education', 'live'),
  ('Healthcare', 'desk-healthcare', 'live'),
  ('Public finance', 'desk-public-finance', 'live')
on conflict (slug) do nothing;

insert into public.political_entities (name, slug, kind, origin)
values
  ('INEC', 'desk-inec', 'institution', 'live'),
  ('National Assembly', 'desk-national-assembly-body', 'institution', 'live'),
  ('Presidency', 'desk-presidency', 'office', 'live'),
  ('Federal Government', 'desk-federal-government-body', 'institution', 'live'),
  ('NERC', 'desk-nerc', 'institution', 'live')
on conflict (slug) do nothing;

insert into public.search_groups (name, slug, query, topic_slug, terms, anchored_terms, kind)
values
  (
    'INEC',
    'inec',
    '(INEC OR "Independent National Electoral Commission") (election OR PVC OR voter OR polling OR result) (Nigeria OR Nigerian) -is:retweet',
    'desk-elections',
    array['inec', 'independent national electoral commission', 'pvc'],
    array['inec', 'independent national electoral commission'],
    'entity'
  ),
  (
    '2027 election',
    'election-2027',
    '("2027 election" OR "2027 elections") (Nigeria OR Nigerian OR INEC) -is:retweet',
    'desk-elections',
    array['2027 election', '2027 elections'],
    array[]::text[],
    'topic'
  ),
  (
    'National Assembly',
    'national-assembly',
    '("National Assembly" OR "House of Representatives" OR "Nigerian Senate") (bill OR vote OR budget OR appropriation) -is:retweet',
    'desk-national-assembly',
    array['national assembly', 'house of representatives', 'nigerian senate', 'appropriation'],
    array['nigerian senate'],
    'entity'
  ),
  (
    'Presidency',
    'presidency',
    '("Aso Rock" OR "Federal Government" OR presidency) (Nigeria OR Nigerian) (policy OR budget OR appointment OR executive) -is:retweet',
    'desk-federal-government',
    array['aso rock', 'federal government', 'presidency'],
    array['aso rock'],
    'entity'
  ),
  (
    'Cost of living',
    'cost-of-living',
    '("cost of living" OR inflation OR "fuel price" OR "petrol price") (Nigeria OR Nigerian OR naira) -is:retweet',
    'desk-cost-of-living',
    array['cost of living', 'inflation', 'fuel price', 'petrol price'],
    array[]::text[],
    'topic'
  ),
  (
    'Electricity',
    'electricity',
    '(electricity OR "power supply" OR "national grid" OR NERC) (Nigeria OR Nigerian OR tariff) -is:retweet',
    'desk-electricity',
    array['electricity', 'power supply', 'national grid', 'nerc'],
    array['nerc'],
    'topic'
  ),
  (
    'Security',
    'security',
    '(insecurity OR kidnapping OR banditry OR "security vote") (Nigeria OR Nigerian) -is:retweet',
    'desk-security',
    array['insecurity', 'kidnapping', 'banditry', 'security vote'],
    array[]::text[],
    'topic'
  ),
  (
    'Education',
    'education',
    '(education OR UBEC OR "school fees") (budget OR allocation OR strike) (Nigeria OR Nigerian) -is:retweet',
    'desk-education',
    array['education', 'ubec', 'school fees'],
    array['ubec'],
    'topic'
  ),
  (
    'Healthcare',
    'healthcare',
    '(healthcare OR NHIA OR "primary health") (budget OR allocation OR strike) (Nigeria OR Nigerian) -is:retweet',
    'desk-healthcare',
    array['healthcare', 'nhia', 'primary health'],
    array['nhia'],
    'topic'
  ),
  (
    'Public finance',
    'public-finance',
    '("government spending" OR "public debt" OR "national budget") (Nigeria OR Nigerian) -is:retweet',
    'desk-public-finance',
    array['government spending', 'public debt', 'national budget'],
    array[]::text[],
    'topic'
  )
on conflict (slug) do nothing;
