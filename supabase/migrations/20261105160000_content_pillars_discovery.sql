-- Pillar on discovery groups and published posts.
-- Existing politics queries are labelled, not rewritten.
-- Published text is not touched.

alter table public.search_groups
  add column if not exists content_pillar text;

alter table public.search_groups
  drop constraint if exists search_groups_content_pillar_check;

alter table public.search_groups
  add constraint search_groups_content_pillar_check
  check (content_pillar is null or content_pillar in ('politics', 'football', 'finance'));

update public.search_groups
set content_pillar = 'politics'
where content_pillar is null;

alter table public.published_posts
  add column if not exists content_pillar text;

alter table public.published_posts
  drop constraint if exists published_posts_content_pillar_check;

alter table public.published_posts
  add constraint published_posts_content_pillar_check
  check (content_pillar is null or content_pillar in ('politics', 'football', 'finance'));

update public.published_posts as post
set content_pillar = draft.content_pillar
from public.drafts as draft
where post.draft_id = draft.id
  and post.content_pillar is null
  and draft.content_pillar is not null;

update public.published_posts as post
set content_pillar = claim.content_pillar
from public.drafts as draft
join public.claims as claim on claim.id = draft.claim_id
where post.draft_id = draft.id
  and post.content_pillar is null
  and claim.content_pillar is not null;

update public.drafts as draft
set content_pillar = claim.content_pillar
from public.claims as claim
where draft.claim_id = claim.id
  and draft.content_pillar is null
  and claim.content_pillar is not null;

update public.claims
set content_pillar = 'politics'
where content_pillar is null;

insert into public.search_groups (name, slug, query, topic_slug, terms, anchored_terms, kind, rotation_order, content_pillar)
values
  (
    'CBN and the naira',
    'finance-cbn',
    '(CBN OR "Central Bank of Nigeria" OR naira OR MPR) (inflation OR forex OR "interest rate" OR "monetary policy") -is:retweet',
    'desk-finance',
    array['cbn', 'naira', 'mpr', 'inflation', 'interest rate'],
    array['cbn', 'naira'],
    'topic',
    201,
    'finance'
  ),
  (
    'Debt and the budget',
    'finance-debt',
    '(DMO OR "debt service" OR "public debt" OR "Budget Office" OR appropriation) (Nigeria OR budget OR borrowing) -is:retweet',
    'desk-finance',
    array['dmo', 'public debt', 'budget office', 'appropriation'],
    array['dmo', 'budget office'],
    'topic',
    202,
    'finance'
  ),
  (
    'Markets and banking',
    'finance-markets',
    '(NGX OR "Central Bank" OR SEC OR banking OR "foreign investment") (Nigeria OR shares OR market) -is:retweet',
    'desk-finance',
    array['ngx', 'sec', 'banking', 'foreign investment'],
    array['ngx', 'sec'],
    'topic',
    203,
    'finance'
  ),
  (
    'Global economy, when it reaches us',
    'finance-global',
    '(IMF OR "World Bank" OR "oil price" OR recession) (Nigeria OR naira OR economy) -is:retweet',
    'desk-finance',
    array['imf', 'world bank', 'oil price'],
    array['imf', 'world bank'],
    'topic',
    204,
    'finance'
  ),
  (
    'Match',
    'united-match',
    '("Manchester United" OR #MUFC OR #GGMU) (goal OR match OR "Premier League" OR scored OR lineup) -is:retweet',
    'desk-manchester-united',
    array['manchester united', 'mufc', 'premier league', 'goal'],
    array['manchester united'],
    'topic',
    301,
    'football'
  ),
  (
    'Team and manager',
    'united-team',
    '("Manchester United" OR #MUFC) (manager OR tactic OR injury OR "Old Trafford" OR Amorim) -is:retweet',
    'desk-manchester-united',
    array['manchester united', 'manager', 'injury', 'old trafford'],
    array['manchester united'],
    'topic',
    302,
    'football'
  ),
  (
    'Club news',
    'united-club',
    '("Manchester United" OR #MUFC) (transfer OR signing OR contract OR "club statement") -is:retweet',
    'desk-manchester-united',
    array['manchester united', 'transfer', 'contract'],
    array['manchester united'],
    'topic',
    303,
    'football'
  )
on conflict (slug) do nothing;
