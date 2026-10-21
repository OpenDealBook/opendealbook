-- A deal manager's call on a verdict that a decision step waits on: the verdict
-- approval and the step's decision land together or not at all.
create or replace function public.decide_firm_verdict(
  p_step_run_id uuid,
  p_verdict_id uuid,
  p_approved boolean,
  p_reason text default null
)
  returns void
  language plpgsql
  set search_path = '' as $$
declare
  verdict_account_id uuid := (select account_id from public.firm_verdict where id = p_verdict_id);
begin
  if p_approved then
    insert into public.firm_verdict_approval (verdict_id, account_id, reason)
    values (p_verdict_id, verdict_account_id, p_reason);
  end if;

  insert into public.workflow_approval (step_run_id, account_id, approved)
  values (p_step_run_id, verdict_account_id, p_approved);
end;
$$;

revoke all on function public.decide_firm_verdict(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.decide_firm_verdict(uuid, uuid, boolean, text) to authenticated;
