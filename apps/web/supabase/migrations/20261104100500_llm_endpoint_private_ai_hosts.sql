-- The operator may list private hosts in odb.private_ai_hosts, comma separated
-- host or host:port entries matching ODB_PRIVATE_AI_HOSTS on web and workers;
-- a listed host saves over http or https whatever it resolves to.
create or replace function odb.operator_lists_private_ai_host(p_url text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (
    select 1
    from regexp_match(lower(p_url), '^(https?)://(\[[^]/?#@\s]+\]|[^/:?#@\s]+)(?::(\d+))?(?:/[^?#\s]*)?$') as url,
      unnest(string_to_array(current_setting('odb.private_ai_hosts', true), ',')) as entry
    where lower(trim(entry)) in (
      url[2],
      url[2] || ':' || coalesce(url[3], case url[1] when 'https' then '443' else '80' end)
    )
  );
$$;

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
    and not odb.operator_lists_private_ai_host(p_base_url)
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
