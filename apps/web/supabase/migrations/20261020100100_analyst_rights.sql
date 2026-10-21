delete from public.role_permissions where role = 'member' and permission = 'settings.manage';

insert into public.role_permissions (role, permission) values
  ('owner', 'deals.work'),
  ('admin', 'deals.work'),
  ('deal_lead', 'deals.work'),
  ('analyst', 'deals.work'),
  ('member', 'deals.create'),
  ('member', 'deals.work'),
  ('member', 'checklists.manage')
on conflict do nothing;

drop function public.deal_event_permission(text);

create or replace function public.deal_event_permission(p_aggregate_type text, p_event_type text)
  returns text
  language sql immutable set search_path = '' as $$
  select case
    when p_event_type in ('offer.drafted', 'offer.version_added', 'contract.created', 'contract.version_added',
      'contract.version_set', 'dr_document.added') then 'deals.work'
    when p_aggregate_type = 'checklist_item' then 'checklists.manage'
    when p_aggregate_type = 'deal_participant' then 'participants.manage'
    else 'deals.manage'
  end;
$$;

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
      and not (p_event_type = 'checklist_item.due_recomputed' and public.has_deal_permission(p_deal_id, 'deals.manage')) then
      raise exception 'not authorized to append % on deal %: needs %',
        p_event_type, p_deal_id, public.deal_event_permission(p_aggregate_type, p_event_type)
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

drop policy data_room_objects_read on storage.objects;
create policy data_room_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.work')
  );

drop policy data_room_objects_insert on storage.objects;
create policy data_room_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.work')
  );

create or replace function public.can_ask_in_seller_room(room_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.seller_room r
    where r.id = can_ask_in_seller_room.room_id
      and public.has_deal_permission(r.deal_id, 'deals.work')
  );
$$;

grant execute on function public.can_ask_in_seller_room(uuid) to authenticated, service_role;

drop policy seller_room_question_insert on public.seller_room_question;
create policy seller_room_question_insert on public.seller_room_question
  for insert to authenticated
  with check (public.can_ask_in_seller_room(room_id));
