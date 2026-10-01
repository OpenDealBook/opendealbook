-- A single earnings period inside an SDE calc version: a full year, a partial
-- year, or a trailing-twelve-month window, carrying the weight it contributes to
-- the blended figure. months is null or 12 for a full year; a partial year sets
-- months between 1 and 11, matching the @odb/calculators partial-year ruling.

create table if not exists public.sde_period (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null references public.calc_version (id) on delete cascade,
  label text,
  weight numeric,
  months int check (months is null or (months between 1 and 11)),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.sde_period enable row level security;

create index ix_sde_period_calc_version on public.sde_period (calc_version_id);

revoke all on public.sde_period from authenticated, service_role;
grant select, insert, update, delete on public.sde_period to authenticated;
grant select, insert, update, delete on public.sde_period to service_role;

create trigger sde_period_timestamps
  before insert or update on public.sde_period
  for each row execute function public.set_timestamps();

create trigger sde_period_user_tracking
  before insert or update on public.sde_period
  for each row execute function public.set_user_tracking();

create policy sde_period_read on public.sde_period
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy sde_period_insert on public.sde_period
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_period_update on public.sde_period
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_period_delete on public.sde_period
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
