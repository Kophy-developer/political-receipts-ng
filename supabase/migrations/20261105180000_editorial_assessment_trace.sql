-- Calibration fields for editorial-assess-v1.
-- Existing assessment rows and attempt rows are not rewritten.
-- response stores the parsed reading only. It does not store a key or a prompt.

alter table public.ai_attempts add column if not exists response jsonb;

alter table public.editorial_assessments add column if not exists editorial_basis text;

comment on column public.ai_attempts.response is
  'Parsed structured reading from a successful editorial assessment. No API key, prompt, or authorization header.';
