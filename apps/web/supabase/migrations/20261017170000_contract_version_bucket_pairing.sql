-- A contract file and its bucket are recorded together.

alter table public.contract_version
  add constraint contract_version_check check ((docx_path is null) = (docx_bucket is null)),
  add constraint contract_version_check1 check ((pdf_path is null) = (pdf_bucket is null));
