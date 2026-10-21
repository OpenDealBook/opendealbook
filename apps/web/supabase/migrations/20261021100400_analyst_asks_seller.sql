create or replace function public.seller_room_id_for_work(deal_id uuid)
  returns uuid
  language sql stable security definer
  set search_path = '' as $$
  select r.id from public.seller_room r
  where r.deal_id = seller_room_id_for_work.deal_id
    and public.has_deal_permission(r.deal_id, 'deals.work');
$$;

revoke all on function public.seller_room_id_for_work(uuid) from public, anon;
grant execute on function public.seller_room_id_for_work(uuid) to authenticated, service_role;

drop policy if exists seller_room_member_read on public.seller_room_member;
create policy seller_room_member_read on public.seller_room_member
  for select to authenticated
  using (
    public.can_ask_in_seller_room(room_id)
    or user_id = (select auth.uid())
    or public.is_seller_room_member(room_id)
  );

drop policy if exists seller_room_question_read on public.seller_room_question;
create policy seller_room_question_read on public.seller_room_question
  for select to authenticated
  using (public.can_ask_in_seller_room(room_id) or public.is_seller_room_member(room_id));
