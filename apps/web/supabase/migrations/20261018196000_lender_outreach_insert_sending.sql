drop policy lender_room_outreach_insert on public.lender_room_outreach;

create policy lender_room_outreach_insert on public.lender_room_outreach
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id) and sent_by = (select auth.uid()) and status = 'sending');
