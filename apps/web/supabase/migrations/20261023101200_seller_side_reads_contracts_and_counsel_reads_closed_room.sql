-- Sellers keep reading their room once it closes or the deal ends, and
-- seller's counsel while the deal is open; writing stops then (see 99w).
-- plpgsql so the body is not checked here: is_deal_counsel loads later, in 99f.
create or replace function public.is_seller_room_member(room_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return exists (
    select 1
    from public.seller_room r
    where r.id = is_seller_room_member.room_id
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

grant execute on function public.is_seller_room_member(uuid) to authenticated, service_role;

-- The deals whose room the caller reads, tested once per statement by the data
-- room read policies: every room they sell in, open or not, and rooms they are
-- seller's counsel on while the deal is open.
-- plpgsql so the body is not checked here: is_deal_counsel loads later, in 99f.
create or replace function public.seller_room_deal_ids()
  returns uuid[]
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return (
    select coalesce(array_agg(distinct r.deal_id), '{}')
    from public.seller_room r
    where r.id in (select m.room_id from public.seller_room_member m where m.user_id = (select auth.uid()))
      or public.is_deal_counsel(r.deal_id, 'seller')
  );
end;
$$;

grant execute on function public.seller_room_deal_ids() to authenticated, service_role;

create or replace function public.reads_contracts_as_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_counsel(reads_contracts_as_seller_side.deal_id, 'seller')
    or reads_contracts_as_seller_side.deal_id = any (public.seller_room_deal_ids());
$$;

drop function public.seller_open_room_deal_ids();

create policy seller_room_comment_read_only on public.seller_room_comment
  as restrictive for insert to authenticated
  with check (
    public.seller_side_read_only_reason((select r.deal_id from public.seller_room r where r.id = room_id)) is null
  );
