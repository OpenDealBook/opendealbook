-- Compiled from supabase/schemas/99s-workflows.sql, 65-deal-event-projectors.sql
-- and 66-deal-event-append.sql.

drop trigger refuse_reopening_cancelled_run on public.workflow_run;
drop function tuckin.refuse_reopening_cancelled_run();

-- A failed run may be retried; a succeeded or cancelled one is final.
create or replace function tuckin.refuse_reopening_finished_run()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a % run is final', old.status using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_reopening_finished_run
  before update of status on public.workflow_run
  for each row when (old.status in ('succeeded', 'cancelled') and new.status <> old.status)
  execute function tuckin.refuse_reopening_finished_run();

alter table public.workflow_step_run
  drop constraint workflow_step_run_check,
  add constraint workflow_step_run_check check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null));

create or replace function tuckin.cancel_unfinished_steps()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.workflow_step_run
  set status = 'cancelled', finished_at = new.finished_at
  where run_id = new.id and status in ('running', 'waiting');
  return null;
end;
$$;

create trigger cancel_unfinished_steps
  after update of status on public.workflow_run
  for each row when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function tuckin.cancel_unfinished_steps();

create type public.paid_lookup_outcome as enum ('found', 'not_found', 'failed');

alter table public.paid_lookup add column outcome public.paid_lookup_outcome not null;

create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.close_deadline_set' then
    perform public.project_deal_close_deadline(ev);
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
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
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
