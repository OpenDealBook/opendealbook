-- The room's "Documents from <team>" listing.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.
-- team.
create or replace function public.seller_room_documents(room_id uuid)
  returns table (
    share_id uuid,
    template_name text,
    firm_name text,
    sent_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select s.id, t.name, f.name::text, s.sent_at
  from public.document_share s
  join public.generated_document g on g.id = s.generated_document_id
  left join public.document_template t on t.id = g.template_id
  join public.deal d on d.id = g.deal_id
  left join public.firm f on f.id = d.firm_id
  where s.room_id = seller_room_documents.room_id
    and (
      public.is_seller_room_member(seller_room_documents.room_id)
      or public.can_manage_seller_room(seller_room_documents.room_id)
    )
  order by s.sent_at desc nulls last;
$$;

revoke all on function public.seller_room_documents(uuid) from public, anon;
grant execute on function public.seller_room_documents(uuid) to authenticated, service_role;
