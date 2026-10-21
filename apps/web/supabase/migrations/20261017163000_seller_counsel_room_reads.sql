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
        or r.deal_id in (
          select c.deal_id from public.deal_counsel c
          where c.user_id = (select auth.uid()) and c.side = 'seller'
            and public.is_deal_counsel(c.deal_id, 'seller')
        )
      )
  );
end;
$$;

create or replace function public.seller_can_read_folder(folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.dr_folder f
    join public.seller_room r on r.deal_id = f.deal_id
    where f.id = seller_can_read_folder.folder_id
      and public.is_seller_room_member(r.id)
      and public.seller_room_shows_folder_unchecked(r.id, f.id)
  );
$$;

drop policy seller_room_read on public.seller_room;

create policy seller_room_read on public.seller_room
  for select to authenticated
  using (
    public.can_manage_seller_room(id)
    or exists (
      select 1 from public.seller_room_member m
      where m.room_id = seller_room.id and m.user_id = (select auth.uid())
    )
    or public.is_seller_room_member(id)
  );
