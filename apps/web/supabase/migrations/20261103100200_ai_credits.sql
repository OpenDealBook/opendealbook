alter table public.outreach_setting drop constraint outreach_setting_ai_monthly_cap_range;
alter table public.outreach_setting rename column ai_monthly_cap to ai_monthly_credit_cap;
-- Each AI call becomes 2 credits. A type rewrite converts every team without
-- firing the row triggers that stamp updated_at and updated_by.
alter table public.outreach_setting
  alter column ai_monthly_credit_cap type int using ai_monthly_credit_cap * 2;
alter table public.outreach_setting
  add constraint outreach_setting_ai_monthly_credit_cap_range check (ai_monthly_credit_cap between 0 and 10000000);

drop function public.reserve_ai_call(uuid, text, uuid, uuid, uuid);
drop function public.ai_cap_reached(uuid);

alter table public.ai_call_log
  add column credits numeric(12,4) not null default 0,
  add column settled_at timestamptz;

create or replace function public.ai_credits_used_this_month(p_account_id uuid)
  returns numeric
  language sql stable
  set search_path = '' as $$
  select coalesce(sum(credits), 0)
  from public.ai_call_log
  where account_id = p_account_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

revoke all on function public.ai_credits_used_this_month(uuid) from public, anon;
grant execute on function public.ai_credits_used_this_month(uuid) to authenticated, service_role;

-- Reserves an AI call's estimated credits against the team's monthly cap:
-- under a per-team lock, it logs the call holding the estimate unless that
-- would pass the cap, and returns the log row's id, or null when it would.
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
  if public.ai_credits_used_this_month(p_account_id) + p_credits
     > coalesce((select ai_monthly_credit_cap from public.outreach_setting where account_id = p_account_id), 0) then
    return null;
  end if;
  insert into public.ai_call_log (account_id, model, credits, endpoint_id, firm_id, deal_id)
  values (p_account_id, p_model, p_credits, p_endpoint_id, p_firm_id, p_deal_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid) to service_role;

drop function public.save_llm_endpoint(uuid, text, text, text, text, text);

alter table public.llm_endpoint
  add column input_price_per_mtok numeric,
  add column cached_input_price_per_mtok numeric,
  add column output_price_per_mtok numeric,
  add constraint llm_endpoint_prices check (
    num_nulls(input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok) = 3
    or (provider = 'openai_compatible'
      and num_nulls(input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok) = 0
      and least(input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok) >= 0)
  );

grant select (input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok)
  on public.llm_endpoint to authenticated;

create or replace function public.save_llm_endpoint(
  p_account_id uuid,
  p_provider text,
  p_model text,
  p_base_url text,
  p_api_key text default null,
  p_embedding_model text default null,
  p_input_price_per_mtok numeric default null,
  p_cached_input_price_per_mtok numeric default null,
  p_output_price_per_mtok numeric default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  existing public.llm_endpoint;
  secret_id uuid;
  base_url text := case p_provider
    when 'openai' then 'https://api.openai.com/v1'
    when 'anthropic' then 'https://api.anthropic.com/v1'
    else p_base_url
  end;
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing the AI provider needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  if p_provider = 'anthropic' and p_embedding_model is not null then
    raise exception 'Anthropic has no embeddings API; leave Embedding model empty' using errcode = 'data_exception';
  end if;

  if p_provider = 'openai_compatible'
    and coalesce(current_setting('odb.allow_private_ai_url', true), '') <> 'on'
    and not coalesce(odb.public_https_base_url(p_base_url), false) then
    raise exception 'use a public https base URL' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('llm_endpoint:' || p_account_id, 0));

  select * into existing from public.llm_endpoint where account_id = p_account_id;
  secret_id := existing.api_key_secret_id;

  if p_api_key is null and (
    secret_id is null
    or existing.provider is distinct from p_provider
    or existing.base_url is distinct from base_url
  ) then
    raise exception 'paste an API key' using errcode = 'check_violation';
  end if;

  if p_api_key is not null and secret_id is not null then
    perform vault.update_secret(secret_id, p_api_key);
  elsif p_api_key is not null then
    secret_id := vault.create_secret(p_api_key);
  end if;

  insert into public.llm_endpoint (
    account_id, provider, chat_model, model, base_url, api_key_secret_id,
    input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok
  )
  values (
    p_account_id, p_provider, p_model, p_embedding_model, base_url, secret_id,
    p_input_price_per_mtok, p_cached_input_price_per_mtok, p_output_price_per_mtok
  )
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        model = excluded.model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id,
        input_price_per_mtok = excluded.input_price_per_mtok,
        cached_input_price_per_mtok = excluded.cached_input_price_per_mtok,
        output_price_per_mtok = excluded.output_price_per_mtok;
end;
$$;

revoke all on function public.save_llm_endpoint(uuid, text, text, text, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.save_llm_endpoint(uuid, text, text, text, text, text, numeric, numeric, numeric) to authenticated;
