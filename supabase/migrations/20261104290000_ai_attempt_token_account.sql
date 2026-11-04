-- Reasoning and total tokens are recorded beside the existing prompt and completion counts.
-- Existing rows are left as they are. Null means that attempt did not store the figure.

alter table public.ai_attempts add column if not exists reasoning_tokens integer;
alter table public.ai_attempts add column if not exists total_tokens integer;
