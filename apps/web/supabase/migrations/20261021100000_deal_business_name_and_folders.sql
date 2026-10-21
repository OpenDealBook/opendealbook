alter table public.firm add column name_confirmed boolean not null default true;

drop policy firm_insert on public.firm;

-- Creating a deal names its business, so whoever may create deals may add one.
create policy firm_insert on public.firm
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.create'));

create or replace function public.add_default_deal_folders(p_deal_ids uuid[])
  returns void
  language sql security definer set search_path = '' as $$
  insert into public.dr_folder (account_id, deal_id, name, sort_order)
  select d.account_id, d.id, f.name, f.position - 1
  from public.deal d
  cross join unnest(array['Financials', 'Legal', 'Operations', 'Tax', 'Other']) with ordinality as f(name, position)
  where d.id = any(p_deal_ids);
$$;

revoke all on function public.add_default_deal_folders(uuid[]) from public, anon, authenticated, service_role;

create or replace function public.deal_gets_default_folders()
  returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform public.add_default_deal_folders(array[new.id]);
  return null;
end;
$$;

create trigger deal_default_folders
  after insert on public.deal
  for each row execute function public.deal_gets_default_folders();

-- Brings deals created before these defaults up to them. A deal with no firm
-- is named from its description up to the first colon, semicolon or sentence
-- end, marked unconfirmed, and its deal.created event carries the firm so a
-- replay keeps it. A deal with no folders gets the default folders.
create or replace function public.backfill_deal_defaults()
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_deal record;
  v_firm_id uuid;
begin
  for v_deal in
    select d.id, d.account_id,
      trim(regexp_replace(d.description, '(?:[:;]|[.!?](?=\s|$))[\s\S]*$', '')) as name
    from public.deal d
    where d.firm_id is null
  loop
    continue when coalesce(v_deal.name, '') = '';

    insert into public.firm (account_id, name, status, name_confirmed)
    values (v_deal.account_id, v_deal.name, 'deal_created', false)
    returning id into v_firm_id;

    update public.deal set firm_id = v_firm_id where id = v_deal.id;

    update public.deal_event
    set payload = payload || jsonb_build_object('firm_id', v_firm_id)
    where deal_id = v_deal.id and event_type = 'deal.created';
  end loop;

  perform public.add_default_deal_folders(array(
    select d.id from public.deal d
    where not exists (select 1 from public.dr_folder f where f.deal_id = d.id)
  ));
end;
$$;

revoke all on function public.backfill_deal_defaults() from public, anon, authenticated, service_role;

select public.backfill_deal_defaults();
