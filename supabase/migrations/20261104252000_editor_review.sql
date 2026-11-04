-- Editor review records a decision without publishing and without rewriting the original post.

alter table public.claims add column if not exists editor_review jsonb;
alter table public.claims add column if not exists verdict_recorded_at timestamptz;
alter table public.claims add column if not exists verdict_recorded_by text;
alter table public.claims add column if not exists verdict_evidence_used jsonb;
alter table public.claims add column if not exists editor_angle text;
alter table public.claims add column if not exists editor_angle_text text;
alter table public.claims add column if not exists editor_take text;
alter table public.claims add column if not exists format_recommendation text;

alter table public.claims drop constraint if exists claims_editor_angle_check;
alter table public.claims add constraint claims_editor_angle_check check (
  editor_angle is null or editor_angle in ('receipts', 'serious', 'trust', 'own')
);

alter table public.claims drop constraint if exists claims_format_recommendation_check;
alter table public.claims add constraint claims_format_recommendation_check check (
  format_recommendation is null or format_recommendation in ('#CheckAm', '#ShowYourWorking')
);
