-- An update the deal team broadcasts once a second person approves it. The
-- team reads updates but changes them only through the functions below, which
-- hold the state machine: draft, then pending, then approved or rejected; a
-- rejected update is revised back to pending; a draft or pending update can be
-- withdrawn. Picks are the sender's groups and individuals; the server turns
-- them into people when an approver opens the update, and the approval
-- captures that list as recipients.

create type public.deal_update_status as enum ('draft', 'pending', 'approved', 'rejected', 'withdrawn');

create type public.deal_update_decision as enum ('approved', 'rejected');

create table if not exists public.deal_update (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  author_id uuid references auth.users on delete set null,
  subject text not null,
  body text not null,
  picks jsonb not null,
  status public.deal_update_status not null default 'draft',
  version int not null default 1,
  submitted_at timestamptz,
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (decided_by is null or decided_by <> author_id),
  constraint deal_update_rejection_noted check (status <> 'rejected' or coalesce(btrim(decision_note), '') <> '')
);

create index if not exists ix_deal_update_deal on public.deal_update (deal_id, created_at);

alter table public.deal_update enable row level security;

revoke all on public.deal_update from anon, authenticated, service_role;
grant select on public.deal_update to authenticated;
grant select, insert, update, delete on public.deal_update to service_role;

create policy deal_update_read on public.deal_update
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    and (status <> 'draft' or author_id = (select auth.uid()))
  );

-- One row per person an approved update goes to, as they stood on the deal
-- when it was approved. Delivery stamps sent_at or failed_at. A deleted user
-- or contact keeps their row, by name and email, with neither key set.
create table if not exists public.deal_update_recipient (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.deal_update (id) on delete cascade,
  user_id uuid references auth.users on delete set null,
  contact_id uuid references public.contact (id) on delete set null,
  email text not null,
  name text,
  entries public.deal_person_entry[] not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  error text,
  check (user_id is null or contact_id is null),
  unique (update_id, email)
);

create index if not exists ix_deal_update_recipient_update on public.deal_update_recipient (update_id);

alter table public.deal_update_recipient enable row level security;

revoke all on public.deal_update_recipient from anon, authenticated, service_role;
grant select on public.deal_update_recipient to authenticated;
grant select, insert, update, delete on public.deal_update_recipient to service_role;

create policy deal_update_recipient_read on public.deal_update_recipient
  for select to authenticated
  using (exists (
    select 1 from public.deal_update u
    where u.id = update_id and public.has_role_on_account(u.account_id)
  ));

create or replace function public.create_deal_update(deal_id uuid, subject text, body text, picks jsonb)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  made_id uuid;
begin
  insert into public.deal_update (account_id, deal_id, author_id, subject, body, picks)
  select d.account_id, d.id, (select auth.uid()), create_deal_update.subject, create_deal_update.body,
    create_deal_update.picks
  from public.deal d
  where d.id = create_deal_update.deal_id and public.has_deal_permission(d.id, 'deals.work')
  returning id into made_id;
  if made_id is null then
    raise exception 'not allowed to manage this deal' using errcode = 'insufficient_privilege';
  end if;
  return made_id;
end;
$$;

create or replace function public.authored_deal_update(update_id uuid)
  returns public.deal_update
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if the_update.author_id is distinct from (select auth.uid())
    or not public.has_deal_permission(the_update.deal_id, 'deals.work') then
    raise exception 'not allowed to change this update' using errcode = 'insufficient_privilege';
  end if;
  return the_update;
end;
$$;

revoke all on function public.authored_deal_update(uuid) from public, anon, authenticated;

create or replace function public.submit_deal_update(update_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status <> 'draft' then
    raise exception 'only a draft can be submitted';
  end if;
  update public.deal_update set status = 'pending', submitted_at = now() where id = update_id;
end;
$$;

create or replace function public.edit_deal_update(update_id uuid, subject text, body text, picks jsonb)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status not in ('draft', 'pending', 'rejected') then
    raise exception 'only a draft, pending or rejected update can be edited';
  end if;
  update public.deal_update u
  set subject = edit_deal_update.subject, body = edit_deal_update.body, picks = edit_deal_update.picks,
    status = case when u.status = 'draft' then 'draft' else 'pending' end::public.deal_update_status,
    version = u.version + 1
  where u.id = update_id;
end;
$$;

create or replace function public.withdraw_deal_update(update_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (public.authored_deal_update(update_id)).status not in ('draft', 'pending') then
    raise exception 'only a draft or pending update can be withdrawn';
  end if;
  update public.deal_update set status = 'withdrawn' where id = update_id;
end;
$$;

create or replace function public.decide_deal_update(
  update_id uuid, expected_version int, decision public.deal_update_decision, note text default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if not public.has_permission((select auth.uid()), the_update.account_id, 'deal_updates.approve') then
    raise exception 'not allowed to approve deal updates' using errcode = 'insufficient_privilege';
  end if;
  if the_update.author_id = (select auth.uid()) then
    raise exception 'the author cannot decide their own update' using errcode = 'insufficient_privilege';
  end if;
  if the_update.status <> 'pending' then
    raise exception 'only a pending update can be decided';
  end if;
  if the_update.version <> expected_version then
    raise exception 'this update changed since it was opened';
  end if;
  update public.deal_update
  set status = decision::text::public.deal_update_status, decided_by = (select auth.uid()),
    decided_at = now(), decision_note = note
  where id = update_id;
end;
$$;

-- The server resolves who an approval reaches and records them here, once:
-- an update that already has recipients keeps them.
create or replace function public.record_deal_update_recipients(update_id uuid, recipients jsonb)
  returns void
  language plpgsql
  set search_path = '' as $$
begin
  if (select u.status from public.deal_update u where u.id = record_deal_update_recipients.update_id) <> 'approved' then
    raise exception 'only an approved update takes recipients';
  end if;
  insert into public.deal_update_recipient (update_id, user_id, contact_id, email, name, entries)
  select record_deal_update_recipients.update_id, r.user_id, r.contact_id, r.email, r.name, r.entries
  from jsonb_populate_recordset(null::public.deal_update_recipient, recipients) r
  where not exists (
    select 1 from public.deal_update_recipient x where x.update_id = record_deal_update_recipients.update_id
  )
  on conflict on constraint deal_update_recipient_update_id_email_key do nothing;
end;
$$;

revoke all on function public.create_deal_update(uuid, text, text, jsonb) from public, anon;
revoke all on function public.submit_deal_update(uuid) from public, anon;
revoke all on function public.edit_deal_update(uuid, text, text, jsonb) from public, anon;
revoke all on function public.withdraw_deal_update(uuid) from public, anon;
revoke all on function public.decide_deal_update(uuid, int, public.deal_update_decision, text) from public, anon;
revoke all on function public.record_deal_update_recipients(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_deal_update_recipients(uuid, jsonb) to service_role;
grant execute on function public.create_deal_update(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.submit_deal_update(uuid) to authenticated, service_role;
grant execute on function public.edit_deal_update(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.withdraw_deal_update(uuid) to authenticated, service_role;
grant execute on function public.decide_deal_update(uuid, int, public.deal_update_decision, text)
  to authenticated, service_role;

-- ---- Billing lock ----
-- 'members' binds the team's own users, so a locked team can neither write nor
-- approve an update; delivery stamps recipients as a server job and finishes.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_update
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_update
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_update_recipient
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'update_id', 'deal_update');

create trigger same_team_contact_id
  before insert or update on public.deal_update_recipient
  for each row execute function tuckin.refuse_cross_team_link('update_id', 'deal_update', 'contact_id', 'contact');

-- ---- What outside parties see ----

-- Lenders, sellers and counsel read the updates sent to them, never who else
-- received one. Recipient rows exist only once an update is approved.
create or replace function public.deal_updates_sent_to_me(deal_id uuid)
  returns table (subject text, body text, sent_at timestamptz)
  language sql stable
  set search_path = '' as $$
  select u.subject, u.body, u.decided_at
  from public.deal_update u
  where u.deal_id = deal_updates_sent_to_me.deal_id
    and exists (
      select 1 from public.deal_update_recipient r
      where r.update_id = u.id and r.user_id = (select auth.uid())
    );
$$;

revoke all on function public.deal_updates_sent_to_me(uuid) from public, anon, authenticated;

create or replace function public.lender_room_updates(room_id uuid)
  returns table (subject text, body text, sent_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select s.subject, s.body, s.sent_at
  from public.lender_room r
  cross join public.deal_updates_sent_to_me(r.deal_id) s
  where r.id = lender_room_updates.room_id
    and public.is_lender_room_member(r.id)
  order by s.sent_at desc;
$$;

revoke all on function public.lender_room_updates(uuid) from public, anon;
grant execute on function public.lender_room_updates(uuid) to authenticated, service_role;

create or replace function public.seller_room_updates(room_id uuid)
  returns table (subject text, body text, sent_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select s.subject, s.body, s.sent_at
  from public.seller_room r
  cross join public.deal_updates_sent_to_me(r.deal_id) s
  where r.id = seller_room_updates.room_id
    and public.is_seller_room_member(r.id)
  order by s.sent_at desc;
$$;

revoke all on function public.seller_room_updates(uuid) from public, anon;
grant execute on function public.seller_room_updates(uuid) to authenticated, service_role;

create or replace function public.counsel_updates(deal_id uuid)
  returns table (subject text, body text, sent_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select s.subject, s.body, s.sent_at
  from public.deal_updates_sent_to_me(counsel_updates.deal_id) s
  where public.is_deal_counsel(counsel_updates.deal_id, 'buyer')
    or public.is_deal_counsel(counsel_updates.deal_id, 'seller')
  order by s.sent_at desc;
$$;

revoke all on function public.counsel_updates(uuid) from public, anon;
grant execute on function public.counsel_updates(uuid) to authenticated, service_role;
