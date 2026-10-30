drop policy contract_pipeline_objects_insert on storage.objects;
drop policy contract_pipeline_objects_update on storage.objects;

create policy contract_pipeline_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('generated', 'contracts')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

create policy contract_pipeline_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('generated', 'contracts')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id in ('generated', 'contracts')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

create policy template_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'templates'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'deals.manage')
  );

create policy template_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'templates'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'deals.manage')
  )
  with check (
    bucket_id = 'templates'
    and public.has_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'deals.manage')
  );
