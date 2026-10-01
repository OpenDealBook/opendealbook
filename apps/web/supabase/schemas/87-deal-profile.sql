-- The descriptive profile of a deal's target business: industry, place, size and
-- the owner's context. One row per deal (1:1), written only through the deal
-- aggregate: project_deal (65-deal-event-projectors.sql) upserts it from
-- deal.created and deal.updated alongside the deal row, so these fields travel on
-- the same event as description and asking_price rather than a separate one. The
-- quantitative figures (asking_price, revenue_ttm, sde_ttm, ebitda_ttm) stay on
-- the deal table; this holds only the descriptive attributes. authenticated and
-- service_role keep read only.

create table if not exists public.deal_profile (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  year_established int,
  industry_id uuid references public.industry (id) on delete set null,
  location_id uuid references public.location (id) on delete set null,
  location_raw text,
  employee_band text,
  website text,
  owner_role text,
  reason_for_sale text
);

alter table public.deal_profile enable row level security;

create index ix_deal_profile_account on public.deal_profile (account_id);
create index ix_deal_profile_industry on public.deal_profile (industry_id);
create index ix_deal_profile_location on public.deal_profile (location_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_profile from authenticated, service_role;
grant select on public.deal_profile to authenticated;
grant select on public.deal_profile to service_role;

create policy deal_profile_read on public.deal_profile
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy deal_profile_insert on public.deal_profile
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_profile_update on public.deal_profile
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_profile_delete on public.deal_profile
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
