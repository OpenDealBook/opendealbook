revoke all on function public.seller_room_is_open(public.seller_room) from public, anon, authenticated;
grant execute on function public.seller_room_is_open(public.seller_room) to service_role;

create or replace function public.seller_open_room_deal_ids()
  returns uuid[]
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return (
    select coalesce(array_agg(distinct r.deal_id), '{}')
    from public.seller_room r
    where public.seller_room_is_open(r)
      and (
        r.id in (select m.room_id from public.seller_room_member m where m.user_id = (select auth.uid()))
        or public.is_deal_counsel(r.deal_id, 'seller')
      )
  );
end;
$$;
