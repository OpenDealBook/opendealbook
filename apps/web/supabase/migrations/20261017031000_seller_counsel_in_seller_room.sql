create or replace function public.is_seller_room_member(room_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return exists (
    select 1
    from public.seller_room r
    where r.id = is_seller_room_member.room_id
      and public.seller_room_is_open(r)
      and (
        exists (
          select 1 from public.seller_room_member m
          where m.room_id = r.id and m.user_id = (select auth.uid())
        )
        or public.is_deal_counsel(r.deal_id, 'seller')
      )
  );
end;
$$;

create or replace function public.my_seller_rooms()
  returns table (
    id uuid,
    deal_id uuid,
    deal_description text,
    team_name text,
    team_picture_url text,
    is_open boolean
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select r.id, r.deal_id, d.description, a.name::text, a.picture_url::text, public.seller_room_is_open(r)
  from public.seller_room r
  join public.deal d on d.id = r.deal_id
  join public.accounts a on a.id = r.account_id
  where exists (
      select 1 from public.seller_room_member m
      where m.room_id = r.id and m.user_id = (select auth.uid())
    )
    or public.is_deal_counsel(r.deal_id, 'seller')
  order by a.name, d.description;
end;
$$;
