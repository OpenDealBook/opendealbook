-- Earlier seller questions, read-only in the seller room.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.
create or replace function public.seller_room_legacy_questions(room_id uuid)
  returns table (id uuid, question text, answer text, answered_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.question, q.answer, q.answered_at
  from public.seller_question q
  join public.seller_room r on r.deal_id = q.deal_id
  where r.id = seller_room_legacy_questions.room_id
    and (
      public.is_seller_room_member(r.id)
      or public.can_manage_seller_room(r.id)
    )
  order by q.created_at nulls last;
$$;

revoke all on function public.seller_room_legacy_questions(uuid) from public, anon;
grant execute on function public.seller_room_legacy_questions(uuid) to authenticated, service_role;
