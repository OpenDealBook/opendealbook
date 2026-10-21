create or replace function public.reserve_ai_call(
  p_account_id uuid,
  p_model text,
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
  if public.ai_cap_reached(p_account_id) then
    return null;
  end if;
  insert into public.ai_call_log (account_id, model, endpoint_id, firm_id, deal_id)
  values (p_account_id, p_model, p_endpoint_id, p_firm_id, p_deal_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;
