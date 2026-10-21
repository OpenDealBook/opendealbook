-- The team Home agenda: what needs the caller today, read under their own
-- row security. "My deals" are deals they own or hold an item on; a manager's
-- whole-team view covers every deal. Outside activity counts from the
-- caller's last visit to Home, else from when they joined the team.

create table if not exists public.team_home_visit (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

alter table public.team_home_visit enable row level security;

revoke all on public.team_home_visit from anon, authenticated, service_role;
grant select, insert, update on public.team_home_visit to authenticated;
grant select, insert, update, delete on public.team_home_visit to service_role;

create policy team_home_visit_read on public.team_home_visit
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy team_home_visit_insert on public.team_home_visit
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_role_on_account(account_id));

create policy team_home_visit_update on public.team_home_visit
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_role_on_account(account_id));

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('team_home_visit', 'a person''s own marker of when they last opened Home')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.team_home_visit
  for each row execute function tuckin.refuse_team_move();

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
      coalesce(
        (select v.visited_at from public.team_home_visit v where v.account_id = p_account_id and v.user_id = c.uid),
        (select m.created_at from public.accounts_memberships m where m.account_id = p_account_id and m.user_id = c.uid)
      ) as last_visit
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
  where exists (
    select 1 from public.lender_room_outreach o
    where o.room_id = q.room_id and o.kind = 'outreach' and o.status = 'sent'
  )

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
