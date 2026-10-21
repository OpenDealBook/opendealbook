-- Compiled from supabase/schemas/65-deal-event-projectors.sql,
-- 99k-deal-timeline.sql and 99s-workflows.sql.

create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.close_deadline_set' then
    perform public.project_deal_close_deadline(ev);
  -- History only; a workflow trigger reads it from the log.
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.loi_signed' then
    null;
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
  elsif ev.aggregate_type = 'deal_milestone' then
    perform public.project_deal_milestone(ev);
  -- History only; delivery state lives on deal_update_recipient.
  elsif ev.aggregate_type = 'deal_update' then
    null;
  -- History only; a workflow trigger reads it from the log.
  elsif ev.aggregate_type = 'lender_room' and ev.event_type = 'lender_room.went_quiet' then
    null;
  -- History only; the email relay reads it from the log.
  elsif ev.aggregate_type = 'seller_counsel_message' then
    null;
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;

-- The first time a deal's LOI signed date is filled in, however it was set,
-- the deal log records deal.loi_signed once, so workflows can start on it.
create or replace function tuckin.record_loi_signed()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if current_setting('odb.replay', true) = 'on'
    or exists (
      select 1 from public.deal_event
      where deal_id = new.deal_id and event_type = 'deal.loi_signed'
    ) then
    return null;
  end if;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_via, deal_seq, aggregate_seq
  )
  values (
    new.account_id, new.deal_id, 'deal', new.deal_id, 'deal.loi_signed',
    jsonb_build_object('milestone_id', new.id, 'signed_on', new.actual_on),
    'system', 'deal_milestone',
    (select coalesce(max(deal_seq), 0) + 1 from public.deal_event where deal_id = new.deal_id),
    (select coalesce(max(aggregate_seq), 0) + 1 from public.deal_event
     where aggregate_type = 'deal' and aggregate_id = new.deal_id)
  );
  return null;
end;
$$;

create trigger record_loi_signed_on_insert
  after insert on public.deal_milestone
  for each row when (new.kind = 'loi_signed' and new.actual_on is not null)
  execute function tuckin.record_loi_signed();

create trigger record_loi_signed_on_update
  after update of actual_on on public.deal_milestone
  for each row when (new.kind = 'loi_signed' and old.actual_on is null and new.actual_on is not null)
  execute function tuckin.record_loi_signed();

-- When a workflow was last switched on, so it starts only on events after that.
alter table public.workflow add column enabled_at timestamptz;

update public.workflow set enabled_at = now() where enabled;

create or replace function tuckin.stamp_workflow_enabled_at()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' or not old.enabled then
    new.enabled_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger stamp_workflow_enabled_at
  before insert or update of enabled on public.workflow
  for each row when (new.enabled)
  execute function tuckin.stamp_workflow_enabled_at();
