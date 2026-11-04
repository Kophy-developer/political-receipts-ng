-- Optional diagnostic for a failed attempt. Existing rows are left as they were.
-- The column never stores an API key, authorization header, or cookie.

alter table public.ai_attempts add column if not exists diagnostic jsonb;
