-- Private storage buckets for the LOI/APA contract pipeline: `templates` holds
-- the uploaded template source, `generated` the rendered output, `contracts`
-- the signable and signed contract PDFs. Objects are keyed as <account_id>/...
-- so access is scoped to members of the owning account through the first path
-- segment. Writing a template needs deals.manage on that account. service_role
-- bypasses RLS and is left unrestricted.

insert into storage.buckets (id, name, public, file_size_limit)
values ('templates', 'templates', false, 26214400)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values
  ('generated', 'generated', false),
  ('contracts', 'contracts', false)
on conflict (id) do nothing;

create policy contract_pipeline_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('templates', 'generated', 'contracts')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );

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

create policy contract_pipeline_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('templates', 'generated', 'contracts')
    and public.has_role_on_account(((storage.foldername(name))[1])::uuid)
  );
