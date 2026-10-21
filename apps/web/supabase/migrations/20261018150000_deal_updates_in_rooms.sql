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
