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
) returns table (id uuid, attempt int, status public.workflow_step_status, output jsonb, started_at timestamptz, wake_at timestamptz)
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
    returning s.id, s.attempt, s.status, s.output, s.started_at, s.wake_at
  )
  select * from started
  union all
  select s.id, s.attempt, s.status, s.output, s.started_at, s.wake_at
  from public.workflow_step_run s
  where s.idempotency_key = p_idempotency_key and not exists (select 1 from started);
$$;

revoke all on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) from public, anon, authenticated;
grant execute on function public.start_workflow_step_run(uuid, uuid, text, text, int[], jsonb) to service_role;

-- Settles a running loop step. A root loop first claims the saved work its
-- version's runs left, oldest first; then every claimed unit and the loop's own
-- items get what is left of the run's 500, in that order. What does not fit is
-- saved again by this run. The output says what was carried over, what resumes,
-- and how many items were saved.
create or replace function public.grant_workflow_loop_items(
  p_step_run_id uuid,
  p_root_node_id text,
  p_items jsonb,
  p_context jsonb
) returns jsonb
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_step public.workflow_step_run;
  v_run public.workflow_run;
  v_unit public.workflow_loop_saved_work;
  v_left int;
  v_total int := 0;
  v_saved int := 0;
  v_count int;
  v_granted jsonb;
  v_own jsonb := '[]'::jsonb;
  v_carried jsonb := '[]'::jsonb;
  v_resumes jsonb := '[]'::jsonb;
  v_output jsonb;
begin
  select * into v_step from public.workflow_step_run where id = p_step_run_id for update;
  if v_step.status = 'succeeded' then
    return v_step.output;
  end if;
  if v_step.status <> 'running' then
    return null;
  end if;
  select * into v_run from public.workflow_run where id = v_step.run_id for update;
  v_left := 500 - v_run.loop_items_processed;

  if p_root_node_id = v_step.node_id then
    for v_unit in
      select w.* from public.workflow_loop_saved_work w
      join public.workflow_run saver on saver.id = w.saved_by_run_id
      where w.workflow_id = v_run.workflow_id
        and w.root_node_id = p_root_node_id
        and w.claimed_by_run_id is null
        and saver.version_id = v_run.version_id
      order by w.created_at
      for update of w
    loop
      update public.workflow_loop_saved_work set claimed_by_run_id = v_run.id where id = v_unit.id;
      v_count := jsonb_array_length(v_unit.items);
      v_total := v_total + v_count;
      v_granted := tuckin.jsonb_array_slice(v_unit.items, 0, v_left);
      v_left := v_left - jsonb_array_length(v_granted);
      if jsonb_array_length(v_granted) < v_count then
        v_saved := v_saved + v_count - jsonb_array_length(v_granted);
        insert into public.workflow_loop_saved_work
          (account_id, workflow_id, root_node_id, node_id, items, context, saved_by_run_id)
        values (v_run.account_id, v_run.workflow_id, p_root_node_id, v_unit.node_id,
          tuckin.jsonb_array_slice(v_unit.items, jsonb_array_length(v_granted), v_count),
          v_unit.context, v_run.id);
      end if;
      if jsonb_array_length(v_granted) > 0 then
        if v_unit.node_id = v_step.node_id then
          v_own := v_own || v_granted;
          v_carried := v_carried || jsonb_build_array(jsonb_build_object(
            'items', v_granted, 'context', v_unit.context));
        else
          v_resumes := v_resumes || jsonb_build_array(jsonb_build_object(
            'nodeId', v_unit.node_id, 'items', v_granted, 'context', v_unit.context,
            'complete', jsonb_array_length(v_granted) = v_count));
        end if;
      end if;
    end loop;
  end if;

  v_count := jsonb_array_length(p_items);
  v_total := v_total + v_count;
  v_granted := tuckin.jsonb_array_slice(p_items, 0, v_left);
  v_left := v_left - jsonb_array_length(v_granted);
  v_own := v_own || v_granted;
  if jsonb_array_length(v_granted) < v_count then
    v_saved := v_saved + v_count - jsonb_array_length(v_granted);
    insert into public.workflow_loop_saved_work
      (account_id, workflow_id, root_node_id, node_id, items, context, saved_by_run_id)
    values (v_run.account_id, v_run.workflow_id, p_root_node_id, v_step.node_id,
      tuckin.jsonb_array_slice(p_items, jsonb_array_length(v_granted), v_count),
      p_context, v_run.id);
  end if;

  update public.workflow_run
  set loop_items_processed = 500 - v_left, loop_items_total = loop_items_total + v_total
  where id = v_run.id;

  v_output := jsonb_build_object(
    'items', v_own,
    'processed', jsonb_array_length(v_own),
    'total', v_total,
    'saved', v_saved,
    'carried', v_carried,
    'resumes', v_resumes,
    'released', '[]'::jsonb
  );
  update public.workflow_step_run
  set status = 'succeeded', output = v_output, finished_at = now()
  where id = p_step_run_id;

  return v_output;
end;
$$;

revoke all on function public.grant_workflow_loop_items(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.grant_workflow_loop_items(uuid, text, jsonb, jsonb) to service_role;

-- A newly published version starts with no saved loop work.
create or replace function tuckin.drop_saved_loop_work()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.workflow_loop_saved_work
  where workflow_id = new.workflow_id and claimed_by_run_id is null;
  return null;
end;
$$;

create trigger drop_saved_loop_work_on_publish
  after insert on public.workflow_version
  for each row when (new.published_at is not null)
  execute function tuckin.drop_saved_loop_work();

create trigger drop_saved_loop_work_on_publish_update
  after update of published_at on public.workflow_version
  for each row when (old.published_at is null and new.published_at is not null)
  execute function tuckin.drop_saved_loop_work();

-- Step input, output and logs are kept 90 days; run summaries are kept. Saved
-- loop work is dropped once claimed, or after 90 days.
create or replace function public.prune_workflow_step_data()
  returns void
  language sql security definer
  set search_path = '' as $$
  update public.workflow_step_run
  set input = null, output = null
  where finished_at < now() - interval '90 days'
    and (input is not null or output is not null);

  delete from public.workflow_step_log
  where created_at < now() - interval '90 days';

  delete from public.workflow_loop_saved_work
  where claimed_by_run_id is not null or created_at < now() - interval '90 days';
$$;

revoke all on function public.prune_workflow_step_data() from public, anon, authenticated;
grant execute on function public.prune_workflow_step_data() to service_role;
