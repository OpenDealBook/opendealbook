-- Reserves an AI call's estimated credits against the team's monthly cap:
-- under a per-team lock, it logs the call holding the estimate unless that
-- would pass the cap, and returns the log row's id, or null when it would. A
-- call costing no credits (a model with no known price) is always logged.
create or replace function public.reserve_ai_call(
  p_account_id uuid,
  p_model text,
  p_credits numeric,
  p_endpoint_id uuid default null,
  p_firm_id uuid default null,
  p_deal_id uuid default null
) returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_call_cap:' || p_account_id::text, 0));
  if p_credits > 0
     and public.ai_credits_used_this_month(p_account_id) + p_credits
     > coalesce((select ai_monthly_credit_cap from public.outreach_setting where account_id = p_account_id), 0) then
    return null;
  end if;
  insert into public.ai_call_log (account_id, model, credits, endpoint_id, firm_id, deal_id)
  values (p_account_id, p_model, p_credits, p_endpoint_id, p_firm_id, p_deal_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;
