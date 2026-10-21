-- Lenders, sellers and counsel see the shared milestones' current values,
-- never history or who changed them.
create or replace function public.lender_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select m.kind, m.label, m.target_on, m.actual_on
  from public.lender_room r
  join public.deal_milestone m on m.deal_id = r.deal_id
  where r.id = lender_room_timeline.room_id
    and public.is_lender_room_member(r.id)
    and m.shared
  order by m.kind, m.created_at;
$$;

revoke all on function public.lender_room_timeline(uuid) from public, anon;
grant execute on function public.lender_room_timeline(uuid) to authenticated, service_role;

create or replace function public.seller_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select m.kind, m.label, m.target_on, m.actual_on
  from public.seller_room r
  join public.deal_milestone m on m.deal_id = r.deal_id
  where r.id = seller_room_timeline.room_id
    and public.is_seller_room_member(r.id)
    and m.shared
  order by m.kind, m.created_at;
$$;

revoke all on function public.seller_room_timeline(uuid) from public, anon;
grant execute on function public.seller_room_timeline(uuid) to authenticated, service_role;

create or replace function public.counsel_timeline(deal_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select m.kind, m.label, m.target_on, m.actual_on
  from public.deal_milestone m
  where m.deal_id = counsel_timeline.deal_id
    and (public.is_deal_counsel(counsel_timeline.deal_id, 'buyer')
      or public.is_deal_counsel(counsel_timeline.deal_id, 'seller'))
    and m.shared
  order by m.kind, m.created_at;
$$;

revoke all on function public.counsel_timeline(uuid) from public, anon;
grant execute on function public.counsel_timeline(uuid) to authenticated, service_role;
