-- LOI extension rules: an extension extends the deal's current signed LOI and
-- ends exclusivity after the current end, or after the LOI was signed when no
-- end is set. Its date may be corrected until it is signed or noted. A note is
-- dated no later than today in the team's time zone and no earlier than the
-- LOI signing, and a signed extension is never noted.

alter table public.contract
  drop constraint contract_note_noted_on_check,
  drop constraint contract_note_extension_check;

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
  elsif ev.event_type = 'contract.extension_rescheduled' then
    update public.contract set extends_to = (ev.payload ->> 'extends_to')::date
    where id = ev.aggregate_id;
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
