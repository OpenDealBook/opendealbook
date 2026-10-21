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
  industry text,
  business_model text,
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
create index ix_deal_profile_account_industry on public.deal_profile (account_id, industry_id);
create index ix_deal_profile_account_location on public.deal_profile (account_id, location_id);

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

-- Saves the profile editor in one transaction: the deal.updated event and the
-- business name, which it also confirms. The new code name is checked against
-- the new business name; the write whose trigger would compare the new code
-- name with the old business name goes second.
create or replace function public.update_deal_profile(p_deal_id uuid, p_business_name text, p_payload jsonb)
  returns void
  language plpgsql security invoker set search_path = '' as $$
declare
  v_firm public.firm;
  v_code_name text := btrim(p_payload ->> 'code_name');
begin
  select f.* into v_firm
  from public.deal d join public.firm f on f.id = d.firm_id
  where d.id = p_deal_id;

  if not public.has_permission((select auth.uid()), v_firm.account_id, 'deals.manage') then
    raise exception 'editing the deal profile needs deals.manage' using errcode = 'insufficient_privilege';
  end if;

  if public.code_name_contains_business_name(v_code_name, p_business_name) then
    raise exception 'a code name must not contain the business name' using errcode = 'check_violation';
  end if;

  if public.code_name_contains_business_name(v_code_name, v_firm.name) then
    update public.firm set name = p_business_name, name_confirmed = true where id = v_firm.id;
    perform public.append_deal_event(p_deal_id, 'deal', p_deal_id, 'deal.updated', p_payload);
  else
    perform public.append_deal_event(p_deal_id, 'deal', p_deal_id, 'deal.updated', p_payload);
    update public.firm set name = p_business_name, name_confirmed = true where id = v_firm.id;
  end if;
end;
$$;

grant execute on function public.update_deal_profile(uuid, text, jsonb) to authenticated, service_role;
