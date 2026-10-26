-- The server owns the graph schema version: saving a draft stamps the current
-- one, and nobody sets it directly.
revoke insert (schema_version), update (schema_version) on public.workflow_version from authenticated;

drop function public.save_workflow_draft(uuid, int, jsonb, jsonb);

create or replace function public.save_workflow_draft(
  p_workflow_id uuid,
  p_graph jsonb,
  p_layout jsonb
) returns timestamptz
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_account_id uuid;
  v_saved_at timestamptz;
begin
  select account_id into v_account_id from public.workflow where id = p_workflow_id;

  if v_account_id is null or not public.has_permission(auth.uid(), v_account_id, 'workflows.manage') then
    raise exception 'saving a workflow draft needs workflows.manage' using errcode = 'insufficient_privilege';
  end if;

  insert into public.workflow_version as v (account_id, workflow_id, schema_version, graph, layout)
  values (v_account_id, p_workflow_id, 2, p_graph, p_layout)
  on conflict (workflow_id) where published_at is null
  do update set schema_version = excluded.schema_version, graph = excluded.graph, layout = excluded.layout
  returning v.saved_at into v_saved_at;

  return v_saved_at;
end;
$$;

revoke all on function public.save_workflow_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow_draft(uuid, jsonb, jsonb) to authenticated, service_role;

alter policy workflow_version_update on public.workflow_version
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));
