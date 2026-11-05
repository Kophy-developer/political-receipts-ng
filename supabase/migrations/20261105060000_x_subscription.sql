alter table public.x_connections
  add column if not exists subscription_type text,
  add column if not exists subscription_checked_at timestamptz;

alter table public.x_connections
  drop constraint if exists x_connections_subscription_type_known;

alter table public.x_connections
  add constraint x_connections_subscription_type_known
  check (
    subscription_type is null
    or subscription_type in ('None', 'Basic', 'Premium', 'PremiumPlus')
  );

comment on column public.x_connections.subscription_type is
  'Value returned by GET /2/users/me user.fields=subscription_type. Not inferred.';
comment on column public.x_connections.subscription_checked_at is
  'When that field was last requested. Null means the desk has not asked.';
