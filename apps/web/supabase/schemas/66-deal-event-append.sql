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
--
-- A dr_document event is checked here, where it enters, and nowhere else:
-- replay_deal re-runs stored history through the projector, and history
-- written before a rule existed must still rebuild.

-- Anyone can open a deal on their personal account and append to it, and
-- server code signs whatever storage path a document carries, so the
-- aggregate id, the payload folder, and the payload storage path are all held
-- to the event's own deal. Only an event with no user behind it names its
-- uploader in the payload; a user's event is uploaded by that user.
create or replace function public.check_dr_document_event(
  p_deal_id uuid,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_actor_ref uuid
) returns void
  language plpgsql set search_path = '' as $$
declare
  v_document_deal_id uuid;
begin
  select d.deal_id into v_document_deal_id from public.dr_document d where d.id = p_aggregate_id;

  if v_document_deal_id <> p_deal_id then
    raise exception 'document % is not in deal %', p_aggregate_id, p_deal_id;
  end if;

  if p_event_type in ('dr_document.added', 'dr_document.moved') and not exists (
    select 1 from public.dr_folder f
    where f.id = (p_payload ->> 'folder_id')::uuid and f.deal_id = p_deal_id
  ) then
    raise exception 'folder % is not in deal %', p_payload ->> 'folder_id', p_deal_id;
  end if;

  if p_event_type = 'dr_document.added' and (
    p_payload ->> 'storage_path' is null
    or not starts_with(p_payload ->> 'storage_path', 'deal/' || p_deal_id || '/')
    or p_payload ->> 'storage_path' ~ '\\|(^|/)\.{0,2}(/|$)'
  ) then
    raise exception 'storage path % is not a file of deal %', p_payload ->> 'storage_path', p_deal_id;
  end if;

  if p_event_type = 'dr_document.added' and (p_payload ->> 'uploaded_by')::uuid <> p_actor_ref then
    raise exception 'document % cannot be added by % as uploaded by %', p_aggregate_id, p_actor_ref, p_payload ->> 'uploaded_by';
  end if;
end;
$$;

-- A signing webhook is matched to a contract version by the signing document
-- recorded here, so a signing event may only name a version of its own
-- contract in its own deal, and must carry what it sets.
create or replace function public.check_contract_event(
  p_deal_id uuid,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb
) returns void
  language plpgsql set search_path = '' as $$
begin
  if p_event_type not in ('contract.signature_requested', 'contract.signature_status_changed') then
    return;
  end if;

  if not exists (
    select 1
    from public.contract_version cv
    join public.contract c on c.id = cv.contract_id
    where cv.id = (p_payload ->> 'version_id')::uuid
      and cv.contract_id = p_aggregate_id
      and c.deal_id = p_deal_id
  ) then
    raise exception 'contract version % is not a version of contract % in deal %',
      p_payload ->> 'version_id', p_aggregate_id, p_deal_id;
  end if;

  if p_event_type = 'contract.signature_requested' and p_payload ->> 'signing_document_id' is null then
    raise exception 'signature request for contract version % names no signing document', p_payload ->> 'version_id';
  end if;

  if p_event_type = 'contract.signature_status_changed'
    and coalesce(p_payload ->> 'status', '') not in ('draft', 'sent', 'completed', 'declined', 'expired') then
    raise exception '% is not a signing status of a contract version', p_payload ->> 'status';
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

  if p_aggregate_type = 'dr_document' then
    perform public.check_dr_document_event(p_deal_id, p_aggregate_id, p_event_type, p_payload, v_actor_ref);
  elsif p_aggregate_type = 'contract' then
    perform public.check_contract_event(p_deal_id, p_aggregate_id, p_event_type, p_payload);
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
