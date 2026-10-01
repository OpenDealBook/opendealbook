-- A saved calculator scenario for a deal. Many versions per deal: each is a
-- scratch what-if the account keeps alongside the others, one flagged primary.
-- type selects which calculator shape the version holds (sde, deal, or working
-- capital). outputs_snapshot captures the key computed outputs at save time so a
-- version reads back without re-running the calculator. Conventional RLS; these
-- are scratch scenarios, not event-sourced.

create table if not exists public.calc_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  type text check (type in ('sde', 'deal', 'working_capital')),
  name text,
  notes text,
  is_primary boolean not null default false,
  outputs_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.calc_version enable row level security;

create index ix_calc_version_deal on public.calc_version (deal_id);
create index ix_calc_version_deal_type on public.calc_version (deal_id, type);

revoke all on public.calc_version from authenticated, service_role;
grant select, insert, update, delete on public.calc_version to authenticated;
grant select, insert, update, delete on public.calc_version to service_role;

create trigger calc_version_timestamps
  before insert or update on public.calc_version
  for each row execute function public.set_timestamps();

create trigger calc_version_user_tracking
  before insert or update on public.calc_version
  for each row execute function public.set_user_tracking();

create policy calc_version_read on public.calc_version
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy calc_version_insert on public.calc_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy calc_version_update on public.calc_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy calc_version_delete on public.calc_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- The deferred link from deal_financials (86) back to the calc version a deal's
-- adopted figures came from. Declared here, not inline in 86, because schema
-- files apply in filename order and calc_version does not exist until this file.
alter table public.deal_financials
  add constraint deal_financials_source_calc_version_fk
  foreign key (source_calc_version_id) references public.calc_version (id) on delete set null;
