-- A deal manager's call on a verdict that a decision step waits on: the verdict
-- approval and the step's decision land together or not at all. Decision steps
-- are decided only here, so it runs as definer and checks the caller itself.
create or replace function public.decide_firm_verdict(
  p_step_run_id uuid,
  p_verdict_id uuid,
  p_approved boolean,
  p_reason text default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  step record;
begin
  select s.account_id, s.status, s.waiting_on, s.node_id, s.output, v.graph
  into step
  from public.workflow_step_run s
  join public.workflow_run r on r.id = s.run_id
  join public.workflow_version v on v.id = r.version_id
  where s.id = p_step_run_id;

  if not found or not public.has_permission(auth.uid(), step.account_id, 'deals.manage') then
    raise exception 'deciding a verdict needs deals.manage' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(step.graph -> 'nodes') node
    where node ->> 'id' = step.node_id and node ->> 'type' = 'decision_model'
  ) then
    raise exception 'that step does not wait on a verdict' using errcode = 'invalid_parameter_value';
  end if;

  if step.output ->> 'verdictId' is distinct from p_verdict_id::text then
    raise exception 'that verdict is not the one this step waits on' using errcode = 'invalid_parameter_value';
  end if;

  if step.status <> 'waiting' or step.waiting_on is distinct from 'decision' then
    raise exception 'that step is not waiting for a decision' using errcode = 'insufficient_privilege';
  end if;

  if p_approved then
    insert into public.firm_verdict_approval (verdict_id, account_id, reason)
    values (p_verdict_id, step.account_id, p_reason);
  end if;

  insert into public.workflow_approval (step_run_id, account_id, approved)
  values (p_step_run_id, step.account_id, p_approved);
end;
$$;

revoke all on function public.decide_firm_verdict(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.decide_firm_verdict(uuid, uuid, boolean, text) to authenticated;
