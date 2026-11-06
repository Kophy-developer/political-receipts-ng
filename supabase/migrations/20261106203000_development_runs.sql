-- One development record per opportunity. Existing rows are not rewritten.
-- The column stays null until an editor starts Develop content.

alter table public.opportunities add column if not exists development jsonb;

comment on column public.opportunities.development is
  'Resumable Research, angle, and draft state. Null until an editor starts development. Publishing is not stored here.';
