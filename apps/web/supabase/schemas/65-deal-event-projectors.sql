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
    insert into public.deal (id, account_id, firm_id, owner_user_id, description, source, stage, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'firm_id')::uuid,
      (ev.payload ->> 'owner_user_id')::uuid,
      ev.payload ->> 'description',
      coalesce((ev.payload ->> 'source')::public.deal_source, 'manual'),
      coalesce(ev.payload ->> 'stage', 'sourced'),
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      firm_id = excluded.firm_id,
      owner_user_id = excluded.owner_user_id,
      description = excluded.description,
      updated_by = excluded.updated_by;
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
  elsif ev.event_type = 'deal.stage_changed' then
    update public.deal set
      stage = ev.payload ->> 'stage',
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
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      ev.payload ->> 'category',
      ev.payload ->> 'title',
      (ev.payload ->> 'owner_user_id')::uuid,
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      category = excluded.category,
      title = excluded.title,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'checklist_item.status_changed' then
    update public.checklist_item set
      status = (ev.payload ->> 'status')::public.checklist_status,
      requested_at = coalesce((ev.payload ->> 'requested_at')::timestamptz, requested_at),
      received_at = coalesce((ev.payload ->> 'received_at')::timestamptz, received_at),
      reviewed_at = coalesce((ev.payload ->> 'reviewed_at')::timestamptz, reviewed_at),
      outcome = coalesce((ev.payload ->> 'outcome')::public.checklist_outcome, outcome),
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
    insert into public.deal_participant (id, deal_id, user_id, party, role, scope, permission, expires_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id,
      (ev.payload ->> 'user_id')::uuid,
      (ev.payload ->> 'party')::public.participant_party,
      ev.payload ->> 'role',
      coalesce((ev.payload ->> 'scope')::public.participant_scope, 'deal'),
      coalesce((ev.payload ->> 'permission')::public.participant_permission, 'view'),
      (ev.payload ->> 'expires_at')::timestamptz,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      role = excluded.role,
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
    insert into public.meeting (id, deal_id, account_id, series_id, type, scheduled_at, status, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      (ev.payload ->> 'series_id')::uuid,
      ev.payload ->> 'type',
      (ev.payload ->> 'scheduled_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.meeting_status, 'scheduled'),
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      scheduled_at = excluded.scheduled_at,
      status = excluded.status,
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
    insert into public.meeting_action_item (id, meeting_id, deal_id, account_id, description, owner_user_id, owner_is_seller, due_at, status, checklist_item_id, created_by, updated_by)
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
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      description = excluded.description,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
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

-- Explicit dispatch. Unknown aggregate_type raises rather than silently
-- dropping the event.
create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' then
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
