-- Extraction attempts are a separate task. Existing draft and health rows are not rewritten.
alter table public.ai_attempts drop constraint if exists ai_attempts_task_check;
alter table public.ai_attempts add constraint ai_attempts_task_check check (
  task in ('draft', 'draft_regenerate', 'health', 'extraction')
);

-- A saved X retrieval stays reusable when the later analysis does not finish.
alter table public.scan_runs add column if not exists stage text;
alter table public.scan_runs drop constraint if exists scan_runs_stage_check;
alter table public.scan_runs add constraint scan_runs_stage_check check (
  stage is null or stage in ('X_RETRIEVAL_COMPLETE', 'AI_PROCESSING', 'COMPLETE', 'PARTIAL_FAILURE')
);

-- The production scan that stored 10 posts and then timed out during extraction.
-- The error text, token counts, posts, and historical usage rows are left as they are.
update public.scan_runs
set stage = 'PARTIAL_FAILURE'
where id = '6dc2ba15-f367-4e35-a715-f18f5f507157'
  and stage is null;
