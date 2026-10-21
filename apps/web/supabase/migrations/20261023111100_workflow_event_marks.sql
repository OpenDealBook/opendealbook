-- Compiled from supabase/schemas/65-deal-event-projectors.sql and 99s-workflows.sql.

create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.close_deadline_set' then
    perform public.project_deal_close_deadline(ev);
  -- History only, recorded by the LOI signed date; a workflow trigger reads it from the log.
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.loi_signed' then
    if current_setting('odb.replay', true) is distinct from 'on' then
      raise exception 'only the LOI signed date records a signing' using errcode = 'insufficient_privilege';
    end if;
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

-- How far each event log had reached when a workflow was last switched on, so
-- it starts only on events after that.
alter table public.workflow
  add column enabled_after_deal_seq bigint,
  add column enabled_after_account_seq bigint;

create or replace function tuckin.stamp_workflow_enabled_at()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' or not old.enabled then
    new.enabled_at := clock_timestamp();
    new.enabled_after_deal_seq := coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.deal_event', 'global_seq')), 0);
    new.enabled_after_account_seq := coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.account_event', 'global_seq')), 0);
  end if;
  return new;
end;
$$;

update public.workflow set
  enabled_after_deal_seq = coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.deal_event', 'global_seq')), 0),
  enabled_after_account_seq = coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.account_event', 'global_seq')), 0)
where enabled;
