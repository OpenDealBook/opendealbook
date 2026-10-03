-- DB persistence of the funding-source shape shared with @odb/calculators: one
-- row per source in a capital stack. The owner is always a calc version, so
-- calc_version_id is a required foreign key with real referential integrity and
-- cascade behavior; offers carry their funding in the offer terms jsonb rather
-- than as funding_source rows.

create table if not exists public.funding_source (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null references public.calc_version (id) on delete cascade,
  type text check (type in (
    'sba_7a', 'sba_504', 'conventional', 'seller_financing', 'cash_equity',
    'heloc', 'robs_401k', 'investor_equity', 'mezzanine', 'other'
  )),
  amount numeric,
  pct numeric,
  rate numeric,
  term_years numeric,
  guarantee_fee numeric,
  standby_months int,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.funding_source enable row level security;

create index ix_funding_source_calc_version on public.funding_source (calc_version_id);

revoke all on public.funding_source from authenticated, service_role;
grant select, insert, update, delete on public.funding_source to authenticated;
grant select, insert, update, delete on public.funding_source to service_role;

create trigger funding_source_timestamps
  before insert or update on public.funding_source
  for each row execute function public.set_timestamps();

create trigger funding_source_user_tracking
  before insert or update on public.funding_source
  for each row execute function public.set_user_tracking();

create policy funding_source_read on public.funding_source
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy funding_source_insert on public.funding_source
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy funding_source_update on public.funding_source
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy funding_source_delete on public.funding_source
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
