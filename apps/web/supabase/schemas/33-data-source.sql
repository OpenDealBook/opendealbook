-- Account-scoped deal sourcing inputs. A data_source describes where inbound
-- deals come from; config_json holds the source-specific settings.

create table if not exists public.data_source (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  type text not null check (type in ('csv', 'clay', 'state_board', 'listing_email', 'manual')),
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.data_source enable row level security;

create index ix_data_source_account on public.data_source (account_id);

revoke all on public.data_source from authenticated, service_role;
grant select, insert, update, delete on public.data_source to authenticated;
grant select, insert, update, delete on public.data_source to service_role;

create trigger data_source_timestamps
  before insert or update on public.data_source
  for each row execute function public.set_timestamps();

create policy data_source_read on public.data_source
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy data_source_insert on public.data_source
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy data_source_update on public.data_source
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy data_source_delete on public.data_source
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
