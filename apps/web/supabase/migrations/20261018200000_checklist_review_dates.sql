alter table public.checklist_template_item add column review_offset_days int not null default 3;

alter table public.checklist_item
  add column review_offset_days int not null default 3,
  add column review_due_at timestamptz;

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, review_offset_days, review_due_at, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
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
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;

-- The two dates an item gets from a deal's anchors: due_at is the anchor plus
-- the item's offset (receive by), review_due_at adds its review days on top
-- (reviewed by). Diligence counts from the LOI signed date, closing from the
-- closing target, post-close from the actual close. No anchor, no dates.
create or replace function public.checklist_anchor_dates(
  p_deal_id uuid,
  p_kind text,
  p_due_offset_days int,
  p_review_offset_days int
) returns table (due_at timestamptz, review_due_at timestamptz)
  language sql stable
  set search_path = '' as $$
  select
    (a.anchor::timestamp + make_interval(days => p_due_offset_days)) at time zone 'UTC',
    (a.anchor::timestamp + make_interval(days => p_due_offset_days + p_review_offset_days)) at time zone 'UTC'
  from (
    select case p_kind
      when 'diligence' then (select m.actual_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'loi_signed')
      when 'closing' then (select m.target_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'closing')
      when 'post_close' then (select m.actual_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'closing')
    end as anchor
  ) a;
$$;

grant execute on function public.checklist_anchor_dates(uuid, text, int, int) to authenticated, service_role;

-- Moves a deal's checklist dates with its anchors. An item's due date moves
-- while it is not started or requested and freezes once received; its review
-- due date keeps moving until the item is reviewed. Offer items have no
-- anchor. Runs as the caller and writes through the deal log, so replay
-- agrees. Returns how many items changed.
create or replace function public.recompute_checklist_due_dates(p_deal_id uuid)
  returns int
  language plpgsql
  set search_path = '' as $$
declare
  v_item record;
  v_changed int := 0;
begin
  if not public.has_deal_permission(p_deal_id, 'checklists.manage') then
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
    ) n
    where (n.due_at, n.review_due_at) is distinct from (n.new_due_at, n.new_review_due_at)
  loop
    perform public.append_deal_event(p_deal_id, 'checklist_item', v_item.id, 'checklist_item.due_recomputed',
      jsonb_build_object('due_at', v_item.new_due_at, 'review_due_at', v_item.new_review_due_at));
    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end;
$$;

grant execute on function public.recompute_checklist_due_dates(uuid) to authenticated, service_role;

