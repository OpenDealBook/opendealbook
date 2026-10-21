-- A verification finding names every checklist item that links its document,
-- without a foreign key, so replaying a deal's checklist keeps the names.

alter table public.verification_finding
  add column checklist_item_ids uuid[] not null default '{}';

update public.verification_finding
set checklist_item_ids = array[checklist_item_id]
where checklist_item_id is not null;

drop trigger same_team_checklist_item_id on public.verification_finding;

alter table public.verification_finding drop column checklist_item_id;
