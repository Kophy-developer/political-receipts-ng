-- Canonical research plans and provider-quality counts.
-- Existing evidence rows, research runs, and verdicts are left as they are.

alter table public.claims add column if not exists research_plan jsonb;

alter table public.research_runs add column if not exists plan_hash text;
alter table public.research_runs add column if not exists stage text;

alter table public.evidence add column if not exists research_problem text;
alter table public.evidence add column if not exists usage_id uuid;

alter table public.api_usage add column if not exists target_tier text;
alter table public.api_usage add column if not exists target_domains text[];
alter table public.api_usage add column if not exists results_returned integer;
alter table public.api_usage add column if not exists in_domain_results integer;
alter table public.api_usage add column if not exists out_of_domain_results integer;
alter table public.api_usage add column if not exists documents_selected integer;
alter table public.api_usage add column if not exists primary_sources_found integer;
alter table public.api_usage add column if not exists editor_accepted integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'evidence_usage_id_fkey') then
    alter table public.evidence
      add constraint evidence_usage_id_fkey
      foreign key (usage_id) references public.api_usage (id) on delete set null;
  end if;
end $$;
