-- Private storage buckets for three features.
--
-- `meeting-recordings` backs the post-meeting upload (recording + transcript).
-- Objects are keyed as `deal/<dealId>/<uuid>-<name>`, so the second path
-- segment is the deal id and access is deal-scoped through has_deal_permission,
-- matching the data-room bucket in 61a.
--
-- `vendor-imports` holds the raw comp vendor export files. These are proprietary
-- to the tenant that licensed them, so objects are keyed under the account
-- prefix `<accountId>/...` and access is account-path-scoped, matching the
-- contract pipeline buckets in 101.
--
-- `buyer-profile` holds buyer-profile photos, also keyed `<accountId>/...` and
-- account-path-scoped.
--
-- service_role bypasses RLS and is left unrestricted.
--
-- This file is numbered to sort (and therefore compile) after 24-deal-access.sql,
-- which defines has_deal_permission; the meeting-recordings policies depend on it.

insert into storage.buckets (id, name, public)
values
  ('meeting-recordings', 'meeting-recordings', false),
  ('vendor-imports', 'vendor-imports', false),
  ('buyer-profile', 'buyer-profile', false)
on conflict (id) do nothing;

create policy meeting_recordings_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy meeting_recordings_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meeting-recordings'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy meeting_recordings_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  )
  with check (
    bucket_id = 'meeting-recordings'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy meeting_recordings_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meeting-recordings'
    and public.has_deal_permission(((storage.foldername(name))[2])::uuid, 'deals.manage')
  );

create policy account_scoped_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('vendor-imports', 'buyer-profile')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

create policy account_scoped_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('vendor-imports', 'buyer-profile')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

create policy account_scoped_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('vendor-imports', 'buyer-profile')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id in ('vendor-imports', 'buyer-profile')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

create policy account_scoped_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('vendor-imports', 'buyer-profile')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );
