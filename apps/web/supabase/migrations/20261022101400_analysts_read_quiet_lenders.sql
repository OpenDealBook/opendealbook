create or replace function public.lender_rooms_due_nudge(p_account_id uuid, p_as_of timestamptz default now())
  returns table (
    lender_id uuid,
    room_id uuid,
    deal_id uuid,
    deal_name text,
    last_heard_at timestamptz,
    days_silent int,
    due_since timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select t.lender_id, t.room_id, t.deal_id, t.deal_name, t.heard,
    floor(extract(epoch from p_as_of - coalesce(t.heard, t.first_sent, t.room_created_at)) / 86400)::int,
    t.due_since
  from (
    select l.id as lender_id, r.id as room_id, r.deal_id, f.name::text as deal_name,
      h.heard, o.first_sent, r.created_at as room_created_at,
      greatest(h.heard, n.last_nudge, r.created_at) + make_interval(days => s.quiet_days) as due_since
    from public.lender_room r
    join public.deal d on d.id = r.deal_id
    left join public.firm f on f.id = d.firm_id
    left join public.lender l on l.account_id = r.account_id and l.domain = r.brand_domain
    cross join lateral (
      select coalesce((select ns.quiet_days from public.lender_nudge_setting ns where ns.account_id = p_account_id), 5) as quiet_days
    ) s
    cross join lateral (
      select greatest(
        (select max(a.created_at) from public.lender_room_activity a where a.room_id = r.id and a.side = 'lender'),
        (select max(k.created_at) from public.lender_ask k where k.room_id = r.id),
        (select max(m.created_at) from public.lender_ask_message m join public.lender_ask k on k.id = m.ask_id
          where k.room_id = r.id and m.side = 'lender'),
        (select max(w.answered_at) from public.lender_room_timeline_answer w where w.room_id = r.id and w.source = 'lender'),
        (select max(e.received_at) from public.lender_room_email_reply e where e.room_id = r.id)
      ) as heard
    ) h
    cross join lateral (
      select max(u.sent_at) as last_nudge from public.lender_room_outreach u where u.room_id = r.id and u.kind = 'nudge' and u.status = 'sent'
    ) n
    cross join lateral (
      select min(u.sent_at) as first_sent from public.lender_room_outreach u where u.room_id = r.id and u.kind = 'outreach' and u.status = 'sent'
    ) o
    where r.account_id = p_account_id
      and (
        (select auth.role()) = 'service_role'
        or public.has_permission((select auth.uid()), p_account_id, 'deals.manage')
        or (
          public.has_permission((select auth.uid()), p_account_id, 'deals.work')
          and (
            d.owner_user_id = (select auth.uid())
            or exists (
              select 1 from public.checklist_item c
              where c.deal_id = d.id and c.owner_user_id = (select auth.uid()) and c.removed_at is null
            )
            or exists (select 1 from public.personal_todo t where t.deal_id = d.id and t.user_id = (select auth.uid()))
          )
        )
      )
      and public.lender_room_is_open(r)
      and r.status in ('invited', 'reviewing')
  ) t
  where p_as_of > t.due_since
  order by t.due_since, t.room_id;
$$;


-- Whether a room was ever sent outreach, for teammates who work the deal but
-- cannot read the outreach log itself.
create or replace function public.lender_room_outreach_sent(p_room_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.can_work_lender_room(p_room_id)
    and exists (
      select 1 from public.lender_room_outreach o
      where o.room_id = p_room_id and o.kind = 'outreach' and o.status = 'sent'
    );
$$;

revoke all on function public.lender_room_outreach_sent(uuid) from public, anon;
grant execute on function public.lender_room_outreach_sent(uuid) to authenticated;

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
  where m.kind in ('loi_deadline', 'financing_contingency', 'closing')
    and m.actual_on is null
    and m.target_on between p_as_of::date and p_as_of::date + 14

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
