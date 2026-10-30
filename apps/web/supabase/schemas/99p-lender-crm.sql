-- A team's lender CRM: saved lenders and their contacts, the team's outreach
-- template, what a deal seeks from lenders, its hard close deadline, and each
-- lender room's answer to the closing timeline. Lender history needs no
-- storage of its own: rooms point at a saved lender by account and brand
-- domain (lender_history).

create type public.lender_rate_type as enum ('fixed', 'variable', 'either');
create type public.lender_timeline_answer as enum ('yes', 'no', 'need_to_talk');
create type public.lender_outreach_kind as enum ('outreach', 'nudge');
create type public.lender_outreach_status as enum ('sending', 'sent', 'failed');

-- domain is the website's host as lender_brand keys it: lowercase, no leading
-- www. The app derives it with brandDomain; the check refuses anything else.
create table if not exists public.lender (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  website text not null,
  domain text not null check (domain = lower(domain) and domain not like 'www.%'),
  rate_type public.lender_rate_type,
  typical_rate numeric,
  max_loan numeric,
  sba_preferred boolean not null default false,
  industries text[] not null default '{}',
  states text[] not null default '{}',
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, domain),
  unique (id, account_id)
);

alter table public.lender_room add column lender_id uuid;

alter table public.lender_room add constraint lender_room_lender_fk
  foreign key (lender_id, account_id) references public.lender (id, account_id)
  on delete set null (lender_id);

alter table public.lender enable row level security;

revoke all on public.lender from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender to authenticated;
grant select, insert, update, delete on public.lender to service_role;

create trigger lender_timestamps
  before insert or update on public.lender
  for each row execute function public.set_timestamps();

create trigger lender_user_tracking
  before insert or update on public.lender
  for each row execute function public.set_user_tracking();

create policy lender_read on public.lender
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy lender_insert on public.lender
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_update on public.lender
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_delete on public.lender
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create table if not exists public.lender_contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lender_id uuid not null,
  name text not null,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  foreign key (lender_id, account_id) references public.lender (id, account_id) on delete cascade
);

create index if not exists ix_lender_contact_lender on public.lender_contact (lender_id);

create unique index if not exists lender_contact_one_primary
  on public.lender_contact (lender_id) where is_primary;

alter table public.lender_contact enable row level security;

revoke all on public.lender_contact from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_contact to authenticated;
grant select, insert, update, delete on public.lender_contact to service_role;

create trigger lender_contact_timestamps
  before insert or update on public.lender_contact
  for each row execute function public.set_timestamps();

create trigger lender_contact_user_tracking
  before insert or update on public.lender_contact
  for each row execute function public.set_user_tracking();

create policy lender_contact_read on public.lender_contact
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy lender_contact_insert on public.lender_contact
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_contact_update on public.lender_contact
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_contact_delete on public.lender_contact
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- No row means the app's built-in default.
create table if not exists public.lender_outreach_template (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  subject text not null,
  body text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.lender_outreach_template enable row level security;

revoke all on public.lender_outreach_template from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_outreach_template to authenticated;
grant select, insert, update, delete on public.lender_outreach_template to service_role;

create trigger lender_outreach_template_timestamps
  before insert or update on public.lender_outreach_template
  for each row execute function public.set_timestamps();

create trigger lender_outreach_template_user_tracking
  before insert or update on public.lender_outreach_template
  for each row execute function public.set_user_tracking();

create policy lender_outreach_template_read on public.lender_outreach_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy lender_outreach_template_insert on public.lender_outreach_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_outreach_template_update on public.lender_outreach_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy lender_outreach_template_delete on public.lender_outreach_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- What a deal asks of lenders, one editable row per deal like deal_thesis.
-- loan_type takes the funding source types of @odb/calculators.
create table if not exists public.deal_terms_sought (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null unique references public.deal (id) on delete cascade,
  loan_amount numeric,
  loan_type text check (loan_type in (
    'sba_7a', 'sba_504', 'conventional', 'seller_financing', 'cash_equity',
    'heloc', 'robs_401k', 'investor_equity', 'mezzanine', 'other'
  )),
  term_years numeric,
  rate_type public.lender_rate_type,
  seller_note_amount numeric,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_terms_sought enable row level security;

revoke all on public.deal_terms_sought from anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_terms_sought to authenticated;
grant select, insert, update, delete on public.deal_terms_sought to service_role;

create trigger deal_terms_sought_timestamps
  before insert or update on public.deal_terms_sought
  for each row execute function public.set_timestamps();

create trigger deal_terms_sought_user_tracking
  before insert or update on public.deal_terms_sought
  for each row execute function public.set_user_tracking();

create policy deal_terms_sought_read on public.deal_terms_sought
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_terms_sought_insert on public.deal_terms_sought
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_terms_sought_update on public.deal_terms_sought
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_terms_sought_delete on public.deal_terms_sought
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- The deal's hard close deadline and why. Written only through the deal log by
-- deal.close_deadline_set, whose payload is must_close_by and must_close_reason;
-- the latest event replaces both, and a reason needs a date. The target close date stays on the closing
-- milestone.
create table if not exists public.deal_close_deadline (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  must_close_by date,
  must_close_reason text,
  check (must_close_reason is null or must_close_by is not null)
);

alter table public.deal_close_deadline enable row level security;

revoke all on public.deal_close_deadline from anon, authenticated, service_role;
grant select on public.deal_close_deadline to authenticated;
grant select on public.deal_close_deadline to service_role;

create policy deal_close_deadline_read on public.deal_close_deadline
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create or replace function public.project_deal_close_deadline(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deal_close_deadline (deal_id, account_id, must_close_by, must_close_reason)
  values (
    ev.aggregate_id, ev.account_id,
    (ev.payload ->> 'must_close_by')::date,
    ev.payload ->> 'must_close_reason'
  )
  on conflict (deal_id) do update set
    must_close_by = excluded.must_close_by,
    must_close_reason = excluded.must_close_reason;
end;
$$;

-- A room's answer to the closing timeline, one row per room and the latest
-- answer wins. Lenders only read it: their answers are written by server code
-- with the service role after it has checked the room's membership.
create table if not exists public.lender_room_timeline_answer (
  room_id uuid primary key references public.lender_room (id) on delete cascade,
  answer public.lender_timeline_answer not null,
  answered_at timestamptz not null default now(),
  answered_by uuid references auth.users,
  source public.lender_side not null,
  note text,
  earliest_close_date date,
  check (earliest_close_date is null or answer = 'no')
);

alter table public.lender_room_timeline_answer enable row level security;

revoke all on public.lender_room_timeline_answer from anon, authenticated, service_role;
grant select, insert, update on public.lender_room_timeline_answer to authenticated;
grant select, insert, update, delete on public.lender_room_timeline_answer to service_role;

create policy lender_room_timeline_answer_read on public.lender_room_timeline_answer
  for select to authenticated
  using (
    public.is_lender_room_member(room_id)
    or public.can_manage_lender_room(room_id)
  );

create policy lender_room_timeline_answer_insert on public.lender_room_timeline_answer
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id) and source = 'internal');

create policy lender_room_timeline_answer_update on public.lender_room_timeline_answer
  for update to authenticated
  using (public.can_manage_lender_room(room_id))
  with check (public.can_manage_lender_room(room_id) and source = 'internal');

-- Every outreach email to a lender room, written before it is sent and then
-- marked sent or failed. Internal only: lenders read nothing here, no one
-- deletes a row, and the one update allowed is the sender marking a sending
-- row, which may also fill the provider ids.
create table if not exists public.lender_room_outreach (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  sent_by uuid references auth.users on delete set null default auth.uid(),
  sent_at timestamptz not null default now(),
  to_email text not null,
  subject text not null,
  body text not null,
  kind public.lender_outreach_kind not null default 'outreach',
  provider_thread_id text,
  provider_message_id text,
  status public.lender_outreach_status not null default 'sending',
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade
);

create index if not exists ix_lender_room_outreach_room on public.lender_room_outreach (room_id, sent_at);

alter table public.lender_room_outreach enable row level security;

revoke all on public.lender_room_outreach from anon, authenticated, service_role;
grant select, insert on public.lender_room_outreach to authenticated;
grant update (status, provider_thread_id, provider_message_id) on public.lender_room_outreach to authenticated;
grant select, insert on public.lender_room_outreach to service_role;
grant update (status) on public.lender_room_outreach to service_role;

create policy lender_room_outreach_read on public.lender_room_outreach
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_outreach_insert on public.lender_room_outreach
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id) and sent_by = (select auth.uid()) and status = 'sending');

create policy lender_room_outreach_mark on public.lender_room_outreach
  for update to authenticated
  using (public.can_manage_lender_room(room_id) and sent_by = (select auth.uid()) and status = 'sending')
  with check (public.can_manage_lender_room(room_id) and sent_by = (select auth.uid()) and status in ('sent', 'failed'));

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
-- outreach sent, else from the room's creation. Silence is measured up to
-- p_as_of, which only the e2e stack moves off now(). Managers read every
-- room; a teammate with deals.work reads only rooms on deals they own or hold
-- assigned work on, and sending a nudge still needs a manager.
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

revoke all on function public.lender_rooms_due_nudge(uuid, timestamptz) from public, anon;
grant execute on function public.lender_rooms_due_nudge(uuid, timestamptz) to authenticated, service_role;

-- The rooms a saved lender has had: those of its team whose brand domain is
-- the lender's domain. Rooms are readable by the deal's managers alone, so
-- history is too.
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

revoke all on function public.lender_history(uuid) from public, anon;
grant execute on function public.lender_history(uuid) to authenticated, service_role;

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

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_contact
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_outreach_template
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_terms_sought
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_terms_sought
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_close_deadline
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_close_deadline
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_timeline_answer
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert on public.lender_room_outreach
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_nudge_setting
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_email_reply
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

-- One to-do per lender room and teammate, made by the daily nudge job to point
-- the teammate at a room that is due a nudge, and cleared by the sync job once
-- the room no longer is. A to-do deleted by hand leaves its link with a null
-- todo_id, so the room is not nudged again for that teammate until the link
-- is cleared. Service role only.
create table if not exists public.lender_nudge_todo (
  room_id uuid not null references public.lender_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  todo_id uuid references public.personal_todo (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.lender_nudge_todo enable row level security;

revoke all on public.lender_nudge_todo from anon, authenticated, service_role;
grant select, insert, delete on public.lender_nudge_todo to service_role;

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('lender_nudge_todo', 'service-role only, links a teammate''s nudge to-do to a room')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.lender_nudge_todo
  for each row execute function odb.refuse_team_move();
