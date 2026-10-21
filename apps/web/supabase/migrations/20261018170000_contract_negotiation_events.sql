-- Counsel and the team are emailed when a contract version is added, when a
-- version is first shown to the seller side, and when a comment is posted.
-- The three events change no projected row.

create or replace function public.project_contract(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'contract.created' then
    insert into public.contract (id, deal_id, account_id, type, status, current_version, source_offer_version_id, created_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      ev.payload ->> 'type',
      ev.payload ->> 'status',
      (ev.payload ->> 'current_version')::int,
      (ev.payload ->> 'source_offer_version_id')::uuid,
      ev.actor_ref
    )
    on conflict (id) do update set
      status = excluded.status,
      current_version = excluded.current_version;
  elsif ev.event_type = 'contract.version_set' then
    update public.contract set
      current_version = (ev.payload ->> 'current_version')::int,
      status = coalesce(ev.payload ->> 'status', status)
    where id = ev.aggregate_id;
  -- Logged so counsel and the team can be told; the rows they name are
  -- written by the upload, the share and the comment themselves.
  elsif ev.event_type in ('contract.version_added', 'contract.version_shown_to_seller_side', 'contract.comment_posted') then
  elsif ev.event_type = 'contract.signature_requested' then
    update public.contract_version cv set
      signing_document_id = ev.payload ->> 'signing_document_id',
      signing_status = 'draft'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  elsif ev.event_type = 'contract.signature_status_changed' then
    update public.contract_version cv set signing_status = ev.payload ->> 'status'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  else
    raise exception 'unknown contract event %', ev.event_type;
  end if;
end;
$$;
