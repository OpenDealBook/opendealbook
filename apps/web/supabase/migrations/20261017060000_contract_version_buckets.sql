-- Each contract file records the storage bucket it was written to, and
-- sharing a version again keeps when it was first shared.

alter table public.contract_version
  add column if not exists docx_bucket text check (docx_bucket in ('generated', 'contracts')),
  add column if not exists pdf_bucket text check (pdf_bucket in ('generated', 'contracts'));

-- Generated versions take their .docx from generated_document, in the
-- generated bucket. Uploads and editor saves write the .docx to contracts.
-- generateContract copies the PDF to contracts at <account>/<contract>/v<n>.pdf;
-- any other PDF path came from generated_document.
update public.contract_version
set
  docx_bucket = case
    when docx_path is null then null
    when source = 'generated' then 'generated'
    else 'contracts'
  end,
  pdf_bucket = case
    when pdf_path is null then null
    when pdf_path = account_id || '/' || contract_id || '/v' || version || '.pdf' then 'contracts'
    else 'generated'
  end;

grant insert (docx_bucket, pdf_bucket), update (docx_bucket, pdf_bucket)
  on public.contract_version to authenticated;

create or replace function public.keep_first_shared_at()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if old.shared_at is not null and new.shared_at is not null then
    new.shared_at := old.shared_at;
  end if;
  return new;
end;
$$;

create trigger keep_first_shared_at
  before update of shared_at on public.contract_version
  for each row execute function public.keep_first_shared_at();
