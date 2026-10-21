create type public.lender_outreach_kind as enum ('outreach', 'nudge');

alter table public.lender_room_outreach
  add column kind public.lender_outreach_kind not null default 'outreach',
  add column provider_thread_id text,
  add column provider_message_id text;

-- Quiet days before an open room is due a nudge. No row means five.
create table if not exists public.lender_nudge_setting (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  quiet_days int not null default 5 check (quiet_days > 0)
);

alter table public.lender_nudge_setting enable row level security;

revoke all on public.lender_nudge_setting from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_nudge_setting to authenticated;
grant select, insert, update, delete on public.lender_nudge_setting to service_role;

create policy lender_nudge_setting_read on public.lender_nudge_setting
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy lender_nudge_setting_insert on public.lender_nudge_setting
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_nudge_setting_update on public.lender_nudge_setting
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_nudge_setting_delete on public.lender_nudge_setting
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- An email reply from a lender on a room, recorded by the mailbox sync job
-- with the service role. Lenders read nothing here.
create table if not exists public.lender_room_email_reply (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  received_at timestamptz not null,
  provider_message_id text not null,
  unique (room_id, provider_message_id),
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade
);

alter table public.lender_room_email_reply enable row level security;

revoke all on public.lender_room_email_reply from anon, authenticated, service_role;
grant select on public.lender_room_email_reply to authenticated;
grant select, insert on public.lender_room_email_reply to service_role;

create policy lender_room_email_reply_read on public.lender_room_email_reply
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

-- Open rooms still invited or reviewing whose silence has outlasted the team's
-- quiet days, counted from the latest of the lender's last word, the last
-- nudge sent and the room's creation. The lender's last word is any lender
-- side activity, any ask, any lender message, a lender timeline answer or a
-- recorded email reply. days_silent counts from that word, else from the first
-- outreach sent, else from the room's creation.
create or replace function public.lender_rooms_due_nudge(p_account_id uuid)
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
    floor(extract(epoch from now() - coalesce(t.heard, t.first_sent, t.room_created_at)) / 86400)::int,
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
      select max(u.sent_at) as last_nudge from public.lender_room_outreach u where u.room_id = r.id and u.kind = 'nudge'
    ) n
    cross join lateral (
      select min(u.sent_at) as first_sent from public.lender_room_outreach u where u.room_id = r.id and u.kind = 'outreach'
    ) o
    where r.account_id = p_account_id
      and public.has_permission((select auth.uid()), p_account_id, 'deals.manage')
      and public.lender_room_is_open(r)
      and r.status in ('invited', 'reviewing')
  ) t
  where now() > t.due_since
  order by t.due_since, t.room_id;
$$;

revoke all on function public.lender_rooms_due_nudge(uuid) from public, anon;
grant execute on function public.lender_rooms_due_nudge(uuid) to authenticated, service_role;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_nudge_setting
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_email_reply
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');
