alter type public.provider_kind add value if not exists 'courts';

create or replace function public.save_provider_credential(
  p_account_id uuid,
  p_kind public.provider_kind,
  p_api_key text default null,
  p_actor_id text default null,
  p_webhook_secret text default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  existing public.provider_credential;
  secret_id uuid;
  hook_secret_id uuid;
  provider text := case p_kind
    when 'email_lookup' then 'apify'
    when 'letters' then 'lob'
    when 'courts' then 'courtlistener'
  end;
  base_url text := case p_kind
    when 'email_lookup' then 'https://api.apify.com/v2'
    when 'letters' then 'https://api.lob.com/v1'
    when 'courts' then 'https://www.courtlistener.com/api/rest/v4'
  end;
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing provider keys needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  if p_kind = 'registry' then
    raise exception 'registry takes no key' using errcode = 'invalid_parameter_value';
  end if;

  if p_kind <> 'email_lookup' and p_actor_id is not null then
    raise exception 'only email lookup takes an actor' using errcode = 'invalid_parameter_value';
  end if;

  if p_actor_id !~ '^[A-Za-z0-9_.-]+([/~][A-Za-z0-9_.-]+)?$' then
    raise exception 'use an Apify actor id' using errcode = 'invalid_text_representation';
  end if;

  if p_kind <> 'letters' and p_webhook_secret is not null then
    raise exception 'only letters take a webhook secret' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provider_credential:' || p_account_id || ':' || p_kind, 0));

  select * into existing from public.provider_credential where account_id = p_account_id and kind = p_kind;
  secret_id := existing.api_key_secret_id;
  hook_secret_id := existing.webhook_secret_id;

  if p_api_key is null and (
    secret_id is null
    or existing.provider is distinct from provider
    or existing.base_url is distinct from base_url
  ) then
    raise exception 'paste an API key' using errcode = 'check_violation';
  end if;

  if p_api_key is not null and secret_id is not null then
    perform vault.update_secret(secret_id, p_api_key);
  elsif p_api_key is not null then
    secret_id := vault.create_secret(p_api_key);
  end if;

  if p_webhook_secret is not null and hook_secret_id is not null then
    perform vault.update_secret(hook_secret_id, p_webhook_secret);
  elsif p_webhook_secret is not null then
    hook_secret_id := vault.create_secret(p_webhook_secret);
  end if;

  insert into public.provider_credential (account_id, kind, provider, base_url, api_key_secret_id, actor_id, webhook_secret_id)
  values (
    p_account_id, p_kind, provider, base_url, secret_id,
    case when p_kind = 'email_lookup'
      then coalesce(replace(p_actor_id, '~', '/'), existing.actor_id, 'vdrmota/contact-info-scraper')
    end,
    hook_secret_id
  )
  on conflict (account_id, kind) do update
    set provider = excluded.provider,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id,
        actor_id = excluded.actor_id,
        webhook_secret_id = excluded.webhook_secret_id;
end;
$$;
