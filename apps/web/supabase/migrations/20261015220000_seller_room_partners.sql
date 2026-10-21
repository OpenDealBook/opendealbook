-- Sellers in one room see each other's names and emails.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

drop policy if exists seller_room_member_read on public.seller_room_member;

create policy seller_room_member_read on public.seller_room_member
  for select to authenticated
  using (
    public.can_manage_seller_room(room_id)
    or user_id = (select auth.uid())
    or public.is_seller_room_member(room_id)
  );
