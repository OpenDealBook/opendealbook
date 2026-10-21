-- A checklist item's due date can be set by hand; a hand-set date wins over
-- the deal's anchors when they change later.
alter table public.checklist_item add column due_set_manually boolean not null default false;

create or replace function public.recompute_checklist_due_dates(p_deal_id uuid)
  returns int
  language plpgsql
  set search_path = '' as $$
declare
  v_item record;
  v_changed int := 0;
  v_actor public.event_actor_kind := 'user';
begin
  if current_user = 'service_role' then
    v_actor := 'service';
  elsif not (public.has_deal_permission(p_deal_id, 'checklists.manage') or public.has_deal_permission(p_deal_id, 'deals.manage')) then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  for v_item in
    select n.id, n.new_due_at, n.new_review_due_at
    from (
      select i.id, i.due_at, i.review_due_at,
        case when i.status in ('not_started', 'requested') then d.due_at else i.due_at end as new_due_at,
        d.review_due_at as new_review_due_at
      from public.checklist_item i
      cross join lateral public.checklist_anchor_dates(i.deal_id, i.kind, i.due_offset_days, i.review_offset_days) d
      where i.deal_id = p_deal_id
        and i.removed_at is null
        and i.kind in ('diligence', 'closing', 'post_close')
        and i.due_offset_days is not null
        and i.status <> 'reviewed'
        and not i.due_set_manually
    ) n
    where (n.due_at, n.review_due_at) is distinct from (n.new_due_at, n.new_review_due_at)
  loop
    perform public.append_deal_event(p_deal_id, 'checklist_item', v_item.id, 'checklist_item.due_recomputed',
      jsonb_build_object('due_at', v_item.new_due_at, 'review_due_at', v_item.new_review_due_at), null, v_actor);
    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;

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
      due_set_manually = due_set_manually or ev.payload ? 'due_at',
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
