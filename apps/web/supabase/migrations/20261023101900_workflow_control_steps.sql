-- Control steps: a run records why it failed when its graph cannot run, a
-- waiting step keeps its timer across restarts, and loops save items past 500.
alter table public.workflow_run add column error text;

drop function if exists public.start_workflow_step_run(uuid, uuid, text, text, jsonb);

-- Starting a step locks its run, so a cancelled run never gets a step back to
-- running, and each start counts one more attempt on the step's single row. A
-- waiting step is returned as it is, so its timer is not restarted.
create or replace function public.start_workflow_step_run(
  p_account_id uuid,
  p_run_id uuid,
  p_node_id text,
  p_idempotency_key text,
  p_input jsonb
) returns table (id uuid, attempt int, status public.workflow_step_status, output jsonb, started_at timestamptz)
  language sql
  set search_path = '' as $$
  with started as (
    insert into public.workflow_step_run as s (account_id, run_id, node_id, idempotency_key, input)
    select p_account_id, p_run_id, p_node_id, p_idempotency_key, p_input
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

revoke all on function public.start_workflow_step_run(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_workflow_step_run(uuid, uuid, text, text, jsonb) to service_role;

-- Loop items past a run's 500 that wait for the workflow's next run, one row
-- per run that saved them. Taking them deletes the rows, so each saved item is
-- handed out once.
create table if not exists public.workflow_loop_backlog (
  account_id uuid not null,
  workflow_id uuid not null,
  node_id text not null,
  saved_by_run_id uuid not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workflow_id, node_id, saved_by_run_id),
  foreign key (workflow_id, account_id) references public.workflow (id, account_id) on delete cascade,
  foreign key (saved_by_run_id, account_id) references public.workflow_run (id, account_id) on delete cascade
);

alter table public.workflow_loop_backlog enable row level security;

revoke all on public.workflow_loop_backlog from anon, authenticated, service_role;
grant select, insert, update, delete on public.workflow_loop_backlog to service_role;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_loop_backlog
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

-- Settles a running loop step: the saved items come first, then the step's own;
-- the first 500 are its batch and the rest are saved for the next run.
create or replace function public.take_workflow_loop_items(p_step_run_id uuid, p_items jsonb)
  returns jsonb
  language plpgsql
  set search_path = '' as $$
declare
  v_step public.workflow_step_run;
  v_workflow_id uuid;
  v_items jsonb;
  v_output jsonb;
begin
  select * into v_step from public.workflow_step_run where id = p_step_run_id for update;
  if v_step.status = 'succeeded' then
    return v_step.output;
  end if;
  if v_step.status <> 'running' then
    return null;
  end if;

  select workflow_id into v_workflow_id from public.workflow_run where id = v_step.run_id;

  with taken as (
    delete from public.workflow_loop_backlog b
    where b.workflow_id = v_workflow_id and b.node_id = v_step.node_id
    returning b.items, b.created_at
  )
  select coalesce(jsonb_agg(e.item order by t.created_at, e.position), '[]'::jsonb) || p_items
  into v_items
  from taken t
  cross join lateral jsonb_array_elements(t.items) with ordinality as e(item, position);

  if jsonb_array_length(v_items) > 500 then
    insert into public.workflow_loop_backlog (account_id, workflow_id, node_id, saved_by_run_id, items)
    select v_step.account_id, v_workflow_id, v_step.node_id, v_step.run_id,
      jsonb_agg(e.item order by e.position)
    from jsonb_array_elements(v_items) with ordinality as e(item, position)
    where e.position > 500;
  end if;

  v_output := jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(e.item order by e.position), '[]'::jsonb)
      from jsonb_array_elements(v_items) with ordinality as e(item, position)
      where e.position <= 500
    ),
    'processed', least(jsonb_array_length(v_items), 500),
    'total', jsonb_array_length(v_items)
  );

  update public.workflow_step_run
  set status = 'succeeded', output = v_output, finished_at = now()
  where id = p_step_run_id;

  return v_output;
end;
$$;

revoke all on function public.take_workflow_loop_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.take_workflow_loop_items(uuid, jsonb) to service_role;
