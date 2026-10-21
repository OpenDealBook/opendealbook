-- A checklist item's linked_document_id is the one link between an item and a
-- document. Documents uploaded into an item before this point get that link as
-- a logged event, newest version first, then the old column on the document
-- goes.

do $$
declare
  v_link record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  for v_link in
    select distinct on (ci.id) d.deal_id, ci.id as item_id, d.id as document_id
    from public.dr_document d
    join public.checklist_item ci on ci.id = d.checklist_item_id and ci.deal_id = d.deal_id
    where ci.linked_document_id is null and d.removed_at is null
    order by ci.id, d.version desc, d.created_at desc
  loop
    perform public.append_deal_event(
      v_link.deal_id, 'checklist_item', v_link.item_id, 'checklist_item.document_linked',
      jsonb_build_object('document_id', v_link.document_id), null, 'service', 'backfill');
  end loop;

  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

create or replace function public.project_dr_document(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'dr_document.added' then
    insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, uploaded_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'folder_id')::uuid,
      ev.payload ->> 'name',
      ev.payload ->> 'storage_path',
      coalesce((ev.payload ->> 'version')::int, 1),
      coalesce(ev.actor_ref, (ev.payload ->> 'uploaded_by')::uuid)
    )
    on conflict (id) do update set
      folder_id = excluded.folder_id,
      name = excluded.name
    where dr_document.deal_id = excluded.deal_id;
  elsif ev.event_type = 'dr_document.moved' then
    update public.dr_document set folder_id = (ev.payload ->> 'folder_id')::uuid
    where id = ev.aggregate_id and deal_id = ev.deal_id;
  elsif ev.event_type = 'dr_document.removed' then
    update public.dr_document set removed_at = ev.created_at
    where id = ev.aggregate_id and deal_id = ev.deal_id;
  else
    raise exception 'unknown dr_document event %', ev.event_type;
  end if;
end;
$$;

drop trigger same_team_checklist_item_id on public.dr_document;

alter table public.dr_document drop column checklist_item_id;
