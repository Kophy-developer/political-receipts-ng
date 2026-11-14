create table if not exists public.publisher_notifications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  kind text not null default 'ready_for_editor'
    check (kind in ('ready_for_editor')),
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint publisher_notifications_opportunity_kind unique (opportunity_id, kind)
);

create index if not exists publisher_notifications_unread_idx
  on public.publisher_notifications (created_at desc)
  where read_at is null;

create or replace function public.notify_ready_for_editor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lifecycle = 'READY_FOR_EDITOR'
     and (tg_op = 'INSERT' or old.lifecycle is distinct from 'READY_FOR_EDITOR') then
    insert into public.publisher_notifications (opportunity_id, kind, title, body)
    values (
      new.id,
      'ready_for_editor',
      'Draft ready for approval',
      coalesce(nullif(trim(new.what_happened), ''), 'A draft is waiting on the Approve queue.')
    )
    on conflict (opportunity_id, kind) do update
      set title = excluded.title,
          body = excluded.body,
          read_at = null,
          created_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_ready_for_editor_notify on public.opportunities;
create trigger opportunities_ready_for_editor_notify
  after insert or update of lifecycle on public.opportunities
  for each row
  execute function public.notify_ready_for_editor();

alter table public.publisher_notifications enable row level security;

revoke all on table public.publisher_notifications from anon, authenticated;

grant select on table public.publisher_notifications to anon, authenticated;

create policy publisher_notifications_select
  on public.publisher_notifications
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'publisher_notifications'
    ) then
      alter publication supabase_realtime add table public.publisher_notifications;
    end if;
  end if;
end $$;
