-- Folds deal.close_date into the closing milestone and
-- diligence_schedule.target_apa_date into the APA signing milestone. The
-- backfill appends deal_milestone.set events as the system actor, so the log
-- holds the history and replay_deal rebuilds the milestones; the close_date key
-- left in old deal.updated payloads is ignored on replay.
--
-- A close_date becomes the closing actual when the deal is closed-won (its stage
-- sorts at or after its account's integration stage, or its resolution is won)
-- and the date is at most one day ahead; otherwise it becomes the target. A deal
-- that already has the milestone keeps it. Among a deal's schedules, the latest
-- created one with a target APA date wins, ties broken by the highest id.
-- Backfilled milestones start unshared.
do $$
declare
  r record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  for r in
    select
      d.id,
      d.close_date,
      coalesce(d.resolution = 'won' or s.sort_order >= i.sort_order, false)
        and d.close_date <= current_date + 1 as is_actual
    from public.deal d
    left join public.pipeline_stage s on s.account_id = d.account_id and s.key = d.stage
    left join public.pipeline_stage i on i.account_id = d.account_id and i.key = 'integration'
    where d.close_date is not null
      and not exists (
        select 1 from public.deal_milestone m where m.deal_id = d.id and m.kind = 'closing'
      )
  loop
    perform public.append_deal_event(
      r.id, 'deal_milestone', gen_random_uuid(), 'deal_milestone.set',
      jsonb_build_object(
        'kind', 'closing',
        'target_on', case when r.is_actual then null else r.close_date end,
        'actual_on', case when r.is_actual then r.close_date end,
        'shared', false
      ),
      null, 'system', 'migration'
    );
  end loop;

  for r in
    select distinct on (ds.deal_id) ds.deal_id, ds.target_apa_date
    from public.diligence_schedule ds
    where ds.target_apa_date is not null
      and not exists (
        select 1 from public.deal_milestone m where m.deal_id = ds.deal_id and m.kind = 'apa_signing'
      )
    order by ds.deal_id, ds.created_at desc nulls last, ds.id desc
  loop
    perform public.append_deal_event(
      r.deal_id, 'deal_milestone', gen_random_uuid(), 'deal_milestone.set',
      jsonb_build_object('kind', 'apa_signing', 'target_on', r.target_apa_date, 'actual_on', null, 'shared', false),
      null, 'system', 'migration'
    );
  end loop;
end $$;

alter table public.deal drop column close_date;
alter table public.diligence_schedule drop column target_apa_date;

-- deal.close_date as PostgREST reads it: the closing milestone's actual, else its
-- target. plpgsql to match 22-deal.sql, which loads before 99k creates deal_milestone.
create or replace function public.close_date(public.deal)
  returns date
  language plpgsql stable set search_path = '' as $$
begin
  return (
    select coalesce(m.actual_on, m.target_on)
    from public.deal_milestone m
    where m.deal_id = $1.id and m.kind = 'closing'
  );
end;
$$;

grant execute on function public.close_date(public.deal) to authenticated, service_role;

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
  else
    raise exception 'unknown deal event %', ev.event_type;
  end if;
end;
$$;
