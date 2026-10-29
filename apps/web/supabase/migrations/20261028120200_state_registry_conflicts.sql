-- A row whose source id another row of the batch or another entity already
-- holds is refused, and the caller counts it as rejected, instead of failing
-- the import. Detail files count every raw row that matched no entity. A
-- drop-out only replaces the status 'active', so a specific inactive reason
-- the file gave earlier is kept.

create or replace function public.upsert_state_registry_entities(p_rows jsonb, p_supplied text[])
  returns table (id uuid, entity_number text)
  language sql
  set search_path = '' as $$
  with incoming as (
    select * from jsonb_populate_recordset(null::public.state_registry_entity, p_rows) with ordinality
  ),
  claimable as (
    select i.* from incoming i
    where i.source_id is null
      or not exists (
        select 1 from public.state_registry_entity held
        where held.state = i.state
          and held.source_id = i.source_id
          and held.entity_number <> i.entity_number
      )
  ),
  accepted as (
    select c.* from claimable c
    where c.source_id is null
      or not exists (
        select 1 from claimable earlier
        where earlier.state = c.state
          and earlier.source_id = c.source_id
          and earlier.ordinality < c.ordinality
      )
  )
  insert into public.state_registry_entity as e (
    state, entity_number, source_id, import_id, name, status, formation_date,
    registered_agent, mailing_address_line1, mailing_city, mailing_state,
    mailing_postal_code, source, fetched_at
  )
  select
    r.state, r.entity_number, r.source_id, r.import_id, r.name, r.status, r.formation_date,
    r.registered_agent, r.mailing_address_line1, r.mailing_city, r.mailing_state,
    r.mailing_postal_code, r.source, r.fetched_at
  from accepted r
  on conflict (state, entity_number) do update set
    source_id = case when e.import_id = excluded.import_id or not 'source_id' = any (p_supplied)
      then coalesce(excluded.source_id, e.source_id) else excluded.source_id end,
    status = case when e.import_id = excluded.import_id or not 'status' = any (p_supplied)
      then coalesce(excluded.status, e.status) else excluded.status end,
    formation_date = case when e.import_id = excluded.import_id or not 'formation_date' = any (p_supplied)
      then coalesce(excluded.formation_date, e.formation_date) else excluded.formation_date end,
    registered_agent = case when e.import_id = excluded.import_id or not 'registered_agent' = any (p_supplied)
      then coalesce(excluded.registered_agent, e.registered_agent) else excluded.registered_agent end,
    mailing_address_line1 = case when e.import_id = excluded.import_id or not 'mailing_address_line1' = any (p_supplied)
      then coalesce(excluded.mailing_address_line1, e.mailing_address_line1) else excluded.mailing_address_line1 end,
    mailing_city = case when e.import_id = excluded.import_id or not 'mailing_city' = any (p_supplied)
      then coalesce(excluded.mailing_city, e.mailing_city) else excluded.mailing_city end,
    mailing_state = case when e.import_id = excluded.import_id or not 'mailing_state' = any (p_supplied)
      then coalesce(excluded.mailing_state, e.mailing_state) else excluded.mailing_state end,
    mailing_postal_code = case when e.import_id = excluded.import_id or not 'mailing_postal_code' = any (p_supplied)
      then coalesce(excluded.mailing_postal_code, e.mailing_postal_code) else excluded.mailing_postal_code end,
    import_id = excluded.import_id,
    name = excluded.name,
    source = excluded.source,
    fetched_at = greatest(e.fetched_at, excluded.fetched_at)
  returning e.id, e.entity_number;
$$;

revoke all on function public.upsert_state_registry_entities(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.upsert_state_registry_entities(jsonb, text[]) to service_role;

create or replace function public.attach_state_registry_details(
  p_state text,
  p_dataset text,
  p_import_id uuid,
  p_rows jsonb
)
  returns int
  language sql
  set search_path = '' as $$
  update public.state_registry_entity e
  set registered_agent = r.registered_agent
  from jsonb_to_recordset(p_rows) as r (source_id text, registered_agent text)
  where e.state = p_state
    and e.source_id = r.source_id
    and r.registered_agent is not null;

  select public.replace_state_registry_officers(
    p_dataset,
    p_import_id,
    array(
      select e.id
      from jsonb_to_recordset(p_rows) as r (source_id text)
      join public.state_registry_entity e on e.state = p_state and e.source_id = r.source_id
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('entity_id', e.id, 'name', o.name, 'title', o.title)), '[]'::jsonb)
      from jsonb_to_recordset(p_rows) as r (source_id text, officers jsonb)
      join public.state_registry_entity e on e.state = p_state and e.source_id = r.source_id
      cross join jsonb_to_recordset(r.officers) as o (name text, title text)
    )
  );

  select coalesce(sum(r.rows), 0)::int
  from jsonb_to_recordset(p_rows) as r (source_id text, rows int)
  where not exists (
    select 1 from public.state_registry_entity e
    where e.state = p_state and e.source_id = r.source_id
  );
$$;

revoke all on function public.attach_state_registry_details(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.attach_state_registry_details(text, text, uuid, jsonb) to service_role;

create or replace function public.mark_unlisted_state_registry_entities(
  p_state text,
  p_import_id uuid,
  p_rows_read int
)
  returns boolean
  language plpgsql
  set search_path = '' as $$
declare
  v_baseline int;
begin
  select l.rows_read into v_baseline
  from public.lead_import l
  where l.filename = (select c.filename from public.lead_import c where c.id = p_import_id)
    and l.status = 'succeeded'
    and l.id <> p_import_id
  order by l.created_at desc
  limit 1;

  if v_baseline is null or p_rows_read < 0.8 * v_baseline then
    return false;
  end if;

  update public.state_registry_entity
  set status = 'inactive (no longer listed)'
  where state = p_state
    and source = 'bulk_file'
    and import_id <> p_import_id
    and status = 'active';
  return true;
end;
$$;

revoke all on function public.mark_unlisted_state_registry_entities(text, uuid, int) from public, anon, authenticated;
grant execute on function public.mark_unlisted_state_registry_entities(text, uuid, int) to service_role;
