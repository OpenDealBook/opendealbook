-- Third-party integration connections managed through Nango. A row is either
-- account-level (user_id null) for tenant integrations like SendGrid or a CRM,
-- or user-level (user_id set) for a member's mailbox or calendar. The app only
-- ever stores the nango_connection_id; third-party tokens live in Nango.

create table if not exists public.integration_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid references auth.users on delete cascade,
  provider text not null,
  nango_connection_id text not null,
  scopes text[],
  status text,
  connected_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.integration_connection enable row level security;

create index ix_integration_connection_account on public.integration_connection (account_id);

revoke all on public.integration_connection from authenticated, service_role;
grant select, insert, update, delete on public.integration_connection to authenticated;
grant select, insert, update, delete on public.integration_connection to service_role;

create trigger integration_connection_timestamps
  before insert or update on public.integration_connection
  for each row execute function public.set_timestamps();

create policy integration_connection_read on public.integration_connection
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy integration_connection_insert on public.integration_connection
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy integration_connection_update on public.integration_connection
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy integration_connection_delete on public.integration_connection
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));
