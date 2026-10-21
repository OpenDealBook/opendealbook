-- Per-account industry taxonomy, two levels deep. A root industry carries a null
-- parent_id; a child points at its root. deal and comp classification reference
-- these rows, so every account owns and curates its own set. Renaming and
-- reparenting are plain updates and inserts gated on deals.manage; every member
-- may read.

create table if not exists public.industry (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  parent_id uuid references public.industry (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, name, parent_id)
);

alter table public.industry enable row level security;

create index ix_industry_account on public.industry (account_id);
create index ix_industry_account_parent on public.industry (account_id, parent_id);

revoke all on public.industry from authenticated, service_role;
grant select, insert, update, delete on public.industry to authenticated;
grant select, insert, update, delete on public.industry to service_role;

create trigger industry_timestamps
  before insert or update on public.industry
  for each row execute function public.set_timestamps();

create trigger industry_user_tracking
  before insert or update on public.industry
  for each row execute function public.set_user_tracking();

create policy industry_read on public.industry
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy industry_insert on public.industry
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy industry_update on public.industry
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy industry_delete on public.industry
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- Every team starts with a standard list of common small-business industries
-- to pick from; a deal can still name any other industry as free text.
create or replace function public.seed_default_industries(p_account_id uuid)
  returns void
  language sql security definer set search_path = '' as $$
  insert into public.industry (account_id, name)
  select p_account_id, n
  from unnest(array[
    'Accounting & Bookkeeping', 'Auto Repair', 'Childcare', 'Cleaning & Janitorial', 'Construction',
    'Dental', 'Electrical', 'Engineering Services', 'Fitness & Gyms', 'Food Manufacturing',
    'Funeral Services', 'Home Health Care', 'HVAC', 'Insurance Agency', 'IT Services',
    'Landscaping', 'Laundry & Dry Cleaning', 'Legal Services', 'Manufacturing', 'Marketing & Advertising',
    'Medical Practice', 'Pest Control', 'Pet Services', 'Physical Therapy', 'Plumbing',
    'Property Management', 'Restaurants', 'Roofing', 'Staffing', 'Trucking & Logistics',
    'Veterinary', 'Wholesale Distribution'
  ]) as n
  where not exists (
    select 1 from public.industry i
    where i.account_id = p_account_id and lower(i.name) = lower(n)
  );
$$;

revoke all on function public.seed_default_industries(uuid) from public, anon, authenticated, service_role;

create or replace function public.team_gets_default_industries()
  returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_industries(new.id);
  return null;
end;
$$;

create trigger team_default_industries
  after insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function public.team_gets_default_industries();
