-- Account-scoped acquisition criteria and broker summary. Versions are kept:
-- a new version is a new row rather than an overwrite.

create table if not exists public.deal_box (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  criteria_json jsonb not null default '{}'::jsonb,
  broker_summary text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, version)
);

alter table public.deal_box enable row level security;

create index ix_deal_box_account on public.deal_box (account_id);

revoke all on public.deal_box from authenticated, service_role;
grant select, insert, update, delete on public.deal_box to authenticated;
grant select, insert, update, delete on public.deal_box to service_role;

create trigger deal_box_timestamps
  before insert or update on public.deal_box
  for each row execute function public.set_timestamps();

create trigger deal_box_user_tracking
  before insert or update on public.deal_box
  for each row execute function public.set_user_tracking();

create policy deal_box_read on public.deal_box
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_box_insert on public.deal_box
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_box_update on public.deal_box
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_box_delete on public.deal_box
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
