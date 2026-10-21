-- Its files never reach a buyer-side read: not the deal history the team
-- reads, and not the stored objects, previews included. The seller side open
-- them only through signed links the server makes.
create or replace function public.seller_counsel_documents()
  returns table (id uuid, storage_path text)
  language sql stable security definer
  set search_path = '' as $$
  select d.id, d.storage_path
  from public.dr_document d
  where d.folder_id = any (public.seller_counsel_folder_ids());
$$;

revoke all on function public.seller_counsel_documents() from public, anon;
grant execute on function public.seller_counsel_documents() to authenticated, service_role;

create policy deal_event_seller_counsel_kept on public.deal_event
  as restrictive for select to authenticated
  using (
    aggregate_type <> 'dr_document'
    or aggregate_id <> all ((select coalesce(array_agg(s.id), '{}') from public.seller_counsel_documents() s)::uuid[])
  );

create policy deal_event_snapshot_seller_counsel_kept on public.deal_event_snapshot
  as restrictive for select to authenticated
  using (
    aggregate_type <> 'dr_document'
    or aggregate_id <> all ((select coalesce(array_agg(s.id), '{}') from public.seller_counsel_documents() s)::uuid[])
  );

create policy data_room_objects_seller_counsel_kept on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'data-room'
    or regexp_replace(name, '\.preview\.[a-z]+$', '')
      <> all ((select coalesce(array_agg(s.storage_path), '{}') from public.seller_counsel_documents() s)::text[])
  );
