-- A registry entity keeps the other names it is known by, such as the
-- fictitious name a foreign entity uses in New York, so matching can find it
-- under any of them. A newer import that supplies aliases replaces them; later
-- batches of the same import, and files that do not carry aliases, keep them.

alter table public.state_registry_entity add column aliases text[] not null default '{}';

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
    registered_agent, entity_type, principal_address_line1, principal_city, principal_state,
    principal_postal_code, mailing_address_line1, mailing_city, mailing_state,
    mailing_postal_code, aliases, source, fetched_at
  )
  select
    r.state, r.entity_number, r.source_id, r.import_id, r.name, r.status, r.formation_date,
    r.registered_agent, r.entity_type, r.principal_address_line1, r.principal_city, r.principal_state,
    r.principal_postal_code, r.mailing_address_line1, r.mailing_city, r.mailing_state,
    r.mailing_postal_code, coalesce(r.aliases, '{}'), r.source, r.fetched_at
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
    entity_type = case when e.import_id = excluded.import_id or not 'entity_type' = any (p_supplied)
      then coalesce(excluded.entity_type, e.entity_type) else excluded.entity_type end,
    principal_address_line1 = case when e.import_id = excluded.import_id or not 'principal_address_line1' = any (p_supplied)
      then coalesce(excluded.principal_address_line1, e.principal_address_line1) else excluded.principal_address_line1 end,
    principal_city = case when e.import_id = excluded.import_id or not 'principal_city' = any (p_supplied)
      then coalesce(excluded.principal_city, e.principal_city) else excluded.principal_city end,
    principal_state = case when e.import_id = excluded.import_id or not 'principal_state' = any (p_supplied)
      then coalesce(excluded.principal_state, e.principal_state) else excluded.principal_state end,
    principal_postal_code = case when e.import_id = excluded.import_id or not 'principal_postal_code' = any (p_supplied)
      then coalesce(excluded.principal_postal_code, e.principal_postal_code) else excluded.principal_postal_code end,
    mailing_address_line1 = case when e.import_id = excluded.import_id or not 'mailing_address_line1' = any (p_supplied)
      then coalesce(excluded.mailing_address_line1, e.mailing_address_line1) else excluded.mailing_address_line1 end,
    mailing_city = case when e.import_id = excluded.import_id or not 'mailing_city' = any (p_supplied)
      then coalesce(excluded.mailing_city, e.mailing_city) else excluded.mailing_city end,
    mailing_state = case when e.import_id = excluded.import_id or not 'mailing_state' = any (p_supplied)
      then coalesce(excluded.mailing_state, e.mailing_state) else excluded.mailing_state end,
    mailing_postal_code = case when e.import_id = excluded.import_id or not 'mailing_postal_code' = any (p_supplied)
      then coalesce(excluded.mailing_postal_code, e.mailing_postal_code) else excluded.mailing_postal_code end,
    aliases = case when (e.import_id = excluded.import_id or not 'aliases' = any (p_supplied))
        and cardinality(excluded.aliases) = 0
      then e.aliases else excluded.aliases end,
    import_id = excluded.import_id,
    name = excluded.name,
    source = excluded.source,
    fetched_at = greatest(e.fetched_at, excluded.fetched_at)
  returning e.id, e.entity_number;
$$;
