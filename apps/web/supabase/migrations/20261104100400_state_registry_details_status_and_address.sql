-- Detail files also carry an entity's status and principal address, as New
-- York publishes them in files apart from its filings. A row without them
-- keeps what the entity has, and a principal address replaces the whole earlier
-- one. A row can say the agent is vacant, as when New York records a revoked
-- or resigned agent, which clears the agent the entity had. New York officers
-- now come from its address file, so the CEOs the retired active-corporations
-- file listed are removed.

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
  set registered_agent = case when r.registered_agent_vacant then null else coalesce(r.registered_agent, e.registered_agent) end,
    status = coalesce(r.status, e.status),
    principal_address_line1 = case when r.has_principal then r.principal_address_line1 else e.principal_address_line1 end,
    principal_city = case when r.has_principal then r.principal_city else e.principal_city end,
    principal_state = case when r.has_principal then r.principal_state else e.principal_state end,
    principal_postal_code = case when r.has_principal then r.principal_postal_code else e.principal_postal_code end
  from (
    select d.*, num_nonnulls(d.principal_address_line1, d.principal_city, d.principal_state, d.principal_postal_code) > 0 as has_principal
    from jsonb_to_recordset(p_rows) as d (
      source_id text, registered_agent text, registered_agent_vacant boolean, status text, principal_address_line1 text,
      principal_city text, principal_state text, principal_postal_code text
    )
  ) r
  where e.state = p_state
    and e.source_id = r.source_id
    and (r.registered_agent is not null or r.registered_agent_vacant or r.status is not null or r.has_principal);

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

delete from public.state_registry_officer where dataset = 'NY';
