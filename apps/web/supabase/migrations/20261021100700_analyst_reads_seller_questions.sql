drop policy if exists seller_room_question_route_read on public.seller_room_question_route;
create policy seller_room_question_route_read on public.seller_room_question_route
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_route.question_id
        and public.can_ask_in_seller_room(q.room_id)
    )
  );

create or replace function public.can_route_lender_ask_to_seller(question_id uuid, lender_ask_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.seller_room_question q
    join public.seller_room r on r.id = q.room_id
    join public.lender_ask a on a.id = can_route_lender_ask_to_seller.lender_ask_id
    join public.lender_room lr on lr.id = a.room_id and lr.deal_id = r.deal_id
    where q.id = can_route_lender_ask_to_seller.question_id
      and public.can_ask_in_seller_room(q.room_id)
  );
$$;

revoke all on function public.can_route_lender_ask_to_seller(uuid, uuid) from public, anon;
grant execute on function public.can_route_lender_ask_to_seller(uuid, uuid) to authenticated, service_role;

drop policy if exists seller_room_question_route_insert on public.seller_room_question_route;
create policy seller_room_question_route_insert on public.seller_room_question_route
  for insert to authenticated
  with check (public.can_route_lender_ask_to_seller(question_id, lender_ask_id));

drop policy if exists seller_room_question_message_read on public.seller_room_question_message;
create policy seller_room_question_message_read on public.seller_room_question_message
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_message.question_id
        and (public.can_ask_in_seller_room(q.room_id) or public.is_seller_room_member(q.room_id))
    )
  );

drop policy if exists seller_room_question_file_read on public.seller_room_question_file;
create policy seller_room_question_file_read on public.seller_room_question_file
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_file.question_id
        and (public.can_ask_in_seller_room(q.room_id) or public.is_seller_room_member(q.room_id))
    )
  );
