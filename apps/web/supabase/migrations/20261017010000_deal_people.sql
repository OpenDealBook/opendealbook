set check_function_bodies = off;

-- Everyone on a deal, for the team. Worked out on every read from where each
-- person lives, so someone removed from a room or as counsel is gone. A
-- hand-added contact whose email matches an invited or room person is that
-- person, and only the invited or room row shows.
create or replace function public.deal_people(deal_id uuid)
  returns table (
    source text,
    user_id uuid,
    contact_id uuid,
    name text,
    email text,
    phone text,
    company text,
    side public.deal_side,
    role public.deal_person_role,
    is_main boolean,
    lender_room_id uuid
  )
  language sql stable security definer
  set search_path = '' as $$
  with the_deal as (
    select d.id, d.account_id
    from public.deal d
    where d.id = deal_people.deal_id and public.has_role_on_account(d.account_id)
  ),
  pulled as (
    select 'team' as source, am.user_id, a.name::text as name, u.email::text as email,
      null::text as phone, null::text as company,
      'buyer'::public.deal_side as side, 'principal'::public.deal_person_role as role,
      null::uuid as lender_room_id
    from the_deal
    join public.accounts_memberships am on am.account_id = the_deal.account_id
    join auth.users u on u.id = am.user_id
    join public.accounts a on a.primary_owner_user_id = am.user_id and a.is_personal_account
    union all
    select 'lender_room', m.user_id, p.name, m.email, null, null, 'lender', 'principal', r.id
    from the_deal
    join public.lender_room r on r.deal_id = the_deal.id
    join public.lender_room_member m on m.room_id = r.id
    left join public.lender_person p on p.user_id = m.user_id
    union all
    select 'seller_room', m.user_id, m.name, m.email, null, null, 'seller', 'principal', null
    from the_deal
    join public.seller_room r on r.deal_id = the_deal.id
    join public.seller_room_member m on m.room_id = r.id
    union all
    select 'counsel', c.user_id, c.name, c.email, c.phone, c.company,
      c.side::text::public.deal_side, 'attorney', null
    from the_deal
    join public.deal_counsel c on c.deal_id = the_deal.id
  )
  select p.source, p.user_id, null, p.name, p.email, p.phone, p.company, p.side, p.role,
    exists (
      select 1 from public.deal_main_contact mc
      where mc.deal_id = deal_people.deal_id and mc.side = p.side
        and mc.lender_room_id is not distinct from p.lender_room_id and mc.user_id = p.user_id
    ),
    p.lender_room_id
  from pulled p
  union all
  select 'contact', null, c.id, c.name, c.email, c.phone, c.company, dc.side, dc.role,
    exists (
      select 1 from public.deal_main_contact mc
      where mc.deal_id = dc.deal_id and mc.side = dc.side and mc.contact_id = c.id
    ),
    null
  from the_deal
  join public.deal_contact dc on dc.deal_id = the_deal.id
  join public.contact c on c.id = dc.contact_id
  where not exists (select 1 from pulled p where p.email = c.email);
$$;

revoke all on function public.deal_people(uuid) from public, anon;
grant execute on function public.deal_people(uuid) to authenticated, service_role;

