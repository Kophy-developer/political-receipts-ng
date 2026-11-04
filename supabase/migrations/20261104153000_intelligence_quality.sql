-- Quality pass: desk class, configurable rotation, and named political entities.
-- Does not delete posts, claims, or the existing search groups.

alter table public.x_posts add column if not exists desk_class text;
alter table public.x_posts drop constraint if exists x_posts_desk_class_check;
alter table public.x_posts add constraint x_posts_desk_class_check check (
  desk_class is null or desk_class in ('actionable', 'discussion', 'noise')
);

alter table public.claims add column if not exists desk_class text;
alter table public.claims drop constraint if exists claims_desk_class_check;
alter table public.claims add constraint claims_desk_class_check check (
  desk_class is null or desk_class in ('actionable', 'discussion', 'noise')
);

alter table public.political_entities add column if not exists aliases text[] not null default '{}';

alter table public.search_groups add column if not exists rotation_order integer not null default 100;

insert into public.topics (name, slug, origin)
values
  ('Corruption', 'desk-corruption', 'live'),
  ('Policy', 'desk-policy', 'live'),
  ('Breaking', 'desk-breaking', 'live')
on conflict (slug) do nothing;

insert into public.political_entities (name, slug, kind, origin, aliases)
values
  ('Bola Tinubu', 'desk-bola-tinubu', 'person', 'live', array['Tinubu']),
  ('Peter Obi', 'desk-peter-obi', 'person', 'live', array['Peter Obi']),
  ('Atiku Abubakar', 'desk-atiku-abubakar', 'person', 'live', array['Atiku']),
  ('Pat Utomi', 'desk-pat-utomi', 'person', 'live', array['Utomi']),
  ('APC', 'desk-apc', 'party', 'live', array['All Progressives Congress']),
  ('PDP', 'desk-pdp', 'party', 'live', array['Peoples Democratic Party']),
  ('Labour Party', 'desk-labour-party', 'party', 'live', array['Labour']),
  ('EFCC', 'desk-efcc', 'institution', 'live', array['Economic and Financial Crimes Commission']),
  ('ICPC', 'desk-icpc', 'institution', 'live', array['Independent Corrupt Practices Commission'])
on conflict (slug) do update set
  aliases = excluded.aliases,
  name = excluded.name;

update public.search_groups set
  rotation_order = 1,
  query = '(INEC OR "Independent National Electoral Commission") ("voter register" OR PVC OR "polling unit" OR collation OR result) (Nigeria OR Nigerian) -is:retweet',
  terms = array['inec', 'independent national electoral commission', 'pvc', 'voter register', 'polling unit'],
  anchored_terms = array['inec', 'independent national electoral commission']
where slug = 'inec';

update public.search_groups set
  rotation_order = 2,
  query = '("2027 election" OR "2027 elections") (INEC OR register OR candidate OR result) (Nigeria OR Nigerian) -is:retweet',
  terms = array['2027 election', '2027 elections'],
  anchored_terms = array[]::text[]
where slug = 'election-2027';

update public.search_groups set
  rotation_order = 4,
  query = '("Aso Rock" OR "Federal Government" OR presidency) (Nigeria OR Nigerian) (policy OR budget OR appointment OR executive) -is:retweet',
  terms = array['aso rock', 'federal government', 'presidency'],
  anchored_terms = array['aso rock', 'presidency']
where slug = 'presidency';

update public.search_groups set
  rotation_order = 5,
  query = '("National Assembly" OR "House of Representatives" OR "Nigerian Senate") (bill OR vote OR budget OR appropriation) -is:retweet',
  terms = array['national assembly', 'house of representatives', 'nigerian senate', 'appropriation'],
  anchored_terms = array['nigerian senate', 'national assembly']
where slug = 'national-assembly';

update public.search_groups set
  rotation_order = 6,
  query = '("cost of living" OR inflation OR "fuel price" OR "petrol price" OR subsidy OR naira) (Nigeria OR Nigerian) -is:retweet',
  terms = array['cost of living', 'inflation', 'fuel price', 'petrol price', 'subsidy', 'naira'],
  anchored_terms = array[]::text[]
where slug = 'cost-of-living';

update public.search_groups set
  rotation_order = 7,
  query = '("government spending" OR "public debt" OR "national budget" OR "debt service") (Nigeria OR Nigerian) -is:retweet',
  terms = array['government spending', 'public debt', 'national budget', 'debt service'],
  anchored_terms = array[]::text[]
where slug = 'public-finance';

update public.search_groups set
  rotation_order = 8,
  query = '(insecurity OR kidnapping OR banditry OR "security vote") (Nigeria OR Nigerian) -is:retweet',
  terms = array['insecurity', 'kidnapping', 'banditry', 'security vote'],
  anchored_terms = array[]::text[]
where slug = 'security';

update public.search_groups set
  rotation_order = 12,
  terms = array['electricity', 'power supply', 'national grid', 'nerc'],
  anchored_terms = array['nerc']
where slug = 'electricity';

update public.search_groups set
  rotation_order = 13,
  anchored_terms = array['ubec']
where slug = 'education';

update public.search_groups set
  rotation_order = 14,
  anchored_terms = array['nhia']
where slug = 'healthcare';

insert into public.search_groups (name, slug, query, topic_slug, terms, anchored_terms, kind, rotation_order)
values
  (
    'Candidates and parties',
    'candidates-parties',
    '(Tinubu OR "Peter Obi" OR Atiku OR "Pat Utomi" OR APC OR PDP OR "Labour Party") (Nigeria OR election OR INEC) -is:retweet',
    'desk-elections',
    array['tinubu', 'peter obi', 'atiku', 'pat utomi', 'apc', 'pdp', 'labour party'],
    array['peter obi', 'tinubu', 'atiku', 'pat utomi', 'apc', 'pdp', 'labour party'],
    'entity',
    3
  ),
  (
    'Corruption and accountability',
    'corruption',
    '(EFCC OR ICPC OR embezzlement OR "public funds" OR "anti-corruption") (Nigeria OR Nigerian) -is:retweet',
    'desk-corruption',
    array['efcc', 'icpc', 'embezzlement', 'public funds', 'anti-corruption'],
    array['efcc', 'icpc'],
    'topic',
    9
  ),
  (
    'Policy announcements',
    'policy-announcements',
    '("executive order" OR "Federal Executive Council" OR "policy announcement") (Nigeria OR Nigerian OR presidency) -is:retweet',
    'desk-policy',
    array['executive order', 'federal executive council', 'policy announcement'],
    array['federal executive council'],
    'topic',
    10
  ),
  (
    'Breaking political stories',
    'breaking',
    '(breaking OR "just in") (INEC OR presidency OR Tinubu OR "Peter Obi" OR APC) (Nigeria OR Nigerian) -is:retweet',
    'desk-breaking',
    array['inec', 'presidency', 'tinubu', 'peter obi'],
    array['inec', 'presidency', 'tinubu', 'peter obi'],
    'topic',
    11
  )
on conflict (slug) do update set
  query = excluded.query,
  topic_slug = excluded.topic_slug,
  terms = excluded.terms,
  anchored_terms = excluded.anchored_terms,
  rotation_order = excluded.rotation_order,
  enabled = true;
