-- Normalized places shared across an account. One row per distinct
-- city/region/country, reused by deals and comps so a location is captured once
-- rather than retyped and re-spelled. metro is an optional rollup label. Curation
-- is gated on deals.manage; every member may read.

create table if not exists public.location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  city text,
  region text,
  country text,
  metro text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, city, region, country)
);

alter table public.location enable row level security;

create index ix_location_account on public.location (account_id);

revoke all on public.location from authenticated, service_role;
grant select, insert, update, delete on public.location to authenticated;
grant select, insert, update, delete on public.location to service_role;

create trigger location_timestamps
  before insert or update on public.location
  for each row execute function public.set_timestamps();

create trigger location_user_tracking
  before insert or update on public.location
  for each row execute function public.set_user_tracking();

create policy location_read on public.location
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy location_insert on public.location
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy location_update on public.location
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy location_delete on public.location
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
