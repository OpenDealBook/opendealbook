drop policy document_chunk_read on public.document_chunk;

create policy document_chunk_read on public.document_chunk
  for select to authenticated
  using (exists (select 1 from public.dr_document d where d.id = document_id));

create or replace function public.purge_removed_document_text()
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.document_chunk c
  using public.dr_document d
  where d.id = c.document_id and d.removed_at is not null;

  delete from public.embedding_job j
  using public.dr_document d
  where d.id = j.dr_document_id and d.removed_at is not null;
end;
$$;

revoke all on function public.purge_removed_document_text() from public, anon, authenticated;
grant execute on function public.purge_removed_document_text() to service_role;
