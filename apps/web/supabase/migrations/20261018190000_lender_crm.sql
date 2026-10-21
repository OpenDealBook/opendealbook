-- A team's lender CRM: saved lenders and their contacts, the team's outreach
-- template, what a deal seeks from lenders, its hard close deadline, and each
-- lender room's answer to the closing timeline. Lender history needs no
-- storage of its own: rooms point at a saved lender by account and brand
-- domain (lender_history).

create type public.lender_rate_type as enum ('fixed', 'variable', 'either');
create type public.lender_timeline_answer as enum ('yes', 'no', 'need_to_talk');

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
-- the latest event replaces both. The target close date stays on the closing
-- milestone.
create table if not exists public.deal_close_deadline (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  must_close_by date,
  must_close_reason text
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
  source public.lender_side not null
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
    (select count(*) from public.lender_ask a where a.room_id = r.id)
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

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_outreach_template
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_terms_sought
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_terms_sought
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_close_deadline
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_close_deadline
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_room_timeline_answer
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');

alter type public.lender_room_summary
  add attribute target_close_date date,
  add attribute must_close_by date,
  add attribute must_close_reason text;

create or replace function public.lender_room_deadline(deal_id uuid)
  returns table (must_close_by date, must_close_reason text)
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select c.must_close_by, c.must_close_reason
  from public.deal_close_deadline c
  where c.deal_id = lender_room_deadline.deal_id;
end;
$$;

revoke all on function public.lender_room_deadline(uuid) from public, anon, authenticated;

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
    public.close_date(d),
    dl.must_close_by,
    dl.must_close_reason
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

create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.close_deadline_set' then
    perform public.project_deal_close_deadline(ev);
  elsif ev.aggregate_type = 'deal' then
    perform public.project_deal(ev);
  elsif ev.aggregate_type = 'deal_box' then
    perform public.project_deal_box(ev);
  elsif ev.aggregate_type = 'checklist_item' then
    perform public.project_checklist_item(ev);
  elsif ev.aggregate_type = 'approval' then
    perform public.project_approval(ev);
  elsif ev.aggregate_type = 'deal_participant' then
    perform public.project_deal_participant(ev);
  elsif ev.aggregate_type = 'dr_document' then
    perform public.project_dr_document(ev);
  elsif ev.aggregate_type = 'meeting' then
    perform public.project_meeting(ev);
  elsif ev.aggregate_type = 'meeting_action_item' then
    perform public.project_meeting_action_item(ev);
  elsif ev.aggregate_type = 'contract' then
    perform public.project_contract(ev);
  elsif ev.aggregate_type = 'offer' then
    perform public.project_offer(ev);
  elsif ev.aggregate_type = 'deal_milestone' then
    perform public.project_deal_milestone(ev);
  -- History only; delivery state lives on deal_update_recipient.
  elsif ev.aggregate_type = 'deal_update' then
    null;
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;
