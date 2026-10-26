-- Every draft write goes through save_workflow_draft, which checks the caller,
-- refuses archived workflows and bounds the draft. create_workflow makes a
-- workflow and its first draft together.
create or replace function tuckin.current_workflow_schema_version()
  returns int
  language sql immutable
  set search_path = '' as $$
  select 2;
$$;

revoke update (graph, layout) on public.workflow_version from authenticated;

drop policy workflow_version_update on public.workflow_version;

create or replace function public.save_workflow_draft(
  p_workflow_id uuid,
  p_graph jsonb,
  p_layout jsonb
) returns timestamptz
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_workflow record;
  v_saved_at timestamptz;
begin
  select account_id, archived_at into v_workflow from public.workflow where id = p_workflow_id;

  if v_workflow.account_id is null or not public.has_permission(auth.uid(), v_workflow.account_id, 'workflows.manage') then
    raise exception 'saving a workflow draft needs workflows.manage' using errcode = 'insufficient_privilege';
  end if;
  if v_workflow.archived_at is not null then
    raise exception 'Unarchive this workflow first' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if jsonb_typeof(p_graph -> 'nodes') is distinct from 'array' or jsonb_typeof(p_graph -> 'edges') is distinct from 'array' then
    raise exception 'A workflow needs nodes and edges lists' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_layout) is distinct from 'object' then
    raise exception 'A workflow layout must be an object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_graph -> 'nodes') > 200 then
    raise exception 'A workflow can have at most 200 steps' using errcode = 'invalid_parameter_value';
  end if;
  if octet_length(p_graph::text) + octet_length(p_layout::text) > 1048576 then
    raise exception 'A workflow is too large to save' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.workflow_version as v (account_id, workflow_id, schema_version, graph, layout)
  values (v_workflow.account_id, p_workflow_id, tuckin.current_workflow_schema_version(), p_graph, p_layout)
  on conflict (workflow_id) where published_at is null
  do update set schema_version = excluded.schema_version, graph = excluded.graph, layout = excluded.layout
  returning v.saved_at into v_saved_at;

  return v_saved_at;
end;
$$;

create or replace function public.create_workflow(
  p_account_id uuid,
  p_name text,
  p_graph jsonb
) returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_workflow_id uuid;
begin
  if not public.has_permission(auth.uid(), p_account_id, 'workflows.manage') then
    raise exception 'creating a workflow needs workflows.manage' using errcode = 'insufficient_privilege';
  end if;

  insert into public.workflow (account_id, name)
  values (p_account_id, p_name)
  returning id into v_workflow_id;

  perform public.save_workflow_draft(v_workflow_id, p_graph, '{}');

  return v_workflow_id;
end;
$$;

revoke all on function public.create_workflow(uuid, text, jsonb) from public, anon;
grant execute on function public.create_workflow(uuid, text, jsonb) to authenticated, service_role;
