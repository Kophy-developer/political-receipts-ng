create table if not exists public.structured_series_cache (
  id uuid primary key default gen_random_uuid(),
  dataset_id text not null,
  indicator text not null,
  country text not null,
  unit text not null,
  basis text not null,
  source_name text not null,
  page_url text not null,
  request_url text not null,
  source_updated text,
  retrieved_at timestamptz,
  data_version text not null,
  completeness text not null,
  origin text not null,
  stale boolean not null default false,
  label text not null,
  years integer[] not null,
  observations jsonb not null,
  original_response jsonb not null,
  created_at timestamptz not null default now(),
  unique (dataset_id, data_version)
);

create index if not exists structured_series_cache_dataset_idx
  on public.structured_series_cache (dataset_id, created_at desc);
