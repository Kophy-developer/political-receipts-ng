-- Active discovery stores a conversation understanding.
-- Historical editorial assessment rows and attempts are left in place.

alter table public.ai_attempts drop constraint if exists ai_attempts_task_check;

alter table public.ai_attempts add constraint ai_attempts_task_check check (
  task in ('draft', 'draft_regenerate', 'health', 'extraction', 'editorial', 'understand')
);

alter table public.opportunities add column if not exists understanding jsonb;

comment on column public.opportunities.understanding is
  'Inbox routing for one understood conversation. No API key and no prompt.';
