-- Reserves an AI call's estimated credits against the team's monthly cap:
-- under a per-team lock, it logs the call holding the estimate unless that
-- would pass the cap, and returns the log row's id, or null when it would. A
-- call costing no credits (a model with no known price) is always logged. A
-- hold left unsettled for over an hour belongs to a crashed worker, so it is
-- released first and stops counting.
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
  update public.ai_call_log
  set credits = 0, settled_at = now()
  where account_id = p_account_id
    and settled_at is null
    and created_at < now() - interval '1 hour';
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

-- An A1 cell or range, in either case and with or without $ anchors, as a box
-- of column and row numbers, so overlapping ranges are boxes that share a point.
create or replace function public.a1_box(cell_range text)
  returns box
  language sql immutable
  set search_path = '' as $$
  select box(
    point(public.a1_column_number(m[1]), m[2]::int),
    point(public.a1_column_number(coalesce(m[3], m[1])), coalesce(m[4], m[2])::int))
  from regexp_match(upper(replace(cell_range, '$', '')), '^([A-Z]+)([0-9]+)(?::([A-Z]+)([0-9]+))?$') m;
$$;

revoke all on function odb.operator_lists_private_ai_host(text) from public, anon, authenticated, service_role;
