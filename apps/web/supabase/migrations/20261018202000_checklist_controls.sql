alter table public.checklist_item
  add column source_template_id uuid references public.checklist_template (id) on delete set null;

grant delete on public.deal_checklist_application to authenticated, service_role;

create policy deal_checklist_application_delete on public.deal_checklist_application
  for delete to authenticated
  using (
    public.has_deal_permission(deal_id, 'checklists.manage')
    and not exists (
      select 1 from public.checklist_item i
      where i.deal_id = deal_checklist_application.deal_id
        and i.source_template_id = deal_checklist_application.template_id
        and i.removed_at is null
    )
  );

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
    elsif p_event_type = 'deal.created' then
      if not public.has_permission(v_actor_ref, v_account_id, 'deals.create') then
        raise exception 'not authorized to create a deal on account %', v_account_id using errcode = 'insufficient_privilege';
      end if;
    elsif not public.has_deal_permission(p_deal_id, public.deal_event_permission(p_aggregate_type))
      and not (p_event_type = 'checklist_item.due_recomputed' and public.has_deal_permission(p_deal_id, 'deals.manage')) then
      raise exception 'not authorized to append % on deal %', p_event_type, p_deal_id using errcode = 'insufficient_privilege';
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

-- Moves a deal's checklist dates with its anchors. An item's due date moves
-- while it is not started or requested and freezes once received; its review
-- due date keeps moving until the item is reviewed. Offer items have no
-- anchor. Runs as the caller and writes through the deal log, so replay
-- agrees; whoever has checklists.manage or deals.manage on the deal may call
-- it, and a service role call (the webhook path) is logged as the service.
-- Returns how many items changed.
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

grant execute on function public.recompute_checklist_due_dates(uuid) to authenticated, service_role;

-- Makes a template the only default of its kind for its team.
create or replace function public.set_default_checklist_template(template_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_template public.checklist_template;
begin
  select * into v_template from public.checklist_template t where t.id = set_default_checklist_template.template_id;

  if not found or not public.has_permission((select auth.uid()), v_template.account_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist templates' using errcode = 'insufficient_privilege';
  end if;

  if tuckin.team_locked(v_template.account_id) then
    raise exception 'team is read-only' using errcode = 'insufficient_privilege';
  end if;

  update public.checklist_template t
  set is_default = false
  where t.account_id = v_template.account_id and t.kind is not distinct from v_template.kind
    and t.is_default and t.id <> v_template.id;

  update public.checklist_template t set is_default = true where t.id = v_template.id;
end;
$$;

revoke all on function public.set_default_checklist_template(uuid) from public, anon;
grant execute on function public.set_default_checklist_template(uuid) to authenticated;

-- Claims a template for a deal, as the caller (or the service role). True when the caller may go on to append the
-- template's items (stamped with source_template_id); false when the template
-- still has live items on the deal, or a claim made and not yet followed by
-- items. A claim whose items have all been removed is replaced. A claim whose
-- append failed is released by deleting the row, which is allowed while the
-- template has no live items on the deal.
create or replace function public.claim_checklist_template_application(p_deal_id uuid, p_template_id uuid)
  returns boolean
  language plpgsql
  set search_path = '' as $$
declare
  v_claimed int;
begin
  if current_user <> 'service_role' and not public.has_deal_permission(p_deal_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  delete from public.deal_checklist_application a
  where a.deal_id = p_deal_id and a.template_id = p_template_id
    and exists (
      select 1 from public.checklist_item i
      where i.deal_id = p_deal_id and i.source_template_id = p_template_id
    )
    and not exists (
      select 1 from public.checklist_item i
      where i.deal_id = p_deal_id and i.source_template_id = p_template_id and i.removed_at is null
    );

  insert into public.deal_checklist_application (deal_id, template_id, account_id)
  select d.id, p_template_id, d.account_id from public.deal d where d.id = p_deal_id
  on conflict (deal_id, template_id) do nothing;

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

revoke all on function public.claim_checklist_template_application(uuid, uuid) from public, anon;
grant execute on function public.claim_checklist_template_application(uuid, uuid) to authenticated, service_role;

create trigger same_team_source_template_id
  before insert or update on public.checklist_item
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'source_template_id', 'checklist_template');

-- A deal's diligence schedule and its six weeks, made together as the caller.
-- A deal with a schedule already gets that schedule's id back, created false,
-- and nothing new.
create or replace function public.create_diligence_schedule(
  p_deal_id uuid,
  p_start_date date,
  p_template_id uuid,
  p_created_by uuid
) returns table (schedule_id uuid, created boolean)
  language plpgsql
  set search_path = '' as $$
declare
  v_schedule_id uuid;
begin
  if current_user <> 'service_role' and not public.has_deal_permission(p_deal_id, 'checklists.manage') then
    raise exception 'not authorized to change checklist items on deal %', p_deal_id using errcode = 'insufficient_privilege';
  end if;

  insert into public.diligence_schedule (account_id, deal_id, start_date, template_id, created_by)
  select d.account_id, d.id, p_start_date, p_template_id, p_created_by
  from public.deal d where d.id = p_deal_id
  on conflict (deal_id) do nothing
  returning id into v_schedule_id;

  if v_schedule_id is null then
    return query select s.id, false from public.diligence_schedule s where s.deal_id = p_deal_id;
    return;
  end if;

  insert into public.schedule_week (schedule_id, account_id, week_no, theme, starts_on)
  select v_schedule_id, s.account_id, w.week_no, w.theme, p_start_date + ((w.week_no - 1) * 7)::int
  from public.diligence_schedule s
  cross join unnest(array[
    'financials/returns', 'client list/revenue', 'staff/HR',
    'systems/leases/licenses/insurance', 'follow-ups', 'open items/APA schedules'
  ]) with ordinality as w(theme, week_no)
  where s.id = v_schedule_id;

  return query select v_schedule_id, true;
end;
$$;

grant execute on function public.create_diligence_schedule(uuid, date, uuid, uuid) to authenticated, service_role;
