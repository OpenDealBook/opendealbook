alter table public.document_chunk drop constraint document_chunk_document_id_fkey;

alter table public.embedding_job drop constraint embedding_job_dr_document_id_fkey;

create or replace function public.purge_removed_document_text()
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.document_chunk c
  where not exists (
    select 1 from public.dr_document d
    where d.id = c.document_id and d.removed_at is null
  );

  delete from public.embedding_job j
  where not exists (
    select 1 from public.dr_document d
    where d.id = j.dr_document_id and d.removed_at is null
  );
end;
$$;
