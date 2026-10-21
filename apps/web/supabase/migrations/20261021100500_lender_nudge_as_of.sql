drop function public.lender_rooms_due_nudge(uuid);

-- Open rooms still invited or reviewing whose silence has outlasted the team's
-- quiet days, counted from the latest of the lender's last word, the last
-- nudge sent and the room's creation. The lender's last word is any lender
-- side activity, any ask, any lender message, a lender timeline answer or a
-- recorded email reply. days_silent counts from that word, else from the first
-- outreach sent, else from the room's creation. Silence is measured up to
-- p_as_of, which only the e2e stack moves off now().
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
      and ((select auth.role()) = 'service_role' or public.has_permission((select auth.uid()), p_account_id, 'deals.manage'))
      and public.lender_room_is_open(r)
      and r.status in ('invited', 'reviewing')
  ) t
  where p_as_of > t.due_since
  order by t.due_since, t.room_id;
$$;

revoke all on function public.lender_rooms_due_nudge(uuid, timestamptz) from public, anon;
grant execute on function public.lender_rooms_due_nudge(uuid, timestamptz) to authenticated, service_role;
