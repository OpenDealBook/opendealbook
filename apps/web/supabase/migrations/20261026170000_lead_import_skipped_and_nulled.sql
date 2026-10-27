alter type public.lead_import_status add value 'skipped';

alter table public.lead_import add column rows_with_nulled_fields int not null default 0;
