drop function if exists public.take_workflow_loop_items(uuid, jsonb);
drop table if exists public.workflow_loop_backlog;

-- A run processes at most 500 loop items, counted across every loop level.
-- Items a loop could not get are saved with the context they need to resume,
-- under the outermost loop around them; that loop's next run claims them first.
alter table public.workflow_run
  add column loop_items_processed int not null default 0 check (loop_items_processed between 0 and 500),
  add column loop_items_total int not null default 0 check (loop_items_total >= 0);

create table if not exists public.workflow_loop_saved_work (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  workflow_id uuid not null,
  root_node_id text not null,
  node_id text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  context jsonb not null,
  saved_by_run_id uuid not null,
  claimed_by_run_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workflow_id, account_id) references public.workflow (id, account_id) on delete cascade,
  foreign key (saved_by_run_id, account_id) references public.workflow_run (id, account_id) on delete cascade,
  foreign key (claimed_by_run_id, account_id) references public.workflow_run (id, account_id) on delete cascade
);

alter table public.workflow_loop_saved_work enable row level security;

create index ix_workflow_loop_saved_work_unclaimed
  on public.workflow_loop_saved_work (workflow_id, root_node_id, created_at)
  where claimed_by_run_id is null;

revoke all on public.workflow_loop_saved_work from anon, authenticated, service_role;
grant select, insert, update, delete on public.workflow_loop_saved_work to service_role;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_loop_saved_work
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create or replace function tuckin.jsonb_array_slice(items jsonb, skip int, take int)
  returns jsonb
  language sql immutable
  set search_path = '' as $$
  select coalesce(jsonb_agg(e.item order by e.position), '[]'::jsonb)
  from jsonb_array_elements(items) with ordinality as e(item, position)
  where e.position > skip and e.position <= skip + take;
$$;

-- Settles a running loop step. A root loop first claims its saved work, oldest
-- first; then every claimed unit and the loop's own items get what is left of
-- the run's 500, in that order. What does not fit is saved again by this run.
create or replace function public.grant_workflow_loop_items(
  p_step_run_id uuid,
  p_root_node_id text,
  p_items jsonb,
  p_context jsonb
) returns jsonb
  language plpgsql
  set search_path = '' as $$
declare
  v_step public.workflow_step_run;
  v_run public.workflow_run;
  v_unit public.workflow_loop_saved_work;
  v_left int;
  v_total int := 0;
  v_count int;
  v_granted jsonb;
  v_own jsonb := '[]'::jsonb;
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
      select * from public.workflow_loop_saved_work w
      where w.workflow_id = v_run.workflow_id
        and w.root_node_id = p_root_node_id
        and w.claimed_by_run_id is null
      order by w.created_at
      for update
    loop
      update public.workflow_loop_saved_work set claimed_by_run_id = v_run.id where id = v_unit.id;
      v_count := jsonb_array_length(v_unit.items);
      v_total := v_total + v_count;
      v_granted := tuckin.jsonb_array_slice(v_unit.items, 0, v_left);
      v_left := v_left - jsonb_array_length(v_granted);
      if jsonb_array_length(v_granted) < v_count then
        insert into public.workflow_loop_saved_work
          (account_id, workflow_id, root_node_id, node_id, items, context, saved_by_run_id)
        values (v_run.account_id, v_run.workflow_id, p_root_node_id, v_unit.node_id,
          tuckin.jsonb_array_slice(v_unit.items, jsonb_array_length(v_granted), v_count),
          v_unit.context, v_run.id);
      end if;
      if v_unit.node_id = v_step.node_id then
        v_own := v_own || v_granted;
      elsif jsonb_array_length(v_granted) > 0 then
        v_resumes := v_resumes || jsonb_build_array(jsonb_build_object(
          'nodeId', v_unit.node_id, 'items', v_granted, 'context', v_unit.context));
      end if;
    end loop;
  end if;

  v_count := jsonb_array_length(p_items);
  v_total := v_total + v_count;
  v_granted := tuckin.jsonb_array_slice(p_items, 0, v_left);
  v_left := v_left - jsonb_array_length(v_granted);
  v_own := v_own || v_granted;
  if jsonb_array_length(v_granted) < v_count then
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
    'resumes', v_resumes
  );
  update public.workflow_step_run
  set status = 'succeeded', output = v_output, finished_at = now()
  where id = p_step_run_id;

  return v_output;
end;
$$;

revoke all on function public.grant_workflow_loop_items(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.grant_workflow_loop_items(uuid, text, jsonb, jsonb) to service_role;
