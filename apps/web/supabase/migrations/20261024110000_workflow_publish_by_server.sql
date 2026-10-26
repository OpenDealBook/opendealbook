-- A draft is saved through one upsert on the single-draft key, so saves that
-- race converge on one draft. It runs as the caller, under their grants and RLS.
create or replace function public.save_workflow_draft(
  p_workflow_id uuid,
  p_schema_version int,
  p_graph jsonb,
  p_layout jsonb
) returns timestamptz
  language sql
  set search_path = '' as $$
  insert into public.workflow_version as v (account_id, workflow_id, schema_version, graph, layout)
  select w.account_id, w.id, p_schema_version, p_graph, p_layout
  from public.workflow w
  where w.id = p_workflow_id
  on conflict (workflow_id) where published_at is null
  do update set schema_version = excluded.schema_version, graph = excluded.graph, layout = excluded.layout
  returning v.saved_at;
$$;

revoke all on function public.save_workflow_draft(uuid, int, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow_draft(uuid, int, jsonb, jsonb) to authenticated, service_role;

-- Publishing validates the graph first, so only the server publishes.
revoke update (published_at, published_by) on public.workflow_version from authenticated;
