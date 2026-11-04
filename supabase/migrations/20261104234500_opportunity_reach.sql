alter table public.opportunities
  add column if not exists post_count integer,
  add column if not exists account_count integer;

alter table public.opportunities
  drop constraint if exists opportunities_post_count_check;

alter table public.opportunities
  add constraint opportunities_post_count_check check (post_count is null or post_count >= 0);

alter table public.opportunities
  drop constraint if exists opportunities_account_count_check;

alter table public.opportunities
  add constraint opportunities_account_count_check check (account_count is null or account_count >= 0);
