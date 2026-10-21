drop function public.deal_people(uuid);

set check_function_bodies = off;

-- Everyone on a deal, for the team, one row per person. Worked out on every
-- read from where each person lives, so someone removed from a room or as
-- counsel is gone. Entries with the same email, ignoring case, are one person;
-- a pulled person's email is their sign-in email. A person is named by their
-- own profile, else as counsel, else as a room member, else as a contact.
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
    select t.user_id, 'team' as source, a.name::text as name, null::text as phone, t.team_name as company,
      'buyer'::public.deal_side as side, 'principal' as role, null::uuid as lender_room_id,
      null::boolean as room_closed
    from team t
    join public.accounts a on a.primary_owner_user_id = t.user_id and a.is_personal_account
    union all
    select m.user_id, 'lender_room', p.name, null, r.name, 'lender', 'lender', r.id,
      not public.lender_room_is_open(r) or r.status = 'declined'
    from the_deal
    join public.lender_room r on r.deal_id = the_deal.id
    join public.lender_room_member m on m.room_id = r.id
    left join public.lender_person p on p.user_id = m.user_id
    union all
    select m.user_id, 'seller_room', m.name, null, null, 'seller', 'seller', null,
      not public.seller_room_is_open(r)
    from the_deal
    join public.seller_room r on r.deal_id = the_deal.id
    join public.seller_room_member m on m.room_id = r.id
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
  select person.user_id, person.email, coalesce(a.name::text, person.entry_name), person.entries
  from (
    select (array_agg(entry.user_id) filter (where entry.user_id is not null))[1] as user_id,
      min(entry.email) as email,
      (array_agg((entry.e).name order by
          case (entry.e).source when 'counsel' then 1 when 'contact' then 3 else 2 end, (entry.e).contact_id)
        filter (where (entry.e).name is not null))[1] as entry_name,
      array_agg(entry.e order by (entry.e).source, (entry.e).lender_room_id, (entry.e).contact_id) as entries
    from entry
    group by entry.person
  ) person
  left join public.accounts a on a.primary_owner_user_id = person.user_id and a.is_personal_account;
$$;

revoke all on function public.deal_people(uuid) from public, anon;
grant execute on function public.deal_people(uuid) to authenticated, service_role;
