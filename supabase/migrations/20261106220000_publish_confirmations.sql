-- One publish confirmation can be claimed once, on any server.
-- The approval row remains the exact-text record. This table only spends the nonce.

create table if not exists public.publish_confirmations (
  nonce text primary key,
  approval_id uuid not null references public.publish_approvals (id) on delete restrict,
  claimed_at timestamptz not null default now()
);

create index if not exists publish_confirmations_approval_idx
  on public.publish_confirmations (approval_id);

alter table public.publish_confirmations enable row level security;

revoke all on table public.publish_confirmations from anon, authenticated;
