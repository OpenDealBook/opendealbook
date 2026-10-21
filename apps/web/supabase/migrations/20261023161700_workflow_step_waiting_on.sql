-- A waiting step records what it waits for, so a step parked under a cap is not
-- mistaken for one waiting on a decision; only an approval step waiting on a
-- decision can be decided; AI calls are reserved against the cap atomically.
alter table public.workflow_step_run
  add column waiting_on text,
  add constraint workflow_step_run_waiting_on_kind check (waiting_on in ('timer', 'decision', 'cap')),
  add constraint workflow_step_run_waiting_on_only_waiting check (waiting_on is null or status = 'waiting');

create or replace function tuckin.cancel_unfinished_steps()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.workflow_step_run
  set status = 'cancelled', finished_at = new.finished_at, waiting_on = null
  where run_id = new.id and status in ('running', 'waiting');
  return null;
end;
$$;

drop function if exists public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb);

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
) returns table (id uuid, attempt int, status public.workflow_step_status, output jsonb, started_at timestamptz, wake_at timestamptz, waiting_on text)
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
    returning s.id, s.attempt, s.status, s.output, s.started_at, s.wake_at, s.waiting_on
  )
  select * from started
  union all
  select s.id, s.attempt, s.status, s.output, s.started_at, s.wake_at, s.waiting_on
  from public.workflow_step_run s
  where s.idempotency_key = p_idempotency_key and not exists (select 1 from started);
$$;

revoke all on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) from public, anon, authenticated;
grant execute on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) to service_role;

drop policy workflow_approval_insert on public.workflow_approval;

create policy workflow_approval_insert on public.workflow_approval
  for insert to authenticated
  with check (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    and exists (
      select 1
      from public.workflow_step_run s
      join public.workflow_run r on r.id = s.run_id
      join public.workflow_version v on v.id = r.version_id
      where s.id = step_run_id
        and s.status = 'waiting'
        and s.waiting_on = 'decision'
        and r.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
        and exists (
          select 1 from jsonb_array_elements(v.graph -> 'nodes') node
          where node ->> 'id' = s.node_id and node ->> 'type' = 'approval'
        )
    )
  );

-- Reserves one AI call against the team's monthly cap: under a per-team lock,
-- it logs the call unless the cap is reached, and returns the log row's id, or
-- null when the team is at its cap. Usage is filled in after the call.
create or replace function public.reserve_ai_call(
  p_account_id uuid,
  p_model text,
  p_endpoint_id uuid,
  p_firm_id uuid,
  p_deal_id uuid
) returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_call_cap:' || p_account_id::text, 0));
  if public.ai_cap_reached(p_account_id) then
    return null;
  end if;
  insert into public.ai_call_log (account_id, model, endpoint_id, firm_id, deal_id)
  values (p_account_id, p_model, p_endpoint_id, p_firm_id, p_deal_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, uuid, uuid, uuid) to service_role;
