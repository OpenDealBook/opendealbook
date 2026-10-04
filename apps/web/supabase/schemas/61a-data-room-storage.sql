-- Private storage bucket backing the data-room browse/upload UI. Objects are
-- keyed as `deal/<dealId>/<uuid>-<name>` (see packages/data-room/src/storage.ts),
-- so the second path segment is the deal id and access is deal-scoped through
-- has_deal_permission, matching the dr_document and upload_batch tables. The
-- data-room feature gates on 'deals.manage'. service_role bypasses RLS and is
-- left unrestricted.
--
-- This file is numbered to sort (and therefore compile) after 24-deal-access.sql,
-- which defines has_deal_permission; the storage policies below depend on it.

insert into storage.buckets (id, name, public)
values ('data-room', 'data-room', false)
on conflict (id) do nothing;

create policy data_room_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy data_room_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy data_room_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  )
  with check (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy data_room_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'data-room'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );
