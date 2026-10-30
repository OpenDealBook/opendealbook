-- LOI extensions: a contract of kind loi_extension extends a signed LOI of its
-- deal to a new exclusivity end date, and may be noted without a signed
-- document. Its counsel sign-off follows the deal's LOI gate. The end of
-- exclusivity is a milestone shared by default, kept on the team agenda once
-- lapsed until exclusivity is over.

alter table public.contract
  drop constraint contract_type_check,
  add constraint contract_type_check check (type in ('loi', 'apa', 'loi_extension')),
  add column parent_contract_id uuid references public.contract (id),
  add column extends_to date,
  add column note text,
  add column noted_on date,
  add constraint contract_extension_parent_check check ((type = 'loi_extension') = (parent_contract_id is not null)),
  add constraint contract_extension_extends_to_check check ((type = 'loi_extension') = (extends_to is not null)),
  add constraint contract_note_noted_on_check check ((note is null) = (noted_on is null)),
  add constraint contract_note_extension_check check (note is null or type = 'loi_extension');

alter table public.document_template
  drop constraint document_template_type_check,
  add constraint document_template_type_check
    check (type in ('nda', 'loi', 'apa', 'data_request', 'letter', 'loi_extension'));

create or replace function public.project_contract(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'contract.created' then
    insert into public.contract (id, deal_id, account_id, type, status, current_version, source_offer_version_id, parent_contract_id, extends_to, created_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      ev.payload ->> 'type',
      ev.payload ->> 'status',
      (ev.payload ->> 'current_version')::int,
      (ev.payload ->> 'source_offer_version_id')::uuid,
      (ev.payload ->> 'parent_contract_id')::uuid,
      (ev.payload ->> 'extends_to')::date,
      ev.actor_ref
    )
    on conflict (id) do update set
      status = excluded.status,
      current_version = excluded.current_version;
  elsif ev.event_type = 'contract.extension_noted' then
    update public.contract set
      note = ev.payload ->> 'note',
      noted_on = (ev.payload ->> 'noted_on')::date
    where id = ev.aggregate_id;
  elsif ev.event_type = 'contract.version_set' then
    update public.contract set
      current_version = (ev.payload ->> 'current_version')::int,
      status = coalesce(ev.payload ->> 'status', status)
    where id = ev.aggregate_id;
  -- Logged so counsel and the team can be told; the rows they name are
  -- written by the upload, the share and the comment themselves.
  elsif ev.event_type in ('contract.version_added', 'contract.version_shown_to_seller_side', 'contract.comment_posted',
    'contract.review_requested', 'contract.review_decided', 'contract.signing_overridden') then
  elsif ev.event_type = 'contract.signature_requested' then
    update public.contract_version cv set
      signing_document_id = ev.payload ->> 'signing_document_id',
      signing_status = 'draft'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  elsif ev.event_type = 'contract.signature_status_changed' then
    update public.contract_version cv set signing_status = ev.payload ->> 'status'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  else
    raise exception 'unknown contract event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.check_contract_event(
  p_deal_id uuid,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb
) returns void
  language plpgsql set search_path = '' as $$
begin
  if p_event_type = 'contract.created' and p_payload ->> 'type' = 'loi_extension' and not exists (
    select 1
    from public.contract c
    join public.contract_version cv on cv.contract_id = c.id
    where c.id = (p_payload ->> 'parent_contract_id')::uuid
      and c.deal_id = p_deal_id
      and c.type = 'loi'
      and cv.is_signed
  ) then
    raise exception 'an LOI extension on deal % must extend a signed LOI of that deal', p_deal_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted'
    and (coalesce(btrim(p_payload ->> 'note'), '') = '' or p_payload ->> 'noted_on' is null) then
    raise exception 'a note on LOI extension % needs its text and the day it was agreed', p_aggregate_id
      using errcode = 'check_violation';
  end if;

  if p_event_type = 'contract.extension_noted' and not exists (
    select 1 from public.contract c
    where c.id = p_aggregate_id and c.deal_id = p_deal_id and c.type = 'loi_extension'
  ) then
    raise exception 'contract % is not an LOI extension in deal %', p_aggregate_id, p_deal_id
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

-- An LOI extension follows its deal's LOI gate.
create or replace function public.contract_review_required(deal_id uuid, contract_type text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select coalesce(
    (
      select g.required from public.deal_contract_review_gate_change g
      where g.deal_id = contract_review_required.deal_id and g.contract_type = gate.contract_type
      order by g.changed_at desc
      limit 1
    ),
    (
      select public.contract_review_team_required(d.account_id, gate.contract_type)
      from public.deal d
      where d.id = contract_review_required.deal_id
    )
  )
  from (
    select case contract_review_required.contract_type when 'loi_extension' then 'loi'
      else contract_review_required.contract_type end as contract_type
  ) gate;
$$;

revoke all on function public.contract_review_required(uuid, text) from public, anon;
grant execute on function public.contract_review_required(uuid, text) to authenticated, service_role;

create or replace function public.project_deal_milestone(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_milestone.set' then
    -- One day of slack past UTC today, because it is already tomorrow in time
    -- zones ahead of UTC.
    if (ev.payload ->> 'actual_on')::date > current_date + 1 then
      raise exception 'a milestone''s actual date cannot be in the future' using errcode = 'check_violation';
    end if;
    insert into public.deal_milestone (id, account_id, deal_id, kind, label, target_on, actual_on, shared, created_at, updated_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'kind')::public.milestone_kind,
      ev.payload ->> 'label',
      (ev.payload ->> 'target_on')::date,
      (ev.payload ->> 'actual_on')::date,
      coalesce(
        (ev.payload ->> 'shared')::boolean,
        (ev.payload ->> 'kind') in ('loi_signed', 'exclusivity_end', 'apa_signing', 'closing', 'effective')
      ),
      ev.created_at, ev.created_at,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      label = excluded.label,
      target_on = excluded.target_on,
      actual_on = excluded.actual_on,
      shared = coalesce((ev.payload ->> 'shared')::boolean, deal_milestone.shared),
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where deal_milestone.deal_id = excluded.deal_id;
  elsif ev.event_type = 'deal_milestone.removed' then
    delete from public.deal_milestone
    where id = ev.aggregate_id and deal_id = ev.deal_id;
  else
    raise exception 'unknown deal_milestone event %', ev.event_type;
  end if;
end;
$$;

-- Exclusivity ends for good once the APA is signed, the deal is resolved
-- (closed, lost or otherwise) or archived, or the team records the day it
-- really ended, whatever its exclusivity end date says.
create or replace function public.deal_exclusivity_over(deal_id uuid)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (
      select 1 from public.deal d
      where d.id = deal_exclusivity_over.deal_id
        and (d.resolution is not null or d.archived_at is not null)
    )
    or exists (
      select 1 from public.contract c
      join public.contract_version v on v.contract_id = c.id
      where c.deal_id = deal_exclusivity_over.deal_id and c.type = 'apa' and v.is_signed
    )
    or exists (
      select 1 from public.deal_milestone m
      where m.deal_id = deal_exclusivity_over.deal_id and m.kind = 'exclusivity_end' and m.actual_on is not null
    );
$$;

revoke all on function public.deal_exclusivity_over(uuid) from public, anon;
grant execute on function public.deal_exclusivity_over(uuid) to authenticated, service_role;

create or replace function public.team_agenda(p_account_id uuid, p_whole_team boolean, p_as_of timestamptz default now())
  returns table (
    section text,
    kind text,
    item_id uuid,
    deal_id uuid,
    deal_name text,
    room_id uuid,
    title text,
    detail text,
    at timestamptz
  )
  language sql stable security invoker
  set search_path = '' as $$
  with caller as (
    select (select auth.uid()) as uid,
      public.has_permission((select auth.uid()), p_account_id, 'deals.manage') as manager
  ),
  scope as (
    select c.uid, c.manager, p_whole_team and c.manager as whole_team,
      public.team_home_new_since(p_account_id) as last_visit
    from caller c
  ),
  deals as (
    select d.id, f.name::text as name, d.archived_at, d.resolution
    from public.deal d
    join public.firm f on f.id = d.firm_id
    cross join scope s
    where d.account_id = p_account_id
      and (
        s.whole_team
        or d.owner_user_id = s.uid
        or exists (select 1 from public.checklist_item c where c.deal_id = d.id and c.owner_user_id = s.uid)
        or exists (select 1 from public.personal_todo t where t.deal_id = d.id and t.user_id = s.uid)
      )
  ),
  items as (
    select 'todo' as kind, t.id, t.deal_id, t.title, t.due_at
    from public.personal_todo t
    cross join scope s
    where t.account_id = p_account_id and not t.done and t.due_at is not null
      and (s.whole_team or t.user_id = s.uid)
    union all
    select 'checklist', c.id, c.deal_id, c.title::text, c.due_at
    from public.checklist_item c
    cross join scope s
    where c.account_id = p_account_id and c.status in ('not_started', 'requested') and c.due_at is not null
      and (s.whole_team or c.owner_user_id = s.uid or (s.manager and c.owner_user_id is null))
  ),
  activity as (
    select case a.action when 'document_uploaded' then 'seller_upload' else 'seller_answer' end as kind,
      coalesce(a.dr_document_id, (a.payload ->> 'question_id')::uuid) as id,
      r.deal_id, null::uuid as room_id,
      coalesce(doc.name, q.title) as title, null::text as detail, a.created_at as at
    from public.seller_room_activity a
    join public.seller_room r on r.id = a.room_id
    left join public.dr_document doc on doc.id = a.dr_document_id
    left join public.seller_room_question q on q.id = (a.payload ->> 'question_id')::uuid
    where a.side = 'seller' and a.action in ('document_uploaded', 'question_answered')
    union all
    select case k.kind when 'ask' then 'lender_ask' else 'lender_form' end, k.id, r.deal_id, r.id, k.title, null, k.created_at
    from public.lender_ask k
    join public.lender_room r on r.id = k.room_id
    union all
    select 'counsel_message', m.id, d.id, null, m.body, cs.side::text, m.created_at
    from deals d
    cross join unnest(enum_range(null::public.counsel_side)) as cs (side)
    cross join lateral public.counsel_thread(d.id, cs.side) m
    where not m.from_team
    union all
    select 'counsel_decision', v.id, c.deal_id, null, rd.decision::text, rd.side::text, rd.decided_at
    from public.contract_review_decision rd
    join public.contract_version v on v.id = rd.contract_version_id
    join public.contract c on c.id = v.contract_id
    where not exists (
      select 1 from public.accounts_memberships am where am.account_id = c.account_id and am.user_id = rd.decided_by
    )
  ),
  latest_requests as (
    select distinct on (r.contract_version_id) r.contract_version_id, r.requested_at
    from public.contract_review_request r
    where r.account_id = p_account_id
    order by r.contract_version_id, r.requested_at desc
  )
  select case when i.due_at::date < p_as_of::date then 'overdue' else 'due_soon' end,
    i.kind, i.id, i.deal_id, f.name::text, null::uuid, i.title, null::text, i.due_at as at
  from items i
  left join public.deal d on d.id = i.deal_id
  left join public.firm f on f.id = d.firm_id
  where i.due_at::date <= p_as_of::date + 7

  union all
  select 'approval', 'deal_update', u.id, u.deal_id, f.name::text, null, u.subject, null, u.submitted_at
  from public.deal_update u
  join public.deal d on d.id = u.deal_id
  join public.firm f on f.id = d.firm_id
  cross join scope s
  where u.account_id = p_account_id and u.status = 'pending'
    and u.author_id is distinct from s.uid
    and public.has_permission(s.uid, p_account_id, 'deal_updates.approve')

  union all
  select 'activity', a.kind, a.id, a.deal_id, d.name, a.room_id, a.title, a.detail, a.at
  from activity a
  join deals d on d.id = a.deal_id
  cross join scope s
  where a.at > s.last_visit

  -- A lapsed exclusivity end stays on the agenda until exclusivity is over.
  union all
  select 'deadline', 'milestone', m.id, m.deal_id, d.name, null, null, m.kind::text, m.target_on::timestamptz
  from public.deal_milestone m
  join deals d on d.id = m.deal_id
  where (
      m.kind in ('loi_deadline', 'financing_contingency', 'closing')
      and m.actual_on is null
      and m.target_on between p_as_of::date and p_as_of::date + 14
    )
    or (
      m.kind = 'exclusivity_end'
      and m.target_on <= p_as_of::date + 14
      and not public.deal_exclusivity_over(m.deal_id)
    )

  union all
  select 'deadline', 'must_close_by', k.deal_id, k.deal_id, d.name, null, null, k.must_close_reason, k.must_close_by::timestamptz
  from public.deal_close_deadline k
  join deals d on d.id = k.deal_id
  where k.must_close_by between p_as_of::date and p_as_of::date + 14

  union all
  select 'quiet_lender', 'quiet_lender', q.room_id, q.deal_id, d.name, q.room_id, r.name, q.days_silent::text, q.due_since
  from public.lender_rooms_due_nudge(p_account_id, p_as_of) q
  join deals d on d.id = q.deal_id
  join public.lender_room r on r.id = q.room_id
  where public.lender_room_outreach_sent(q.room_id)

  union all
  select 'signoff', 'signoff', v.id, c.deal_id, d.name, null, c.type, cs.side::text, lr.requested_at
  from latest_requests lr
  join public.contract_version v on v.id = lr.contract_version_id
  join public.contract c on c.id = v.contract_id and c.current_version = v.version
  join deals d on d.id = c.deal_id and d.archived_at is null and d.resolution is null
  cross join unnest(enum_range(null::public.counsel_side)) as cs (side)
  where public.contract_review_required(c.deal_id, c.type)
    and not exists (select 1 from public.contract_signing_override o where o.contract_version_id = v.id)
    and not exists (
      select 1 from public.contract_review_decision rd
      where rd.contract_version_id = v.id and rd.side = cs.side and rd.decided_at > lr.requested_at
    )

  order by at;
$$;

revoke all on function public.team_agenda(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.team_agenda(uuid, boolean, timestamptz) to authenticated;
