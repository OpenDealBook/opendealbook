-- A participant's calendar, brokered through Nango, modeled on
-- mailbox_connection. Unlike the mailbox (one sending account per tenant), a
-- calendar connection is per-user per-account per-provider: each participant
-- links their own Google or Microsoft calendar, so the natural key is
-- (account_id, user_id, provider). Created and refreshed by the service role
-- from the Nango callback; manageable by members with deals.manage. RLS mirrors
-- mailbox_connection: any account member reads, deals.manage writes.

create table if not exists public.calendar_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users,
  provider text not null check (provider in ('google', 'microsoft')),
  nango_connection_id text not null,
  provider_config_key text not null,
  email text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, user_id, provider)
);

alter table public.calendar_connection enable row level security;

revoke all on public.calendar_connection from authenticated, service_role;
grant select, insert, update on public.calendar_connection to authenticated;
grant select, insert, update on public.calendar_connection to service_role;

create trigger calendar_connection_timestamps
  before insert or update on public.calendar_connection
  for each row execute function public.set_timestamps();

create trigger calendar_connection_user_tracking
  before insert or update on public.calendar_connection
  for each row execute function public.set_user_tracking();

create policy calendar_connection_read on public.calendar_connection
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy calendar_connection_insert on public.calendar_connection
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy calendar_connection_update on public.calendar_connection
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
