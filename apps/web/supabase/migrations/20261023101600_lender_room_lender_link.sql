alter table public.lender_room add column lender_id uuid;

alter table public.lender_room add constraint lender_room_lender_fk
  foreign key (lender_id, account_id) references public.lender (id, account_id)
  on delete set null (lender_id);

update public.lender_room r
set lender_id = l.id
from public.lender l
where l.account_id = r.account_id
  and l.domain = r.brand_domain
  and (
    select count(*) from public.lender m
    where m.account_id = r.account_id and m.domain = r.brand_domain
  ) = 1;

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
    left join public.lender l on l.id = r.lender_id
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
