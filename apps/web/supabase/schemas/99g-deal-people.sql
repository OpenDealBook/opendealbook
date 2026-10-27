-- People on a deal. Team members, room members and counsel come from their own
-- tables; only outside people the team adds by hand live here, as address book
-- contacts placed on a deal. Each side has one main contact, and the lender
-- side has one per lender room.

create table if not exists public.deal_contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  contact_id uuid not null references public.contact (id) on delete cascade,
  side public.deal_side not null,
  role public.deal_person_role not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, contact_id),
  unique (deal_id, contact_id, side)
);

create index if not exists ix_deal_contact_contact on public.deal_contact (contact_id);

alter table public.deal_contact enable row level security;

revoke all on public.deal_contact from anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_contact to authenticated;
grant select, insert, update, delete on public.deal_contact to service_role;

create trigger deal_contact_timestamps
  before insert or update on public.deal_contact
  for each row execute function public.set_timestamps();

create trigger deal_contact_user_tracking
  before insert or update on public.deal_contact
  for each row execute function public.set_user_tracking();

create policy deal_contact_read on public.deal_contact
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_contact_insert on public.deal_contact
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy deal_contact_update on public.deal_contact
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy deal_contact_delete on public.deal_contact
  for delete to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

-- A star is someone on its side of this deal. The composite keys tie a contact
-- star to a hand-added contact on that side, and a lender star to one of the
-- deal's own lender rooms; the trigger below checks a user star. Hand-added
-- lender people belong to no room, so a lender star is always a room member.
create table if not exists public.deal_main_contact (
  deal_id uuid not null references public.deal (id) on delete cascade,
  side public.deal_side not null,
  lender_room_id uuid,
  user_id uuid references auth.users on delete cascade,
  contact_id uuid,
  unique nulls not distinct (deal_id, side, lender_room_id),
  foreign key (lender_room_id, deal_id) references public.lender_room (id, deal_id) on delete cascade,
  foreign key (deal_id, contact_id, side) references public.deal_contact (deal_id, contact_id, side) on delete cascade,
  check ((user_id is null) <> (contact_id is null)),
  check ((side = 'lender') = (lender_room_id is not null)),
  check (side <> 'lender' or contact_id is null)
);

alter table public.deal_main_contact enable row level security;

create or replace function public.main_contact_on_side(
  deal_id uuid, side public.deal_side, lender_room_id uuid, user_id uuid
)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select case main_contact_on_side.side
    when 'lender' then exists (
      select 1 from public.lender_room_member m
      where m.room_id = main_contact_on_side.lender_room_id and m.user_id = main_contact_on_side.user_id
    )
    when 'buyer' then exists (
      select 1 from public.deal d
      join public.accounts_memberships am on am.account_id = d.account_id
      where d.id = main_contact_on_side.deal_id and am.user_id = main_contact_on_side.user_id
    ) or exists (
      select 1 from public.deal_counsel c
      where c.deal_id = main_contact_on_side.deal_id and c.side = 'buyer'
        and c.user_id = main_contact_on_side.user_id
    )
    when 'seller' then exists (
      select 1 from public.seller_room_member m
      join public.seller_room r on r.id = m.room_id
      where r.deal_id = main_contact_on_side.deal_id and m.user_id = main_contact_on_side.user_id
    ) or exists (
      select 1 from public.deal_counsel c
      where c.deal_id = main_contact_on_side.deal_id and c.side = 'seller'
        and c.user_id = main_contact_on_side.user_id
    )
  end;
$$;

revoke all on function public.main_contact_on_side(uuid, public.deal_side, uuid, uuid) from public, anon, authenticated;

create or replace function public.refuse_main_contact_off_side()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if new.user_id is not null
    and not public.main_contact_on_side(new.deal_id, new.side, new.lender_room_id, new.user_id) then
    raise exception 'a main contact must be on its side' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger main_contact_on_side
  before insert or update on public.deal_main_contact
  for each row execute function public.refuse_main_contact_off_side();

-- A person who leaves a side loses any star they held on it: leaving the
-- team, a lender room or the seller room, or being removed as counsel.
-- Someone still on the side another way keeps theirs.
create or replace function public.clear_departed_main_contacts()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.deal_main_contact mc
  where mc.user_id = old.user_id
    and not public.main_contact_on_side(mc.deal_id, mc.side, mc.lender_room_id, mc.user_id);
  return old;
end;
$$;

create trigger clear_departed_main_contacts
  after delete on public.accounts_memberships
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.lender_room_member
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.seller_room_member
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.deal_counsel
  for each row execute function public.clear_departed_main_contacts();

-- A contact moved to another side has left the side they were starred on.
create or replace function public.clear_main_contact_on_side_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.deal_main_contact mc
  where mc.deal_id = old.deal_id and mc.contact_id = old.contact_id and mc.side = old.side;
  return new;
end;
$$;

create trigger clear_main_contact_on_side_change
  before update of side on public.deal_contact
  for each row when (old.side is distinct from new.side)
  execute function public.clear_main_contact_on_side_change();

revoke all on public.deal_main_contact from anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_main_contact to authenticated;
grant select, insert, update, delete on public.deal_main_contact to service_role;

create policy deal_main_contact_read on public.deal_main_contact
  for select to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.has_role_on_account(d.account_id)
  ));

create policy deal_main_contact_insert on public.deal_main_contact
  for insert to authenticated
  with check (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

create policy deal_main_contact_update on public.deal_main_contact
  for update to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ))
  with check (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

create policy deal_main_contact_delete on public.deal_main_contact
  for delete to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

-- One place a person stands on a deal. Role is a label: the deal_person_role
-- values, plus 'lender' and 'seller' for room members. room_closed is null
-- outside rooms.
create type public.deal_person_entry as (
  source text,
  contact_id uuid,
  name text,
  phone text,
  company text,
  side public.deal_side,
  role text,
  lender_room_id uuid,
  room_closed boolean,
  is_main boolean
);

-- Everyone on a deal, for the team, one row per person. Worked out on every
-- read from where each person lives, so someone removed from a room or as
-- counsel is gone. Entries with the same email, ignoring case, are one person;
-- a pulled person's email is their sign-in email. A person is named by their
-- own profile, else as a contact.
create or replace function public.deal_people(deal_id uuid)
  returns table (
    user_id uuid,
    email text,
    name text,
    entries public.deal_person_entry[]
  )
  language sql stable security definer
  set search_path = '' as $$
  with the_deal as (
    select d.id, d.account_id, a.name::text as team_name
    from public.deal d
    join public.accounts a on a.id = d.account_id
    where d.id = deal_people.deal_id and public.has_role_on_account(d.account_id)
  ),
  team as (
    select am.user_id, the_deal.team_name
    from the_deal
    join public.accounts_memberships am on am.account_id = the_deal.account_id
  ),
  pulled as (
    select t.user_id, 'team' as source, a.name::text as name, a.phone, t.team_name as company,
      'buyer'::public.deal_side as side, 'principal' as role, null::uuid as lender_room_id,
      null::boolean as room_closed
    from team t
    join public.accounts a on a.primary_owner_user_id = t.user_id and a.is_personal_account
    union all
    select m.user_id, 'lender_room', p.name, pa.phone, r.name, 'lender', 'lender', r.id,
      not public.lender_room_is_open(r) or r.status = 'declined'
    from the_deal
    join public.lender_room r on r.deal_id = the_deal.id
    join public.lender_room_member m on m.room_id = r.id
    left join public.lender_person p on p.user_id = m.user_id
    left join public.accounts pa on pa.primary_owner_user_id = m.user_id and pa.is_personal_account
    union all
    select m.user_id, 'seller_room', m.name, pa.phone, null, 'seller', 'seller', null,
      not public.seller_room_is_open(r)
    from the_deal
    join public.seller_room r on r.deal_id = the_deal.id
    join public.seller_room_member m on m.room_id = r.id
    left join public.accounts pa on pa.primary_owner_user_id = m.user_id and pa.is_personal_account
    union all
    select c.user_id, 'counsel', c.name, c.phone, c.company, c.side::text::public.deal_side, 'attorney', null, null
    from the_deal
    join public.deal_counsel c on c.deal_id = the_deal.id
  ),
  entry as (
    select p.user_id, lower(u.email) as email, coalesce(lower(u.email), p.user_id::text) as person,
      row(p.source, null, p.name, p.phone, p.company, p.side, p.role, p.lender_room_id, p.room_closed,
        exists (
          select 1 from public.deal_main_contact mc
          where mc.deal_id = deal_people.deal_id and mc.side = p.side
            and mc.lender_room_id is not distinct from p.lender_room_id and mc.user_id = p.user_id
        ))::public.deal_person_entry as e
    from pulled p
    join auth.users u on u.id = p.user_id
    union all
    select null, lower(c.email), coalesce(lower(c.email), c.id::text),
      row('contact', c.id, coalesce(c.name, c.email), c.phone, c.company, dc.side, dc.role::text, null, null,
        exists (
          select 1 from public.deal_main_contact mc
          where mc.deal_id = dc.deal_id and mc.side = dc.side and mc.contact_id = c.id
        ))::public.deal_person_entry
    from the_deal
    join public.deal_contact dc on dc.deal_id = the_deal.id
    join public.contact c on c.id = dc.contact_id
  )
  select person.user_id,
    case when not person.is_seller or public.has_deal_permission(deal_people.deal_id, 'deals.manage')
      then person.email end,
    coalesce(a.name::text, person.contact_name), person.entries
  from (
    select (array_agg(entry.user_id) filter (where entry.user_id is not null))[1] as user_id,
      min(entry.email) as email,
      bool_or((entry.e).source = 'seller_room') as is_seller,
      (array_agg((entry.e).name order by (entry.e).contact_id)
        filter (where (entry.e).source = 'contact'))[1] as contact_name,
      array_agg(entry.e order by (entry.e).source, (entry.e).lender_room_id, (entry.e).contact_id) as entries
    from entry
    group by entry.person
  ) person
  left join public.accounts a on a.primary_owner_user_id = person.user_id and a.is_personal_account;
$$;

revoke all on function public.deal_people(uuid) from public, anon;
grant execute on function public.deal_people(uuid) to authenticated, service_role;

-- Every main contact on a deal, one row for each way the starred person stands
-- on their side, for the audience functions below to filter. Who may ask is
-- theirs to check.
create or replace function public.deal_main_contact_cards(deal_id uuid)
  returns table (
    side public.deal_side,
    lender_room_id uuid,
    name text,
    role text,
    company text,
    phone text,
    email text
  )
  language sql stable security definer
  set search_path = '' as $$
  with star as (
    select mc.side, mc.lender_room_id, mc.user_id, mc.contact_id, d.id as deal_id,
      team.id as account_id, team.name::text as team_name
    from public.deal_main_contact mc
    join public.deal d on d.id = mc.deal_id
    join public.accounts team on team.id = d.account_id
    where mc.deal_id = deal_main_contact_cards.deal_id
  ),
  pulled as (
    select s.side, s.lender_room_id, s.user_id, am.account_role::text as role, s.team_name as company, null::text as phone
    from star s
    join public.accounts_memberships am on am.account_id = s.account_id and am.user_id = s.user_id
    where s.side = 'buyer'
    union all
    select s.side, s.lender_room_id, s.user_id, 'attorney', c.company, c.phone
    from star s
    join public.deal_counsel c on c.deal_id = s.deal_id and c.user_id = s.user_id and c.side::text = s.side::text
    union all
    select s.side, s.lender_room_id, s.user_id, 'lender', r.name, null
    from star s
    join public.lender_room r on r.id = s.lender_room_id
    union all
    select s.side, s.lender_room_id, s.user_id, 'seller', null, null
    from star s
    join public.seller_room r on r.deal_id = s.deal_id
    join public.seller_room_member m on m.room_id = r.id and m.user_id = s.user_id
    where s.side = 'seller'
  )
  select p.side, p.lender_room_id, a.name::text, p.role, p.company,
    case when p.role = 'attorney' then p.phone else a.phone end, u.email::text
  from pulled p
  join auth.users u on u.id = p.user_id
  left join public.accounts a on a.primary_owner_user_id = p.user_id and a.is_personal_account
  union all
  select s.side, s.lender_room_id, c.name, dc.role::text, c.company, c.phone, c.email
  from star s
  join public.deal_contact dc on dc.deal_id = s.deal_id and dc.contact_id = s.contact_id
  join public.contact c on c.id = s.contact_id;
$$;

revoke all on function public.deal_main_contact_cards(uuid) from public, anon, authenticated;

-- A lender sees the buyer main contact and their own room's, never another
-- room's or the seller's.
create or replace function public.lender_room_main_contacts(room_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.lender_room r
  cross join public.deal_main_contact_cards(r.deal_id) m
  where r.id = lender_room_main_contacts.room_id
    and public.is_lender_room_member(r.id)
    and (m.side = 'buyer' or m.lender_room_id = r.id)
  order by m.side, m.company, m.name;
$$;

revoke all on function public.lender_room_main_contacts(uuid) from public, anon;
grant execute on function public.lender_room_main_contacts(uuid) to authenticated, service_role;

-- Sellers and seller's counsel see the buyer and seller main contacts, never a
-- lender.
create or replace function public.seller_room_main_contacts(room_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.seller_room r
  cross join public.deal_main_contact_cards(r.deal_id) m
  where r.id = seller_room_main_contacts.room_id
    and public.is_seller_room_member(r.id)
    and m.side <> 'lender'
  order by m.side, m.company, m.name;
$$;

revoke all on function public.seller_room_main_contacts(uuid) from public, anon;
grant execute on function public.seller_room_main_contacts(uuid) to authenticated, service_role;

-- Buyer's counsel sees every side; seller's counsel sees what the seller does.
create or replace function public.counsel_main_contacts(deal_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.deal_main_contact_cards(counsel_main_contacts.deal_id) m
  where public.is_deal_counsel(counsel_main_contacts.deal_id, 'buyer')
    or (m.side <> 'lender' and public.is_deal_counsel(counsel_main_contacts.deal_id, 'seller'))
  order by m.side, m.company, m.name;
$$;

revoke all on function public.counsel_main_contacts(uuid) from public, anon;
grant execute on function public.counsel_main_contacts(uuid) to authenticated, service_role;

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update on public.deal_main_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

-- A star cleared inside another trigger, because its person left, goes with
-- that removal, which a locked team may still make. Direct deletes are refused.
create trigger refuse_delete_when_team_locked
  before delete on public.deal_main_contact
  for each row when (pg_trigger_depth() = 0)
  execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_contact
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_contact_id
  before insert or update on public.deal_contact
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contact_id', 'contact');
