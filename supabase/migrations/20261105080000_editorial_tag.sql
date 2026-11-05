alter table public.published_posts
  add column if not exists editorial_tag text;

alter table public.published_posts
  drop constraint if exists published_posts_editorial_tag_known;

alter table public.published_posts
  add constraint published_posts_editorial_tag_known
  check (
    editorial_tag is null
    or editorial_tag in ('#CheckAm', '#ShowYourWorking', '#NotTrue')
  );

comment on column public.published_posts.editorial_tag is
  'Normalized signature tag read from the approved text. The approved text is not rewritten.';

update public.published_posts as post
set editorial_tag = tagged.tag
from (
  select
    post.id,
    (
      select case lower(found.groups[1])
        when 'checkam' then '#CheckAm'
        when 'showyourworking' then '#ShowYourWorking'
        when 'nottrue' then '#NotTrue'
        else null
      end
      from regexp_matches(approval.approved_text, '#(CheckAm|ShowYourWorking|NotTrue)', 'gi') with ordinality as found(groups, ordinality)
      order by found.ordinality desc
      limit 1
    ) as tag
  from public.published_posts as post
  join public.publish_approvals as approval on approval.id = post.approval_id
) as tagged
where post.id = tagged.id
  and tagged.tag is not null
  and post.editorial_tag is distinct from tagged.tag;
