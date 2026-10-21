alter table public.deal_close_deadline
  add constraint deal_close_deadline_check check (must_close_reason is null or must_close_by is not null);

create or replace function public.lender_history(lender_id uuid)
  returns table (
    room_id uuid,
    deal_id uuid,
    deal_name text,
    room_created_at timestamptz,
    status public.lender_room_status,
    asks_count bigint
  )
  language sql stable security definer
  set search_path = '' as $$
  select r.id, r.deal_id, f.name::text, r.created_at, r.status,
    (select count(*) from public.lender_ask a where a.room_id = r.id and a.kind = 'ask')
  from public.lender l
  join public.lender_room r on r.account_id = l.account_id and r.brand_domain = l.domain
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  where l.id = lender_history.lender_id
    and public.has_permission((select auth.uid()), l.account_id, 'deals.manage')
  order by r.created_at desc, r.id;
$$;

-- Runs as the caller, so the deals.manage policies of lender_contact apply.
-- Demote first, then promote, so lender_contact_one_primary is never tripped.
create or replace function public.set_lender_contact_primary(contact_id uuid)
  returns void
  language plpgsql
  set search_path = '' as $$
begin
  update public.lender_contact
  set is_primary = false
  where is_primary
    and lender_id = (select c.lender_id from public.lender_contact c where c.id = set_lender_contact_primary.contact_id);

  update public.lender_contact
  set is_primary = true
  where id = set_lender_contact_primary.contact_id;
end;
$$;

revoke all on function public.set_lender_contact_primary(uuid) from public, anon;
grant execute on function public.set_lender_contact_primary(uuid) to authenticated, service_role;

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

create or replace function public.lender_room_view(room_id uuid)
  returns setof public.lender_room_summary
  language sql security definer
  set search_path = '' as $$
  select
    r.id,
    r.deal_id,
    r.name,
    case when a.full_row then r.welcome_note end,
    r.expires_at,
    public.lender_room_is_open(r),
    case when a.full_row then r.private_folder_id end,
    case when a.full_row then p.master_folder_id end,
    b.name,
    b.logo_path,
    f.name::text,
    d.description,
    case when a.full_row then public.close_date(d) end,
    case when a.full_row then dl.must_close_by end,
    case when a.full_row then dl.must_close_reason end
  from public.lender_room r
  cross join lateral (
    select
      public.can_manage_lender_room(r.id) as manages,
      public.can_manage_lender_room(r.id) or public.lender_room_is_open(r) as full_row
  ) a
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  left join public.lender_package p on p.deal_id = r.deal_id
  left join public.lender_brand b on b.domain = r.brand_domain
  left join lateral public.lender_room_deadline(r.deal_id) dl on true
  where r.id = lender_room_view.room_id
    and (
      a.manages
      or exists (
        select 1 from public.lender_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;
