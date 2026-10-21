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
    select s.side, s.lender_room_id, s.user_id, 'principal' as role, s.team_name as company, null::text as phone
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
  select p.side, p.lender_room_id, a.name::text, p.role, p.company, p.phone, u.email::text
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

-- Sellers and seller's counsel never see a lender.
create or replace function public.seller_room_main_contacts(room_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.seller_room r
  cross join public.deal_main_contact_cards(r.deal_id) m
  where r.id = seller_room_main_contacts.room_id
    and public.is_seller_room_member(r.id)
    and m.side = 'buyer'
  order by m.company, m.name;
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
    or (m.side = 'buyer' and public.is_deal_counsel(counsel_main_contacts.deal_id, 'seller'))
  order by m.side, m.company, m.name;
$$;

revoke all on function public.counsel_main_contacts(uuid) from public, anon;
grant execute on function public.counsel_main_contacts(uuid) to authenticated, service_role;
