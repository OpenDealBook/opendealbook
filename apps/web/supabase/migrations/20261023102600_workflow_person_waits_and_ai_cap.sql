-- AI calls count against a team's monthly AI cap like paid lookups do, and a
-- person may decide a waiting step while other paths of its run still work.
create or replace function public.ai_cap_reached(p_account_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select count(*) >= coalesce((select ai_monthly_cap from public.outreach_setting where account_id = p_account_id), 0)
  from public.ai_call_log
  where account_id = p_account_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

revoke all on function public.ai_cap_reached(uuid) from public, anon, authenticated;
grant execute on function public.ai_cap_reached(uuid) to service_role;

drop policy workflow_approval_insert on public.workflow_approval;

create policy workflow_approval_insert on public.workflow_approval
  for insert to authenticated
  with check (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    and exists (
      select 1
      from public.workflow_step_run s
      join public.workflow_run r on r.id = s.run_id
      where s.id = step_run_id
        and s.status = 'waiting'
        and r.status in ('running', 'waiting', 'awaiting_approval', 'paused_locked', 'paused_cap')
    )
  );
