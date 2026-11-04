-- Four draft styles, plus a manual version, without opening a publish path.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'drafts'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'version|style'
  loop
    execute format('alter table public.drafts drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.drafts add constraint drafts_version_check check (
  version in ('A', 'B', 'C', 'D', 'M')
);

alter table public.drafts add constraint drafts_style_check check (
  style in ('straight', 'conversational', 'strong_hook', 'punchy', 'analytical', 'thread', 'manual')
);

alter table public.drafts add column if not exists selected boolean not null default false;

create unique index if not exists drafts_one_selected
  on public.drafts (claim_id)
  where selected;
