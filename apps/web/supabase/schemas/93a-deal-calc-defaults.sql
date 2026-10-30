-- Team-level starting values for new deal calcs. A loan added to a calc takes
-- after_standby from here; a new calc takes year_basis, minimum_dscr and the worst
-- and great scenario_paths drivers (null means the built-in starters). Each calc
-- keeps its own choices once saved.

create table if not exists public.deal_calc_defaults (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  after_standby text not null check (after_standby in ('remaining_term', 'full_term_after_standby')),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  year_basis text not null default 'months_from_close' check (year_basis in ('months_from_close', 'fiscal_year')),
  scenario_paths jsonb,
  minimum_dscr numeric not null default 1.25 constraint deal_calc_defaults_minimum_dscr_positive check (minimum_dscr > 0)
);

alter table public.deal_calc_defaults enable row level security;

revoke all on public.deal_calc_defaults from authenticated, service_role;
grant select, insert, update on public.deal_calc_defaults to authenticated;
grant select, insert, update on public.deal_calc_defaults to service_role;

create trigger deal_calc_defaults_timestamps
  before insert or update on public.deal_calc_defaults
  for each row execute function public.set_timestamps();

create trigger deal_calc_defaults_user_tracking
  before insert or update on public.deal_calc_defaults
  for each row execute function public.set_user_tracking();

create policy deal_calc_defaults_read on public.deal_calc_defaults
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_calc_defaults_insert on public.deal_calc_defaults
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy deal_calc_defaults_update on public.deal_calc_defaults
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));
