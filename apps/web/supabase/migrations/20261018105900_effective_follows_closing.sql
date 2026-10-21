-- Lenders, sellers and counsel see the shared milestones' current values,
-- never history or who changed them. An effective date the team never set
-- follows closing, so it stands in as an empty row whenever closing is shared.
create or replace function public.shared_deal_timeline(deal_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date, created_at timestamptz)
  language sql stable
  set search_path = '' as $$
  select m.kind, m.label, m.target_on, m.actual_on, m.created_at
  from public.deal_milestone m
  where m.deal_id = shared_deal_timeline.deal_id
    and m.shared
  union all
  select 'effective', null, null, null, null
  where exists (
      select 1 from public.deal_milestone m
      where m.deal_id = shared_deal_timeline.deal_id and m.kind = 'closing' and m.shared
    )
    and not exists (
      select 1 from public.deal_milestone m
      where m.deal_id = shared_deal_timeline.deal_id and m.kind = 'effective'
    );
$$;

revoke all on function public.shared_deal_timeline(uuid) from public, anon, authenticated;

create or replace function public.lender_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.lender_room r
  cross join public.shared_deal_timeline(r.deal_id) t
  where r.id = lender_room_timeline.room_id
    and public.is_lender_room_member(r.id)
  order by t.kind, t.created_at;
$$;

revoke all on function public.lender_room_timeline(uuid) from public, anon;
grant execute on function public.lender_room_timeline(uuid) to authenticated, service_role;

create or replace function public.seller_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.seller_room r
  cross join public.shared_deal_timeline(r.deal_id) t
  where r.id = seller_room_timeline.room_id
    and public.is_seller_room_member(r.id)
  order by t.kind, t.created_at;
$$;

revoke all on function public.seller_room_timeline(uuid) from public, anon;
grant execute on function public.seller_room_timeline(uuid) to authenticated, service_role;

create or replace function public.counsel_timeline(deal_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.shared_deal_timeline(counsel_timeline.deal_id) t
  where public.is_deal_counsel(counsel_timeline.deal_id, 'buyer')
    or public.is_deal_counsel(counsel_timeline.deal_id, 'seller')
  order by t.kind, t.created_at;
$$;

revoke all on function public.counsel_timeline(uuid) from public, anon;
grant execute on function public.counsel_timeline(uuid) to authenticated, service_role;
