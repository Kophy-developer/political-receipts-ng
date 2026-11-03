-- Political Receipts NG editorial schema.
-- The browser never writes these tables. The anon and authenticated roles
-- have no privileges. The Next.js server uses the service role.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.editor_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text unique,
  role text not null default 'editor',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.x_connections (
  id uuid primary key default gen_random_uuid(),
  editor_id uuid references public.editor_profiles (id) on delete set null,
  x_user_id text not null,
  username text not null,
  display_name text not null,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'revoked', 'error')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint x_connections_user_unique unique (x_user_id),
  constraint x_connections_ciphertext_when_connected check (
    status <> 'connected'
    or (access_token_encrypted is not null and refresh_token_encrypted is not null)
  )
);

comment on column public.x_connections.access_token_encrypted is
  'AES-256-GCM ciphertext. Never a raw token. Never selectable by the anon key.';
comment on column public.x_connections.refresh_token_encrypted is
  'AES-256-GCM ciphertext. Never a raw token. Never selectable by the anon key.';

create table public.political_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null default 'other' check (kind in ('person', 'party', 'office', 'institution', 'other')),
  status text not null default 'active' check (status in ('active', 'archived')),
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'archived')),
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics (id) on delete set null,
  title text not null,
  summary text not null,
  narrative text[] not null default '{}',
  platform text not null default 'x',
  external_id text,
  status text not null default 'open' check (status in ('open', 'watching', 'closed')),
  started_at timestamptz,
  engagement jsonb not null default '{}'::jsonb,
  desk_note text,
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_topic_idx on public.conversations (topic_id);
create index conversations_status_idx on public.conversations (status);
create index conversations_started_idx on public.conversations (started_at desc);

create table public.conversation_entities (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  entity_id uuid not null references public.political_entities (id) on delete cascade,
  primary key (conversation_id, entity_id)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  claim_text text not null,
  original_post_id text,
  original_post_url text,
  original_author text,
  original_author_username text,
  original_author_role text,
  original_post_text text,
  detected_at timestamptz,
  engagement jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (
    status in ('new', 'researching', 'verified', 'contradicted', 'needs_context', 'unverified')
  ),
  verification_confidence text check (verification_confidence in ('low', 'moderate', 'high')),
  editor_notes text,
  suggested_hashtag text,
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_status_idx on public.claims (status);
create index claims_detected_idx on public.claims (detected_at desc);
create index claims_topic_idx on public.claims (topic_id);
create index claims_conversation_idx on public.claims (conversation_id);
create index claims_origin_idx on public.claims (origin);

create table public.claim_entities (
  claim_id uuid not null references public.claims (id) on delete cascade,
  entity_id uuid not null references public.political_entities (id) on delete cascade,
  primary key (claim_id, entity_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  title text not null,
  url text,
  published_on date,
  published_label text,
  category text not null,
  reliability text not null check (reliability in ('high', 'substantial', 'moderate', 'low')),
  retrieved_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sources_category_idx on public.sources (category);
create index sources_organization_idx on public.sources (organization);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  excerpt text not null,
  stance text not null check (stance in ('supports', 'contradicts', 'contextualizes')),
  editor_notes text,
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index evidence_claim_idx on public.evidence (claim_id);
create index evidence_source_idx on public.evidence (source_id);
create index evidence_stance_idx on public.evidence (stance);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  version text not null check (version in ('A', 'B', 'C')),
  content text not null,
  content_hash text not null,
  style text not null check (style in ('straight', 'conversational', 'strong_hook')),
  suggested_hashtag text,
  character_count integer not null check (character_count >= 0),
  ai_provider text,
  ai_model text,
  generation_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'ready', 'held', 'edited', 'rejected', 'superseded')),
  editor_modified boolean not null default false,
  origin text not null default 'live' check (origin in ('demo', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drafts_claim_version_unique unique (claim_id, version)
);

create index drafts_claim_idx on public.drafts (claim_id);
create index drafts_status_idx on public.drafts (status);

create table public.editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  reviewer_id uuid references public.editor_profiles (id) on delete set null,
  reviewer_name text not null,
  checklist jsonb not null,
  notes text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editorial_reviews_draft_idx on public.editorial_reviews (draft_id);

create table public.publish_approvals (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  review_id uuid not null references public.editorial_reviews (id) on delete cascade,
  approved_text text not null,
  approved_text_hash text not null,
  draft_content_hash text not null,
  reviewer_name text not null,
  status text not null default 'active' check (status in ('active', 'invalidated', 'published')),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index publish_approvals_one_active
  on public.publish_approvals (draft_id)
  where status = 'active';

create index publish_approvals_draft_idx on public.publish_approvals (draft_id);
create index publish_approvals_status_idx on public.publish_approvals (status);

create table public.published_posts (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null unique references public.publish_approvals (id) on delete restrict,
  draft_id uuid not null references public.drafts (id) on delete restrict,
  x_post_id text unique,
  x_post_url text,
  published_at timestamptz,
  publishing_account text,
  response_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'published', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index published_posts_status_idx on public.published_posts (status);
create index published_posts_published_idx on public.published_posts (published_at desc);

create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  published_post_id uuid not null references public.published_posts (id) on delete cascade,
  captured_at timestamptz not null default now(),
  impressions integer check (impressions is null or impressions >= 0),
  likes integer check (likes is null or likes >= 0),
  reposts integer check (reposts is null or reposts >= 0),
  replies integer check (replies is null or replies >= 0),
  bookmarks integer check (bookmarks is null or bookmarks >= 0),
  source text not null default 'manual' check (source in ('manual', 'x_api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_metrics_post_idx on public.post_metrics (published_post_id, captured_at desc);

create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  action text not null,
  actor text not null,
  subject_type text,
  subject_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index system_events_occurred_idx on public.system_events (occurred_at desc);
create index system_events_action_idx on public.system_events (action);

-- Touch updated_at on every editorial table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'editor_profiles',
    'x_connections',
    'political_entities',
    'topics',
    'conversations',
    'claims',
    'sources',
    'evidence',
    'drafts',
    'editorial_reviews',
    'publish_approvals',
    'published_posts',
    'post_metrics',
    'system_events'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- Deny the public Data API. No policies are created for anon or authenticated.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'editor_profiles',
    'x_connections',
    'political_entities',
    'topics',
    'conversations',
    'conversation_entities',
    'claims',
    'claim_entities',
    'sources',
    'evidence',
    'drafts',
    'editorial_reviews',
    'publish_approvals',
    'published_posts',
    'post_metrics',
    'system_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;
