-- A bulk file's as-of date is the freshness of every record it wrote.
alter table public.lead_import add column as_of date;

alter table public.state_registry_officer
  add constraint state_registry_officer_entity_name_title_key unique nulls not distinct (entity_id, name, title);
