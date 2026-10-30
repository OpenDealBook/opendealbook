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
-- Whoever may edit a deal's milestones may also move the checklist dates that
-- follow them, so checklist_item.due_recomputed also takes deals.manage.
-- Anyone doing deal work may add to a checklist item's notes thread, and may
-- request an item from the seller: mark it requested and waiting on the seller.
--
-- A dr_document event is checked here, where it enters, and nowhere else:
-- replay_deal re-runs stored history through the projector, and history
-- written before a rule existed must still rebuild.

-- Anyone can open a deal on their personal account and append to it, and
-- server code signs whatever storage path a document carries, so the
-- aggregate id, the payload folder, and the payload storage path are all held
-- to the event's own deal. Only an event with no user behind it names its
-- uploader in the payload; a user's event is uploaded by that user. Counsel
-- folders take uploads only from the deal's managers.
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

  if p_event_type = 'dr_document.added' and p_actor_ref is not null
    and not public.has_deal_permission(p_deal_id, 'deals.manage')
    and exists (
      with recursive ancestry as (
        select f.id, f.parent_id from public.dr_folder f where f.id = (p_payload ->> 'folder_id')::uuid
        union all
        select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
      )
      select 1 from ancestry a join public.counsel_uploads_folder u on u.folder_id = a.id
    ) then
    raise exception 'not authorized to add a document to a counsel folder on deal %: needs deals.manage', p_deal_id
      using errcode = 'insufficient_privilege';
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
declare
  v_loi_signed_on date := (
    select m.actual_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'loi_signed'
  );
  v_exclusivity_ends_after date := coalesce(
    (select m.target_on from public.deal_milestone m where m.deal_id = p_deal_id and m.kind = 'exclusivity_end'),
    v_loi_signed_on
  );
  v_extension_signed boolean := exists (
    select 1 from public.contract_version cv where cv.contract_id = p_aggregate_id and cv.is_signed
  );
begin
  if p_event_type = 'contract.created' and p_payload ->> 'type' = 'loi_extension' and not exists (
    select 1
    from public.contract c
    join public.contract_version cv on cv.contract_id = c.id and cv.version = c.current_version
    where c.id = (p_payload ->> 'parent_contract_id')::uuid
      and c.deal_id = p_deal_id
      and c.type = 'loi'
      and cv.is_signed
  ) then
    raise exception 'an LOI extension on deal % must extend the current signed LOI of that deal', p_deal_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted'
    and (coalesce(btrim(p_payload ->> 'note'), '') = '' or p_payload ->> 'noted_on' is null) then
    raise exception 'a note on LOI extension % needs its text and the day it was agreed', p_aggregate_id
      using errcode = 'check_violation';
  end if;

  if p_event_type in ('contract.extension_noted', 'contract.extension_rescheduled') and not exists (
    select 1 from public.contract c
    where c.id = p_aggregate_id and c.deal_id = p_deal_id and c.type = 'loi_extension'
  ) then
    raise exception 'contract % is not an LOI extension in deal %', p_aggregate_id, p_deal_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted' and v_extension_signed then
    raise exception 'LOI extension % has a signed copy and cannot be noted', p_aggregate_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_rescheduled' and (
    v_extension_signed
    or exists (select 1 from public.contract c where c.id = p_aggregate_id and c.note is not null)
  ) then
    raise exception 'LOI extension % is signed or noted, so its date is fixed', p_aggregate_id
      using errcode = 'check_violation';
  end if;

  if ((p_event_type = 'contract.created' and p_payload ->> 'type' = 'loi_extension')
      or p_event_type = 'contract.extension_rescheduled')
    and (p_payload ->> 'extends_to')::date <= v_exclusivity_ends_after then
    raise exception 'an LOI extension on deal % must end exclusivity after %', p_deal_id, v_exclusivity_ends_after
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted' and (p_payload ->> 'noted_on')::date > (
    select (now() at time zone coalesce(a.timezone, 'UTC'))::date
    from public.deal d join public.accounts a on a.id = d.account_id
    where d.id = p_deal_id
  ) then
    raise exception 'LOI extension % cannot be noted as agreed after today', p_aggregate_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted' and (p_payload ->> 'noted_on')::date < v_loi_signed_on then
    raise exception 'LOI extension % cannot be noted as agreed before the LOI was signed on %', p_aggregate_id, v_loi_signed_on
      using errcode = 'check_violation';
  end if;

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

-- A checklist item's owner is someone on the deal's team, and its linked
-- document is in the item's own deal. Checked where the event enters, so
-- history from before a member left still replays.
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

-- A reason for the deadline means nothing without the date it explains.
create or replace function public.check_deal_close_deadline_event(
  p_event_type text,
  p_payload jsonb
) returns void
  language plpgsql set search_path = '' as $$
begin
  if p_event_type = 'deal.close_deadline_set'
    and p_payload ->> 'must_close_reason' is not null
    and p_payload ->> 'must_close_by' is null then
    raise exception 'a close deadline reason needs a date' using errcode = 'check_violation';
  end if;
end;
$$;

-- Every deal has its business from the start.
create or replace function public.check_deal_created_event(
  p_event_type text,
  p_payload jsonb
) returns void
  language plpgsql set search_path = '' as $$
begin
  if p_event_type = 'deal.created' and p_payload ->> 'firm_id' is null then
    raise exception 'a new deal needs a firm' using errcode = 'check_violation';
  end if;
end;
$$;

-- contract.created overwrites the status of a contract that already exists;
-- contract.version_set changes it only when the payload names one. A new
-- contract starts as a draft.
create or replace function public.contract_event_changes_status(
  p_contract_id uuid,
  p_event_type text,
  p_payload jsonb
) returns boolean
  language sql stable set search_path = '' as $$
  select case p_event_type
    when 'contract.created' then
      case when c.id is null then coalesce(p_payload ->> 'status', 'draft') <> 'draft'
        else p_payload ->> 'status' is distinct from c.status end
    when 'contract.version_set' then
      p_payload ->> 'status' is not null and p_payload ->> 'status' is distinct from c.status
    else false
  end
  from (select 1) one
  left join public.contract c on c.id = p_contract_id;
$$;

-- The two checklist events of a request from the seller, and nothing more.
create or replace function public.is_seller_request_event(p_event_type text, p_payload jsonb)
  returns boolean
  language sql immutable set search_path = '' as $$
  select (p_event_type = 'checklist_item.status_changed' and p_payload - 'requested_at' = '{"status": "requested"}'::jsonb)
    or (p_event_type = 'checklist_item.waiting_on_set' and p_payload = '{"waiting_on": "seller"}'::jsonb);
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
      and not (p_event_type = 'checklist_item.note_posted' and public.has_deal_permission(p_deal_id, 'deals.work'))
      and not (public.is_seller_request_event(p_event_type, p_payload) and public.has_deal_permission(p_deal_id, 'deals.work')) then
      raise exception 'not authorized to append % on deal %: needs %',
        p_event_type, p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type)
        using errcode = 'insufficient_privilege';
    elsif p_event_type = 'contract.created' and p_payload ->> 'type' = 'loi_extension'
      and not public.has_deal_permission(p_deal_id, 'deals.manage') then
      raise exception 'not authorized to extend an LOI on deal %: needs deals.manage', p_deal_id
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
    perform public.check_deal_created_event(p_event_type, p_payload);
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
