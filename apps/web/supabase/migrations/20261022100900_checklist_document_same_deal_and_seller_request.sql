-- A linked checklist document must come from the item's own deal, and a
-- seller-room question remembers the checklist item it asked for.

drop function public.check_checklist_item_event(uuid, jsonb);

create or replace function public.check_checklist_item_event(
  p_deal_id uuid,
  p_account_id uuid,
  p_payload jsonb
) returns void
  language plpgsql set search_path = '' as $$
begin
  if p_payload ->> 'document_id' is not null and not exists (
    select 1 from public.dr_document d
    where d.id = (p_payload ->> 'document_id')::uuid and d.deal_id = p_deal_id
  ) then
    raise exception 'document % is not in deal %', p_payload ->> 'document_id', p_deal_id
      using errcode = 'check_violation';
  end if;

  if p_payload ->> 'owner_user_id' is not null and not exists (
    select 1 from public.accounts_memberships m
    where m.account_id = p_account_id and m.user_id = (p_payload ->> 'owner_user_id')::uuid
  ) then
    raise exception 'checklist owner % is not on the deal''s team', p_payload ->> 'owner_user_id'
      using errcode = 'check_violation';
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
    perform public.check_checklist_item_event(p_deal_id, v_account_id, p_payload);
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

create table if not exists public.checklist_item_seller_question (
  question_id uuid primary key,
  checklist_item_id uuid not null
);

alter table public.checklist_item_seller_question enable row level security;

revoke all on public.checklist_item_seller_question from anon, authenticated, service_role;
grant select, insert on public.checklist_item_seller_question to service_role;
