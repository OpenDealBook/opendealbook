-- llm_endpoint is written only through save_llm_endpoint and
-- disconnect_llm_endpoint, and members never see the vault secret id, so no
-- team can borrow or delete another team's key. Changing the provider or base
-- URL needs a new key. OpenAI and Anthropic use their own addresses; a custom
-- endpoint must be a public https URL without credentials, query or fragment.
-- Saves for one team are serialized so concurrent first saves make one secret.

drop policy llm_endpoint_insert on public.llm_endpoint;
drop policy llm_endpoint_update on public.llm_endpoint;
drop policy llm_endpoint_delete on public.llm_endpoint;

revoke all on public.llm_endpoint from authenticated;
grant select (
  id, account_id, provider, model, chat_model, base_url, api_key_secret_ref,
  created_at, updated_at, created_by, updated_by
) on public.llm_endpoint to authenticated;

create or replace function tuckin.public_https_base_url(p_url text)
  returns boolean
  language plpgsql immutable
  set search_path = '' as $$
declare
  host text := lower(substring(p_url from '^https://([^/?#@\s]+)(?:/[^?#\s]*)?$'));
  address inet;
begin
  if host is null then
    return false;
  end if;

  host := case
    when host like '[%' then substring(host from '^\[([^\]]+)\]')
    else regexp_replace(host, ':\d+$', '')
  end;

  begin
    address := host::inet;
  exception when others then
    address := null;
  end;

  if address is not null then
    return not exists (
      select 1
      from unnest(array[
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
        '172.16.0.0/12', '192.168.0.0/16', '::/128', '::1/128', 'fc00::/7', 'fe80::/10',
        '::ffff:0:0/96'
      ]::inet[]) as blocked
      where address <<= blocked
    );
  end if;

  return host like '%.%'
    and host <> 'localhost'
    and host !~ '\.(localhost|local|internal)\.?$';
end;
$$;

create or replace function public.save_llm_endpoint(
  p_account_id uuid,
  p_provider text,
  p_model text,
  p_base_url text,
  p_api_key text default null
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

  if p_provider = 'openai_compatible' and not coalesce(tuckin.public_https_base_url(p_base_url), false) then
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

  insert into public.llm_endpoint (account_id, provider, chat_model, base_url, api_key_secret_id)
  values (p_account_id, p_provider, p_model, base_url, secret_id)
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id;
end;
$$;
