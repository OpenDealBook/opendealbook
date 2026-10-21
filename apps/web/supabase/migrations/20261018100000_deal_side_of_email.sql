create or replace function public.deal_side_of_email(deal_id uuid, email text)
  returns setof public.deal_side
  language sql stable security definer
  set search_path = '' as $$
  with person as (
    select u.id from auth.users u where lower(u.email) = lower(deal_side_of_email.email)
  )
  select distinct s.side from (
    select 'buyer'::public.deal_side as side
    from public.deal d
    join public.accounts_memberships m on m.account_id = d.account_id
    where d.id = deal_side_of_email.deal_id and m.user_id in (select id from person)
    union all
    select 'buyer'
    from public.deal d
    join public.accounts a on a.id = d.account_id
    where d.id = deal_side_of_email.deal_id and a.primary_owner_user_id in (select id from person)
    union all
    select 'lender'
    from public.lender_room r
    join public.lender_room_member m on m.room_id = r.id
    where r.deal_id = deal_side_of_email.deal_id
      and (m.user_id in (select id from person) or lower(m.email) = lower(deal_side_of_email.email))
    union all
    select 'seller'
    from public.seller_room r
    join public.seller_room_member m on m.room_id = r.id
    where r.deal_id = deal_side_of_email.deal_id
      and (m.user_id in (select id from person) or lower(m.email) = lower(deal_side_of_email.email))
    union all
    select c.side::text::public.deal_side
    from public.deal_counsel c
    where c.deal_id = deal_side_of_email.deal_id
      and (c.user_id in (select id from person) or lower(c.email) = lower(deal_side_of_email.email))
  ) s;
$$;

revoke all on function public.deal_side_of_email(uuid, text) from public, anon, authenticated;
grant execute on function public.deal_side_of_email(uuid, text) to service_role;
