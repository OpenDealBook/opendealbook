-- Per-client transition tracking for integration and close (Stage 8). Each row
-- follows one client through the paperwork required to move them to the buyer.
-- Deal-scoped; managed with deals.manage.

create table if not exists public.client_transition (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  client_name text not null,
  engagement_letter_status public.checklist_status not null default 'not_started',
  consent_7216_status public.checklist_status not null default 'not_started',
  efile_auth_status public.checklist_status not null default 'not_started',
  portal_migration_status public.checklist_status not null default 'not_started',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.client_transition enable row level security;

create index ix_client_transition_deal on public.client_transition (deal_id);
create index ix_client_transition_account on public.client_transition (account_id);

revoke all on public.client_transition from authenticated, service_role;
grant select, insert, update, delete on public.client_transition to authenticated;
grant select, insert, update, delete on public.client_transition to service_role;

create trigger client_transition_timestamps
  before insert or update on public.client_transition
  for each row execute function public.set_timestamps();

create trigger client_transition_user_tracking
  before insert or update on public.client_transition
  for each row execute function public.set_user_tracking();

create policy client_transition_read on public.client_transition
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy client_transition_insert on public.client_transition
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy client_transition_update on public.client_transition
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy client_transition_delete on public.client_transition
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
