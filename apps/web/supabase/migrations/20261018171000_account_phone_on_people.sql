alter table public.accounts add column phone_asked_at timestamptz;

alter table public.accounts add constraint accounts_phone_length check (
  length(phone) <= 50
);

grant update (phone_asked_at) on public.accounts to authenticated;

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
    select d.id, d.account_id, a.name::text as team_name, a.is_personal_account, a.primary_owner_user_id
    from public.deal d
    join public.accounts a on a.id = d.account_id
    where d.id = deal_people.deal_id and public.has_role_on_account(d.account_id)
  ),
  team as (
    select am.user_id, the_deal.team_name
    from the_deal
    join public.accounts_memberships am on am.account_id = the_deal.account_id
    union
    select the_deal.primary_owner_user_id, the_deal.team_name
    from the_deal
    where the_deal.is_personal_account
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
      row('contact', c.id, c.name, c.phone, c.company, dc.side, dc.role::text, null, null,
        exists (
          select 1 from public.deal_main_contact mc
          where mc.deal_id = dc.deal_id and mc.side = dc.side and mc.contact_id = c.id
        ))::public.deal_person_entry
    from the_deal
    join public.deal_contact dc on dc.deal_id = the_deal.id
    join public.contact c on c.id = dc.contact_id
  )
  select person.user_id, person.email, coalesce(a.name::text, person.contact_name), person.entries
  from (
    select (array_agg(entry.user_id) filter (where entry.user_id is not null))[1] as user_id,
      min(entry.email) as email,
      (array_agg((entry.e).name order by (entry.e).contact_id)
        filter (where (entry.e).source = 'contact'))[1] as contact_name,
      array_agg(entry.e order by (entry.e).source, (entry.e).lender_room_id, (entry.e).contact_id) as entries
    from entry
    group by entry.person
  ) person
  left join public.accounts a on a.primary_owner_user_id = person.user_id and a.is_personal_account;
$$;

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
