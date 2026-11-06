-- Let investment research open World Bank and UNCTAD pages that are already public statistics.
-- Existing source rows and research history are left in place.

update public.source_tiers
set domains = (
  select array(
    select distinct domain
    from unnest(domains || array['data.worldbank.org', 'unctad.org']::text[]) as domain
    where domain is not null and domain <> ''
  )
)
where pillar = 'politics'
  and rank = 1
  and not (domains @> array['unctad.org']::text[]);
