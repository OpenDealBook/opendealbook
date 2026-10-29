-- A registry entity keeps the id its state's other files use to refer to it, so
-- principals and agents published separately can attach to it. Loading a file
-- never blanks what an earlier file or row filled in, and a state that
-- publishes only active businesses marks the bulk-file entities it stopped
-- listing, unless the file shrank below 80% of the last good one.

alter table public.state_registry_entity add column source_id text;

alter table public.lead_import add column rows_unmatched int not null default 0;

create unique index ux_state_registry_entity_source_id
  on public.state_registry_entity (state, source_id);

create or replace function public.upsert_state_registry_entities(p_rows jsonb)
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
    source_id = coalesce(excluded.source_id, e.source_id),
    import_id = excluded.import_id,
    name = excluded.name,
    status = coalesce(excluded.status, e.status),
    formation_date = coalesce(excluded.formation_date, e.formation_date),
    registered_agent = coalesce(excluded.registered_agent, e.registered_agent),
    mailing_address_line1 = coalesce(excluded.mailing_address_line1, e.mailing_address_line1),
    mailing_city = coalesce(excluded.mailing_city, e.mailing_city),
    mailing_state = coalesce(excluded.mailing_state, e.mailing_state),
    mailing_postal_code = coalesce(excluded.mailing_postal_code, e.mailing_postal_code),
    source = excluded.source,
    fetched_at = greatest(e.fetched_at, excluded.fetched_at)
  returning e.id, e.entity_number;
$$;

revoke all on function public.upsert_state_registry_entities(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_state_registry_entities(jsonb) to service_role;

create or replace function public.attach_state_registry_details(p_state text, p_rows jsonb)
  returns int
  language sql
  set search_path = '' as $$
  update public.state_registry_entity e
  set registered_agent = r.registered_agent
  from jsonb_to_recordset(p_rows) as r (source_id text, registered_agent text)
  where e.state = p_state
    and e.source_id = r.source_id
    and r.registered_agent is not null;

  insert into public.state_registry_officer (entity_id, name, title)
  select e.id, o.name, o.title
  from jsonb_to_recordset(p_rows) as r (source_id text, officers jsonb)
  join public.state_registry_entity e on e.state = p_state and e.source_id = r.source_id
  cross join jsonb_to_recordset(r.officers) as o (name text, title text)
  on conflict do nothing;

  select count(*)::int
  from jsonb_to_recordset(p_rows) as r (source_id text)
  where not exists (
    select 1 from public.state_registry_entity e
    where e.state = p_state and e.source_id = r.source_id
  );
$$;

revoke all on function public.attach_state_registry_details(text, jsonb) from public, anon, authenticated;
grant execute on function public.attach_state_registry_details(text, jsonb) to service_role;

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
    and status is distinct from 'inactive (no longer listed)';
  return true;
end;
$$;

revoke all on function public.mark_unlisted_state_registry_entities(text, uuid, int) from public, anon, authenticated;
grant execute on function public.mark_unlisted_state_registry_entities(text, uuid, int) to service_role;
