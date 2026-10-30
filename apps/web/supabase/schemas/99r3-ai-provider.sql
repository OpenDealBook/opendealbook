-- A team brings its own AI provider. The pasted API key lives encrypted in
-- Supabase Vault and llm_endpoint keeps only the vault secret id. Settings
-- managers save or disconnect the endpoint through definer functions, the only
-- way to write it, and never read the key back; only the service role decrypts
-- it for a model call. Changing the provider or base URL needs a new key, and
-- saves for one team are serialized. A provider saved here names its chat model
-- and, when the team gives one, the embedding model in llm_endpoint.model;
-- Anthropic has no embeddings API, so an Anthropic provider takes none.
-- team_people_names lists every person the team knows, so prompts can be
-- redacted before they leave.

-- A custom endpoint must be a public https URL without credentials, query or
-- fragment; literal private addresses and internal hostnames are refused. A local
-- or e2e database that sets odb.allow_private_ai_url = 'on' may save any URL, so
-- a team can point at a stand-in; production never sets it.
create or replace function odb.public_https_base_url(p_url text)
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
  p_api_key text default null,
  p_embedding_model text default null
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

  insert into public.llm_endpoint (account_id, provider, chat_model, model, base_url, api_key_secret_id)
  values (p_account_id, p_provider, p_model, p_embedding_model, base_url, secret_id)
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        model = excluded.model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id;
end;
$$;

revoke all on function public.save_llm_endpoint(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_llm_endpoint(uuid, text, text, text, text, text) to authenticated;

create or replace function public.disconnect_llm_endpoint(p_account_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing the AI provider needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  delete from public.llm_endpoint where account_id = p_account_id;
end;
$$;

revoke all on function public.disconnect_llm_endpoint(uuid) from public, anon;
grant execute on function public.disconnect_llm_endpoint(uuid) to authenticated;

create or replace function public.llm_endpoint_api_key(p_account_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select s.decrypted_secret
  from public.llm_endpoint e
  join vault.decrypted_secrets s on s.id = e.api_key_secret_id
  where e.account_id = p_account_id;
$$;

revoke all on function public.llm_endpoint_api_key(uuid) from public, anon, authenticated;
grant execute on function public.llm_endpoint_api_key(uuid) to service_role;

create or replace function public.team_people_names(p_account_id uuid)
  returns text[]
  language sql stable
  set search_path = '' as $$
  select coalesce(array_agg(distinct name), '{}')
  from (
    select unnest(owner_names) as name from public.firm where account_id = p_account_id
    union all
    select name from public.contact where account_id = p_account_id
    union all
    select name from public.lender_contact where account_id = p_account_id
    union all
    select a.name
    from public.accounts_memberships m
    join public.accounts a on a.primary_owner_user_id = m.user_id and a.is_personal_account
    where m.account_id = p_account_id
  ) people
  where btrim(name) <> '';
$$;

revoke all on function public.team_people_names(uuid) from public, anon, authenticated;
grant execute on function public.team_people_names(uuid) to service_role;

-- An endpoint's vault secret goes with it, on disconnect or team deletion.
create or replace function odb.delete_llm_endpoint_secret()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from vault.secrets where id = old.api_key_secret_id;
  return null;
end;
$$;

create trigger delete_llm_endpoint_secret
  after delete on public.llm_endpoint
  for each row execute function odb.delete_llm_endpoint_secret();
