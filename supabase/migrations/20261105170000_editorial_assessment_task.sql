-- Allow the editorial assessment task to be recorded.
-- Existing attempt rows are not updated or deleted.

alter table public.ai_attempts drop constraint if exists ai_attempts_task_check;

alter table public.ai_attempts add constraint ai_attempts_task_check check (
  task in ('draft', 'draft_regenerate', 'health', 'extraction', 'editorial')
);
