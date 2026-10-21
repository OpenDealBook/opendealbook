-- wake_at is when a waiting step wakes; iteration_path is the step's item index
-- in each enclosing loop, outermost first, and empty outside loops.
alter table public.workflow_step_run
  add column wake_at timestamptz,
  add column iteration_path int[] not null default '{}';

drop function if exists public.start_workflow_step_run(uuid, uuid, text, text, jsonb);

-- Starting a step locks its run, so a cancelled run never gets a step back to
-- running, and each start counts one more attempt on the step's single row. A
-- waiting step is returned as it is, so its timer is not restarted.
create or replace function public.start_workflow_step_run(
  p_account_id uuid,
  p_run_id uuid,
  p_node_id text,
  p_idempotency_key text,
  p_iteration_path int[],
  p_input jsonb
) returns table (id uuid, attempt int, status public.workflow_step_status, output jsonb, started_at timestamptz)
  language sql
  set search_path = '' as $$
  with started as (
    insert into public.workflow_step_run as s (account_id, run_id, node_id, idempotency_key, iteration_path, input)
    select p_account_id, p_run_id, p_node_id, p_idempotency_key, p_iteration_path, p_input
    from public.workflow_run r
    where r.id = p_run_id and r.status <> 'cancelled'
    for share of r
    on conflict (idempotency_key) do update
      set attempt = s.attempt + 1, status = 'running', error = null, finished_at = null, input = excluded.input
      where s.status not in ('succeeded', 'cancelled', 'waiting')
    returning s.id, s.attempt, s.status, s.output, s.started_at
  )
  select * from started
  union all
  select s.id, s.attempt, s.status, s.output, s.started_at
  from public.workflow_step_run s
  where s.idempotency_key = p_idempotency_key and not exists (select 1 from started);
$$;

revoke all on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) from public, anon, authenticated;
grant execute on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) to service_role;
