-- Code names ignore case and surrounding spaces, and stay clear of the
-- business name when either one changes.
drop index public.ux_deal_account_code_name;
create unique index ux_deal_account_code_name on public.deal (account_id, lower(code_name));

create or replace function public.project_deal(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.created' then
    insert into public.deal (id, account_id, firm_id, owner_user_id, description, asking_price, revenue_ttm, sde_ttm, ebitda_ttm, notes, source, stage, broker_contact_id, deal_box_version, capture_method, source_url, discovered_at, created_by_kind, created_by_ref, created_by_via, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'firm_id')::uuid,
      (ev.payload ->> 'owner_user_id')::uuid,
      ev.payload ->> 'description',
      (ev.payload ->> 'asking_price')::numeric,
      (ev.payload ->> 'revenue_ttm')::numeric,
      (ev.payload ->> 'sde_ttm')::numeric,
      (ev.payload ->> 'ebitda_ttm')::numeric,
      ev.payload ->> 'notes',
      coalesce((ev.payload ->> 'source')::public.deal_source, 'manual'),
      coalesce(ev.payload ->> 'stage', 'sourcing'),
      (ev.payload ->> 'broker_contact_id')::uuid,
      (ev.payload ->> 'deal_box_version')::int,
      ev.payload ->> 'capture_method',
      ev.payload ->> 'source_url',
      coalesce((ev.payload ->> 'discovered_at')::timestamptz, ev.created_at),
      case ev.actor_kind
        when 'user' then 'user'
        when 'service' then 'workflow'
        when 'api_key' then 'agent'
        when 'system' then 'integration'
      end,
      ev.actor_ref::text,
      ev.actor_via,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      firm_id = excluded.firm_id,
      owner_user_id = excluded.owner_user_id,
      description = excluded.description,
      asking_price = excluded.asking_price,
      revenue_ttm = excluded.revenue_ttm,
      sde_ttm = excluded.sde_ttm,
      ebitda_ttm = excluded.ebitda_ttm,
      notes = excluded.notes,
      broker_contact_id = excluded.broker_contact_id,
      deal_box_version = excluded.deal_box_version,
      capture_method = excluded.capture_method,
      source_url = excluded.source_url,
      updated_by = excluded.updated_by;
    insert into public.deal_profile (deal_id, account_id, year_established, industry_id, industry, business_model, location_id, location_raw, employee_band, website, owner_role, reason_for_sale)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'year_established')::int,
      (ev.payload ->> 'industry_id')::uuid,
      ev.payload ->> 'industry',
      ev.payload ->> 'business_model',
      (ev.payload ->> 'location_id')::uuid,
      ev.payload ->> 'location_raw',
      ev.payload ->> 'employee_band',
      ev.payload ->> 'website',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'reason_for_sale'
    )
    on conflict (deal_id) do update set
      year_established = excluded.year_established,
      industry_id = excluded.industry_id,
      industry = excluded.industry,
      business_model = excluded.business_model,
      location_id = excluded.location_id,
      location_raw = excluded.location_raw,
      employee_band = excluded.employee_band,
      website = excluded.website,
      owner_role = excluded.owner_role,
      reason_for_sale = excluded.reason_for_sale;
  elsif ev.event_type = 'deal.updated' then
    update public.deal set
      description = coalesce(ev.payload ->> 'description', description),
      code_name = case when ev.payload ? 'code_name' then btrim(ev.payload ->> 'code_name') else code_name end,
      asking_price = coalesce((ev.payload ->> 'asking_price')::numeric, asking_price),
      revenue_ttm = coalesce((ev.payload ->> 'revenue_ttm')::numeric, revenue_ttm),
      sde_ttm = coalesce((ev.payload ->> 'sde_ttm')::numeric, sde_ttm),
      ebitda_ttm = coalesce((ev.payload ->> 'ebitda_ttm')::numeric, ebitda_ttm),
      notes = coalesce(ev.payload ->> 'notes', notes),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
    update public.deal_profile set
      year_established = coalesce((ev.payload ->> 'year_established')::int, year_established),
      industry_id = coalesce((ev.payload ->> 'industry_id')::uuid, industry_id),
      industry = coalesce(ev.payload ->> 'industry', industry),
      business_model = coalesce(ev.payload ->> 'business_model', business_model),
      location_id = coalesce((ev.payload ->> 'location_id')::uuid, location_id),
      location_raw = coalesce(ev.payload ->> 'location_raw', location_raw),
      employee_band = coalesce(ev.payload ->> 'employee_band', employee_band),
      website = coalesce(ev.payload ->> 'website', website),
      owner_role = coalesce(ev.payload ->> 'owner_role', owner_role),
      reason_for_sale = coalesce(ev.payload ->> 'reason_for_sale', reason_for_sale)
    where deal_id = ev.aggregate_id;
  elsif ev.event_type = 'deal.stage_changed' then
    update public.deal set
      stage = ev.payload ->> 'stage',
      stage_changed_at = ev.created_at,
      outcome_reason = coalesce(ev.payload ->> 'outcome_reason', outcome_reason),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.resolved' then
    update public.deal set
      resolution = ev.payload ->> 'resolution',
      resolution_reason = ev.payload ->> 'resolution_reason',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.archived' then
    update public.deal set
      archived_at = coalesce((ev.payload ->> 'archived_at')::timestamptz, ev.created_at),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.unarchived' then
    update public.deal set
      archived_at = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.listing_status_changed' then
    update public.deal set
      listing_status = ev.payload ->> 'listing_status',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_flagged' then
    update public.deal set
      duplicate_of = (ev.payload ->> 'duplicate_of')::uuid,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_cleared' then
    update public.deal set
      duplicate_of = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.earnings_basis_changed' then
    update public.deal set
      earnings_basis = ev.payload ->> 'earnings_basis',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.contract_review_gate_changed' then
  else
    raise exception 'unknown deal event %', ev.event_type;
  end if;
end;
$$;

-- A code name stands in for the business name with outside parties, so it must
-- never contain it, whichever of the two changes.
create or replace function public.code_name_contains_business_name(code_name text, business_name text)
  returns boolean
  language sql immutable
  set search_path = '' as $$
  select strpos(lower(code_name), lower(business_name)) > 0;
$$;

create or replace function public.refuse_deal_code_name_containing_business_name()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.firm f
    where f.id = new.firm_id and public.code_name_contains_business_name(new.code_name, f.name)
  ) then
    raise exception 'a code name must not contain the business name' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger deal_code_name_not_business_name
  before insert or update of code_name, firm_id on public.deal
  for each row execute function public.refuse_deal_code_name_containing_business_name();

create or replace function public.refuse_firm_name_inside_code_name()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.deal d
    where d.firm_id = new.id and public.code_name_contains_business_name(d.code_name, new.name)
  ) then
    raise exception 'a code name must not contain the business name' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger firm_name_not_inside_code_name
  before update of name on public.firm
  for each row execute function public.refuse_firm_name_inside_code_name();
