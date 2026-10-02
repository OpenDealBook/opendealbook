-- Per-aggregate projectors. Each project_* function folds one event into its
-- domain table with an upsert or a tombstone; project_deal_event is the explicit
-- dispatch. append_deal_event (live) and rebuild_deal (replay) are the two
-- callers, so a projection has exactly one code path. Projectors run as the
-- table owner (security definer) and are never granted to authenticated: the
-- log is the only public write surface. created_by/updated_by are stamped from
-- the event actor; timestamp/tracking triggers on the projection tables still
-- run this wave and are neutralised with the grant revokes in a later wave.
--
-- An unknown event_type raises rather than falling through, and enum-typed
-- payload fields are cast so an illegal value raises on the cast.

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
    insert into public.deal_profile (deal_id, account_id, year_established, industry_id, location_id, location_raw, employee_band, website, owner_role, reason_for_sale)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'year_established')::int,
      (ev.payload ->> 'industry_id')::uuid,
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
      close_date = coalesce((ev.payload ->> 'close_date')::date, close_date),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
    update public.deal_profile set
      year_established = coalesce((ev.payload ->> 'year_established')::int, year_established),
      industry_id = coalesce((ev.payload ->> 'industry_id')::uuid, industry_id),
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
  else
    raise exception 'unknown deal event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_deal_box(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_box.set' then
    insert into public.deal_box (id, account_id, version, criteria_json, broker_summary, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'version')::int,
      coalesce(ev.payload -> 'criteria_json', '{}'::jsonb),
      ev.payload ->> 'broker_summary',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      criteria_json = excluded.criteria_json,
      broker_summary = excluded.broker_summary,
      updated_by = excluded.updated_by;
  else
    raise exception 'unknown deal_box event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
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
  elsif ev.event_type = 'checklist_item.rescheduled' then
    update public.checklist_item set
      schedule_week_id = (ev.payload ->> 'schedule_week_id')::uuid,
      priority = coalesce((ev.payload ->> 'priority')::int, priority),
      deal_killer = coalesce((ev.payload ->> 'deal_killer')::boolean, deal_killer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_approval(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'approval.requested' then
    insert into public.approval (id, deal_id, subject, requested_by)
    values (
      ev.aggregate_id, ev.deal_id,
      (ev.payload ->> 'subject')::public.approval_subject,
      ev.actor_ref
    )
    on conflict (id) do update set subject = excluded.subject;
  elsif ev.event_type = 'approval.decided' then
    update public.approval set
      decision = (ev.payload ->> 'decision')::public.approval_decision,
      decided_by = ev.actor_ref,
      decided_at = ev.created_at
    where id = ev.aggregate_id;
  else
    raise exception 'unknown approval event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_deal_participant(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_participant.added' then
    insert into public.deal_participant (id, deal_id, user_id, party, role, scope, scope_id, permission, expires_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id,
      (ev.payload ->> 'user_id')::uuid,
      (ev.payload ->> 'party')::public.participant_party,
      ev.payload ->> 'role',
      coalesce((ev.payload ->> 'scope')::public.participant_scope, 'deal'),
      (ev.payload ->> 'scope_id')::uuid,
      coalesce((ev.payload ->> 'permission')::public.participant_permission, 'view'),
      (ev.payload ->> 'expires_at')::timestamptz,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      role = excluded.role,
      scope_id = excluded.scope_id,
      permission = excluded.permission,
      expires_at = excluded.expires_at,
      updated_by = excluded.updated_by;
  else
    raise exception 'unknown deal_participant event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_dr_document(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'dr_document.added' then
    insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, checklist_item_id, uploaded_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'folder_id')::uuid,
      ev.payload ->> 'name',
      ev.payload ->> 'storage_path',
      coalesce((ev.payload ->> 'version')::int, 1),
      (ev.payload ->> 'checklist_item_id')::uuid,
      ev.actor_ref
    )
    on conflict (id) do update set
      folder_id = excluded.folder_id,
      name = excluded.name,
      checklist_item_id = excluded.checklist_item_id;
  elsif ev.event_type = 'dr_document.moved' then
    update public.dr_document set folder_id = (ev.payload ->> 'folder_id')::uuid
    where id = ev.aggregate_id;
  elsif ev.event_type = 'dr_document.removed' then
    update public.dr_document set removed_at = ev.created_at where id = ev.aggregate_id;
  else
    raise exception 'unknown dr_document event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_meeting(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'meeting.scheduled' then
    insert into public.meeting (id, deal_id, account_id, series_id, type, scheduled_at, status, notes, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      (ev.payload ->> 'series_id')::uuid,
      ev.payload ->> 'type',
      (ev.payload ->> 'scheduled_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.meeting_status, 'scheduled'),
      ev.payload ->> 'notes',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      scheduled_at = excluded.scheduled_at,
      status = excluded.status,
      notes = excluded.notes,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'meeting.updated' then
    update public.meeting set
      status = coalesce((ev.payload ->> 'status')::public.meeting_status, status),
      scheduled_at = coalesce((ev.payload ->> 'scheduled_at')::timestamptz, scheduled_at),
      notes = coalesce(ev.payload ->> 'notes', notes),
      decisions = coalesce(ev.payload ->> 'decisions', decisions),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown meeting event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_meeting_action_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'meeting_action_item.added' then
    insert into public.meeting_action_item (id, meeting_id, deal_id, account_id, description, owner_user_id, owner_is_seller, due_at, status, checklist_item_id, schedule_week_id, created_by, updated_by)
    values (
      ev.aggregate_id,
      (ev.payload ->> 'meeting_id')::uuid,
      ev.deal_id, ev.account_id,
      ev.payload ->> 'description',
      (ev.payload ->> 'owner_user_id')::uuid,
      coalesce((ev.payload ->> 'owner_is_seller')::boolean, false),
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      (ev.payload ->> 'checklist_item_id')::uuid,
      (ev.payload ->> 'schedule_week_id')::uuid,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      description = excluded.description,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      schedule_week_id = excluded.schedule_week_id,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'meeting_action_item.updated' then
    update public.meeting_action_item set
      status = coalesce((ev.payload ->> 'status')::public.checklist_status, status),
      description = coalesce(ev.payload ->> 'description', description),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'meeting_action_item.removed' then
    update public.meeting_action_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown meeting_action_item event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_contract(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'contract.created' then
    insert into public.contract (id, deal_id, account_id, type, status, current_version, created_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      ev.payload ->> 'type',
      ev.payload ->> 'status',
      (ev.payload ->> 'current_version')::int,
      ev.actor_ref
    )
    on conflict (id) do update set
      status = excluded.status,
      current_version = excluded.current_version;
  elsif ev.event_type = 'contract.version_set' then
    update public.contract set
      current_version = (ev.payload ->> 'current_version')::int,
      status = coalesce(ev.payload ->> 'status', status)
    where id = ev.aggregate_id;
  else
    raise exception 'unknown contract event %', ev.event_type;
  end if;
end;
$$;

-- offer.version_added carries the new offer_version's id in payload.version_id;
-- the offer aggregate_id is the parent offer. Version rows are insert-only so a
-- submitted version stays frozen; the insert is guarded on conflict do nothing
-- so a replay re-applying the event is a no-op rather than a unique violation.
-- The stage move to loi_submitted/loi_accepted and the contract.created for an
-- accepted offer are separate events the accept/submit action emits, not folded
-- here.
create or replace function public.project_offer(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'offer.drafted' then
    insert into public.offer (id, account_id, deal_id, status)
    values (ev.aggregate_id, ev.account_id, ev.deal_id, 'draft')
    on conflict (id) do nothing;
  elsif ev.event_type = 'offer.version_added' then
    insert into public.offer_version (id, account_id, offer_id, number, author_side, purchase_price, real_estate_portion, target_close_date, offer_expires_at, exclusivity_days, diligence_days, terms, calc_version_id, approved_by, approved_at)
    values (
      (ev.payload ->> 'version_id')::uuid,
      ev.account_id, ev.aggregate_id,
      (ev.payload ->> 'number')::int,
      ev.payload ->> 'author_side',
      (ev.payload ->> 'purchase_price')::numeric,
      (ev.payload ->> 'real_estate_portion')::numeric,
      (ev.payload ->> 'target_close_date')::date,
      (ev.payload ->> 'offer_expires_at')::timestamptz,
      (ev.payload ->> 'exclusivity_days')::int,
      (ev.payload ->> 'diligence_days')::int,
      coalesce(ev.payload -> 'terms', '{}'::jsonb),
      (ev.payload ->> 'calc_version_id')::uuid,
      (ev.payload ->> 'approved_by')::uuid,
      (ev.payload ->> 'approved_at')::timestamptz
    )
    on conflict (id) do nothing;
    update public.offer set current_version_id = (ev.payload ->> 'version_id')::uuid
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.submitted' then
    update public.offer set status = 'submitted', submitted_at = ev.created_at
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.countered' then
    update public.offer set status = 'countered' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.accepted' then
    update public.offer set status = 'accepted', responded_at = ev.created_at
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.rejected' then
    update public.offer set status = 'rejected' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.withdrawn' then
    update public.offer set status = 'withdrawn' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.expired' then
    update public.offer set status = 'expired' where id = ev.aggregate_id;
  else
    raise exception 'unknown offer event %', ev.event_type;
  end if;
end;
$$;

-- deal.financials_adopted rides the 'deal' aggregate but folds into the
-- deal_financials projection (86-deal-financials.sql) rather than the deal row.
create or replace function public.project_deal_financials(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.financials_adopted' then
    insert into public.deal_financials (deal_id, account_id, adopted_revenue, adopted_sde, adopted_ebitda, source_calc_version_id, adopted_by, adopted_at)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'adopted_revenue')::numeric,
      (ev.payload ->> 'adopted_sde')::numeric,
      (ev.payload ->> 'adopted_ebitda')::numeric,
      (ev.payload ->> 'source_calc_version_id')::uuid,
      ev.actor_ref,
      ev.created_at
    )
    on conflict (deal_id) do update set
      adopted_revenue = excluded.adopted_revenue,
      adopted_sde = excluded.adopted_sde,
      adopted_ebitda = excluded.adopted_ebitda,
      source_calc_version_id = excluded.source_calc_version_id,
      adopted_by = excluded.adopted_by,
      adopted_at = excluded.adopted_at;
  else
    raise exception 'unknown deal_financials event %', ev.event_type;
  end if;
end;
$$;

-- Explicit dispatch. Unknown aggregate_type raises rather than silently
-- dropping the event.
create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' then
    perform public.project_deal(ev);
  elsif ev.aggregate_type = 'deal_box' then
    perform public.project_deal_box(ev);
  elsif ev.aggregate_type = 'checklist_item' then
    perform public.project_checklist_item(ev);
  elsif ev.aggregate_type = 'approval' then
    perform public.project_approval(ev);
  elsif ev.aggregate_type = 'deal_participant' then
    perform public.project_deal_participant(ev);
  elsif ev.aggregate_type = 'dr_document' then
    perform public.project_dr_document(ev);
  elsif ev.aggregate_type = 'meeting' then
    perform public.project_meeting(ev);
  elsif ev.aggregate_type = 'meeting_action_item' then
    perform public.project_meeting_action_item(ev);
  elsif ev.aggregate_type = 'contract' then
    perform public.project_contract(ev);
  elsif ev.aggregate_type = 'offer' then
    perform public.project_offer(ev);
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;

-- The permission an event of a given aggregate must satisfy, mirroring the
-- insert policies the projection tables carried before the log.
create or replace function public.deal_event_permission(p_aggregate_type text)
  returns text
  language sql immutable set search_path = '' as $$
  select case p_aggregate_type
    when 'checklist_item' then 'checklists.manage'
    when 'deal_participant' then 'participants.manage'
    else 'deals.manage'
  end;
$$;

-- The materialised state stored in an aggregate-level snapshot: the projected
-- row as jsonb.
create or replace function public.deal_aggregate_state(p_aggregate_type text, p_aggregate_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_aggregate_type)
    into v_state using p_aggregate_id;
  return v_state;
end;
$$;

-- The deal-level snapshot body: the deal row plus a compact manifest of each
-- child aggregate's current head aggregate_seq (D3), not a full child bundle.
create or replace function public.deal_wide_manifest(p_deal_id uuid)
  returns jsonb
  language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'deal', (select to_jsonb(d) from public.deal d where d.id = p_deal_id),
    'heads', coalesce((
      select jsonb_object_agg(k, mx)
      from (
        select de.aggregate_type || ':' || de.aggregate_id::text as k, max(de.aggregate_seq) as mx
        from public.deal_event de
        where de.deal_id = p_deal_id
        group by de.aggregate_type, de.aggregate_id
      ) s
    ), '{}'::jsonb)
  );
$$;
