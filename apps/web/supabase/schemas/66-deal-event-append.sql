-- The single write entry point for the event store. append_deal_event
-- authorises the event, serialises appends per deal under a transaction advisory
-- lock, computes the gapless deal_seq and aggregate_seq, inserts the event,
-- dispatches to the projector in the same transaction, and writes the every-64
-- snapshots. append_deal_events appends several events atomically under one lock
-- so a cross-aggregate action stays in one transaction (D7).
--
-- Optimistic concurrency: p_expected_aggregate_seq, when supplied, must equal the
-- current aggregate head or the append raises serialization_failure (40001). When
-- omitted the write is last-writer-wins. A deal.created event authorises against
-- deals.create on the account and resolves the account from the payload, since the
-- deal row does not exist yet; every other event authorises with the log's
-- has_deal_permission and resolves the account from the deal.

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
    if p_event_type = 'deal.created' then
      if not public.has_permission(v_actor_ref, v_account_id, 'deals.create') then
        raise exception 'not authorized to create a deal on account %', v_account_id using errcode = 'insufficient_privilege';
      end if;
    elsif not public.has_deal_permission(p_deal_id, public.deal_event_permission(p_aggregate_type)) then
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

grant execute on function public.append_deal_event(uuid, text, uuid, text, jsonb, bigint, public.event_actor_kind, text) to authenticated, service_role;

create or replace function public.append_deal_events(p_deal_id uuid, p_events jsonb)
  returns table (deal_seq bigint, aggregate_seq bigint)
  language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
begin
  for e in select * from jsonb_array_elements(p_events)
  loop
    return query
    select r.deal_seq, r.aggregate_seq
    from public.append_deal_event(
      p_deal_id,
      e ->> 'aggregate_type',
      (e ->> 'aggregate_id')::uuid,
      e ->> 'event_type',
      coalesce(e -> 'payload', '{}'::jsonb),
      (e ->> 'expected_aggregate_seq')::bigint,
      coalesce((e ->> 'actor_kind')::public.event_actor_kind, 'user'),
      coalesce(e ->> 'actor_via', 'web')
    ) r;
  end loop;
end;
$$;

grant execute on function public.append_deal_events(uuid, jsonb) to authenticated, service_role;
