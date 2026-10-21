-- Checklist items wait on someone, link a data-room document and carry an
-- append-only notes thread that anyone doing deal work may add to. A deal
-- update that names an industry sets it, so switching to Other clears the
-- listed one.

alter table public.checklist_item
  add column waiting_on text check (waiting_on in ('us', 'seller', 'counsel', 'lender')),
  add column linked_document_id uuid;

create table if not exists public.checklist_item_note (
  id uuid primary key,
  checklist_item_id uuid not null references public.checklist_item (id) on delete cascade,
  body text not null,
  author_user_id uuid references auth.users,
  created_at timestamptz not null
);

alter table public.checklist_item_note enable row level security;

create index ix_checklist_item_note_item on public.checklist_item_note (checklist_item_id, created_at);

revoke all on public.checklist_item_note from authenticated, service_role;
grant select on public.checklist_item_note to authenticated;
grant select on public.checklist_item_note to service_role;

create policy checklist_item_note_read on public.checklist_item_note
  for select to authenticated
  using (exists (select 1 from public.checklist_item i where i.id = checklist_item_id));

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, review_offset_days, review_due_at, source_template_id, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      ev.payload ->> 'category',
      ev.payload ->> 'title',
      (ev.payload ->> 'owner_user_id')::uuid,
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      coalesce((ev.payload ->> 'priority')::int, 0),
      coalesce((ev.payload ->> 'deal_killer')::boolean, false),
      (ev.payload ->> 'schedule_week_id')::uuid,
      (ev.payload ->> 'due_offset_days')::int,
      coalesce((ev.payload ->> 'review_offset_days')::int, 3),
      (ev.payload ->> 'review_due_at')::timestamptz,
      (ev.payload ->> 'source_template_id')::uuid,
      ev.payload ->> 'kind',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'importance',
      ev.payload ->> 'answer',
      ev.payload ->> 'offer_term_key',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      category = excluded.category,
      title = excluded.title,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      priority = excluded.priority,
      deal_killer = excluded.deal_killer,
      schedule_week_id = excluded.schedule_week_id,
      due_offset_days = excluded.due_offset_days,
      review_offset_days = excluded.review_offset_days,
      review_due_at = excluded.review_due_at,
      source_template_id = excluded.source_template_id,
      kind = excluded.kind,
      owner_role = excluded.owner_role,
      importance = excluded.importance,
      answer = excluded.answer,
      offer_term_key = excluded.offer_term_key,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'checklist_item.status_changed' then
    update public.checklist_item set
      status = (ev.payload ->> 'status')::public.checklist_status,
      requested_at = coalesce((ev.payload ->> 'requested_at')::timestamptz, requested_at),
      received_at = coalesce((ev.payload ->> 'received_at')::timestamptz, received_at),
      reviewed_at = coalesce((ev.payload ->> 'reviewed_at')::timestamptz, reviewed_at),
      reviewed_by = coalesce((ev.payload ->> 'reviewed_by')::uuid, reviewed_by),
      outcome = coalesce((ev.payload ->> 'outcome')::public.checklist_outcome, outcome),
      answer = coalesce(ev.payload ->> 'answer', answer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.due_recomputed' then
    update public.checklist_item set
      due_at = (ev.payload ->> 'due_at')::timestamptz,
      review_due_at = (ev.payload ->> 'review_due_at')::timestamptz,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.rescheduled' then
    update public.checklist_item set
      schedule_week_id = (ev.payload ->> 'schedule_week_id')::uuid,
      priority = coalesce((ev.payload ->> 'priority')::int, priority),
      deal_killer = coalesce((ev.payload ->> 'deal_killer')::boolean, deal_killer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.details_set' then
    update public.checklist_item set
      owner_user_id = case when ev.payload ? 'owner_user_id' then (ev.payload ->> 'owner_user_id')::uuid else owner_user_id end,
      importance = case when ev.payload ? 'importance' then ev.payload ->> 'importance' else importance end,
      due_at = case when ev.payload ? 'due_at' then (ev.payload ->> 'due_at')::timestamptz else due_at end,
      review_due_at = case when ev.payload ? 'due_at'
        then (ev.payload ->> 'due_at')::timestamptz + make_interval(days => review_offset_days)
        else review_due_at end,
      due_set_manually = case when ev.payload ? 'use_scheduled_date' then false
        else due_set_manually or ev.payload ? 'due_at' end,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.waiting_on_set' then
    update public.checklist_item set waiting_on = ev.payload ->> 'waiting_on', updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.document_linked' then
    update public.checklist_item set linked_document_id = (ev.payload ->> 'document_id')::uuid, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.note_posted' then
    insert into public.checklist_item_note (id, checklist_item_id, body, author_user_id, created_at)
    values (ev.id, ev.aggregate_id, ev.payload ->> 'body', ev.actor_ref, ev.created_at);
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.append_deal_event(
  p_deal_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_aggregate_seq bigint default null,
  p_actor_kind public.event_actor_kind default 'user',
  p_actor_via text default 'web'
) returns table (deal_seq bigint, aggregate_seq bigint)
  language plpgsql security definer set search_path = '' as $$
declare
  v_account_id uuid;
  v_actor_ref uuid;
  v_deal_seq bigint;
  v_agg_seq bigint;
  v_event public.deal_event;
begin
  select d.account_id into v_account_id from public.deal d where d.id = p_deal_id;
  if v_account_id is null then
    v_account_id := (p_payload ->> 'account_id')::uuid;
  end if;
  if v_account_id is null then
    raise exception 'cannot resolve account for deal %', p_deal_id using errcode = 'foreign_key_violation';
  end if;

  if p_actor_kind = 'user' then
    v_actor_ref := (select auth.uid());
    if p_aggregate_type = 'deal_update' then
      raise exception 'only delivery records deal update history' using errcode = 'insufficient_privilege';
    elsif p_aggregate_type = 'lender_room' then
      raise exception 'only the nudge sweep records lender room history' using errcode = 'insufficient_privilege';
    elsif p_event_type = 'deal.created' then
      if not public.has_permission(v_actor_ref, v_account_id, 'deals.create') then
        raise exception 'not authorized to create a deal on account %', v_account_id using errcode = 'insufficient_privilege';
      end if;
    elsif not public.has_deal_permission(p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type))
      and not (p_event_type = 'checklist_item.due_recomputed' and public.has_deal_permission(p_deal_id, 'deals.manage'))
      and not (p_event_type = 'checklist_item.note_posted' and public.has_deal_permission(p_deal_id, 'deals.work')) then
      raise exception 'not authorized to append % on deal %: needs %',
        p_event_type, p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type)
        using errcode = 'insufficient_privilege';
    elsif public.contract_event_changes_status(p_aggregate_id, p_event_type, p_payload)
      and not public.has_deal_permission(p_deal_id, 'deals.manage') then
      raise exception 'not authorized to change the status of contract %: needs deals.manage', p_aggregate_id
        using errcode = 'insufficient_privilege';
    elsif p_event_type = 'contract.version_set'
      and exists (
        select 1 from public.contract_version cv
        where cv.contract_id = p_aggregate_id and cv.version > (p_payload ->> 'current_version')::int
      )
      and not public.has_deal_permission(p_deal_id, 'deals.manage') then
      raise exception 'not authorized to adopt an older version of contract %: needs deals.manage', p_aggregate_id
        using errcode = 'insufficient_privilege';
    end if;
  elsif (select auth.role()) <> 'service_role' then
    raise exception 'non-user events require the service role' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_deal_id::text));

  select coalesce(max(de.deal_seq), 0) + 1 into v_deal_seq
  from public.deal_event de where de.deal_id = p_deal_id;

  select coalesce(max(de.aggregate_seq), 0) + 1 into v_agg_seq
  from public.deal_event de
  where de.aggregate_type = p_aggregate_type and de.aggregate_id = p_aggregate_id;

  if p_expected_aggregate_seq is not null and p_expected_aggregate_seq <> v_agg_seq - 1 then
    raise exception 'stale aggregate %/%: expected head %, actual head %',
      p_aggregate_type, p_aggregate_id, p_expected_aggregate_seq, v_agg_seq - 1
      using errcode = 'serialization_failure';
  end if;

  if p_aggregate_type = 'dr_document' then
    perform public.check_dr_document_event(p_deal_id, p_aggregate_id, p_event_type, p_payload, v_actor_ref);
  elsif p_aggregate_type = 'contract' then
    perform public.check_contract_event(p_deal_id, p_aggregate_id, p_event_type, p_payload);
  elsif p_aggregate_type = 'deal' then
    perform public.check_deal_close_deadline_event(p_event_type, p_payload);
  elsif p_aggregate_type = 'checklist_item' then
    perform public.check_checklist_item_event(v_account_id, p_payload);
  end if;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_ref, actor_via, deal_seq, aggregate_seq
  )
  values (
    v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, p_event_type, p_payload,
    p_actor_kind, v_actor_ref, p_actor_via, v_deal_seq, v_agg_seq
  )
  returning * into v_event;

  perform public.project_deal_event(v_event);

  if v_agg_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, v_agg_seq,
            public.deal_aggregate_state(p_aggregate_type, p_aggregate_id));
  end if;

  if v_deal_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, 'deal-wide', p_deal_id, v_deal_seq,
            public.deal_wide_manifest(p_deal_id));
  end if;

  return query select v_deal_seq, v_agg_seq;
end;
$$;

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
      industry_id = case when ev.payload ? 'industry_id' then (ev.payload ->> 'industry_id')::uuid else industry_id end,
      industry = case when ev.payload ? 'industry' then ev.payload ->> 'industry' else industry end,
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
