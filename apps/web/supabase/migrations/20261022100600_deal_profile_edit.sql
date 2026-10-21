grant execute on function public.code_name_contains_business_name(text, text) to authenticated, service_role;
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

-- An emptied profile field arrives as a present null key and clears the field.
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
      year_established = case when ev.payload ? 'year_established' then (ev.payload ->> 'year_established')::int else year_established end,
      industry_id = case when ev.payload ? 'industry_id' then (ev.payload ->> 'industry_id')::uuid else industry_id end,
      industry = case when ev.payload ? 'industry' then ev.payload ->> 'industry' else industry end,
      business_model = case when ev.payload ? 'business_model' then ev.payload ->> 'business_model' else business_model end,
      location_id = case when ev.payload ? 'location_id' then (ev.payload ->> 'location_id')::uuid else location_id end,
      location_raw = case when ev.payload ? 'location_raw' then ev.payload ->> 'location_raw' else location_raw end,
      employee_band = case when ev.payload ? 'employee_band' then ev.payload ->> 'employee_band' else employee_band end,
      website = case when ev.payload ? 'website' then ev.payload ->> 'website' else website end,
      owner_role = case when ev.payload ? 'owner_role' then ev.payload ->> 'owner_role' else owner_role end,
      reason_for_sale = case when ev.payload ? 'reason_for_sale' then ev.payload ->> 'reason_for_sale' else reason_for_sale end
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
