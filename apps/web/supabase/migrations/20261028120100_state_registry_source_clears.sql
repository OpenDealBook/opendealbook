-- A newer import of a registry file is the truth for the fields that file
-- carries: what it leaves blank is cleared, while later batches of the same
-- import still only fill in. Each officer remembers the file and import that
-- last listed it, so a newer import of that file removes the officers it no
-- longer lists for an entity without touching another file's officers.
-- Officers loaded before this came from the state's main file, whose dataset
-- key is the state code.

alter table public.state_registry_officer
  add column dataset text,
  add column import_id uuid references public.lead_import (id) on delete set null;

update public.state_registry_officer o
set dataset = e.state
from public.state_registry_entity e
where e.id = o.entity_id;

alter table public.state_registry_officer drop constraint state_registry_officer_entity_name_title_key;
alter table public.state_registry_officer
  add constraint state_registry_officer_entity_dataset_name_title_key
  unique nulls not distinct (entity_id, dataset, name, title);

drop function public.upsert_state_registry_entities(jsonb);

create or replace function public.upsert_state_registry_entities(p_rows jsonb, p_supplied text[])
  returns table (id uuid, entity_number text)
  language sql
  set search_path = '' as $$
  insert into public.state_registry_entity as e (
    state, entity_number, source_id, import_id, name, status, formation_date,
    registered_agent, mailing_address_line1, mailing_city, mailing_state,
    mailing_postal_code, source, fetched_at
  )
  select
    r.state, r.entity_number, r.source_id, r.import_id, r.name, r.status, r.formation_date,
    r.registered_agent, r.mailing_address_line1, r.mailing_city, r.mailing_state,
    r.mailing_postal_code, r.source, r.fetched_at
  from jsonb_populate_recordset(null::public.state_registry_entity, p_rows) r
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

create or replace function public.replace_state_registry_officers(
  p_dataset text,
  p_import_id uuid,
  p_entity_ids uuid[],
  p_officers jsonb
)
  returns void
  language sql
  set search_path = '' as $$
  insert into public.state_registry_officer (entity_id, dataset, import_id, name, title)
  select distinct o.entity_id, p_dataset, p_import_id, o.name, o.title
  from jsonb_to_recordset(p_officers) as o (entity_id uuid, name text, title text)
  on conflict (entity_id, dataset, name, title) do update set import_id = excluded.import_id;

  delete from public.state_registry_officer
  where entity_id = any (p_entity_ids)
    and dataset = p_dataset
    and import_id is distinct from p_import_id;
$$;

revoke all on function public.replace_state_registry_officers(text, uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.replace_state_registry_officers(text, uuid, uuid[], jsonb) to service_role;

drop function public.attach_state_registry_details(text, jsonb);

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

  select count(*)::int
  from jsonb_to_recordset(p_rows) as r (source_id text)
  where not exists (
    select 1 from public.state_registry_entity e
    where e.state = p_state and e.source_id = r.source_id
  );
$$;

revoke all on function public.attach_state_registry_details(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.attach_state_registry_details(text, text, uuid, jsonb) to service_role;
