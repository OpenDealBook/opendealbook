alter table public.middesk_business alter column business_id drop not null;
alter table public.middesk_business add column claimed_at timestamptz not null default now();

create or replace function public.save_provider_credential(
  p_account_id uuid,
  p_kind public.provider_kind,
  p_api_key text default null,
  p_actor_id text default null,
  p_webhook_secret text default null,
  p_provider text default null
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
    when 'court_records' then p_provider
  end;
  base_url text := case coalesce(p_provider, p_kind::text)
    when 'email_lookup' then 'https://api.apify.com/v2'
    when 'letters' then 'https://api.lob.com/v1'
    when 'courts' then 'https://www.courtlistener.com/api/rest/v4'
    when 'baselayer' then 'https://api.baselayer.com'
    when 'middesk' then 'https://api.middesk.com/v1'
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

  if p_kind = 'court_records' and p_provider is distinct from 'baselayer' and p_provider is distinct from 'middesk' then
    raise exception 'pick Baselayer or Middesk' using errcode = 'invalid_parameter_value';
  end if;

  if p_kind <> 'court_records' and p_provider is not null then
    raise exception 'only court records pick a broker' using errcode = 'invalid_parameter_value';
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

  if p_kind = 'court_records' and p_api_key is not null then
    delete from public.middesk_business where account_id = p_account_id;
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

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('middesk_business', 'service-role only bookkeeping for court records searches')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.middesk_business
  for each row execute function odb.refuse_team_move();

create or replace function public.claim_middesk_business(p_account_id uuid, p_firm_id uuid)
  returns table (business_id text, claimed boolean)
  language plpgsql
  set search_path = '' as $$
declare
  claimed_business text;
begin
  insert into public.middesk_business as m (account_id, firm_id, claimed_at)
  values (p_account_id, p_firm_id, clock_timestamp())
  on conflict (account_id, firm_id) do update
    set claimed_at = excluded.claimed_at
    where m.business_id is null and m.claimed_at < clock_timestamp() - interval '2 minutes'
  returning m.business_id into claimed_business;
  if found then
    return query select claimed_business, true;
  else
    return query
      select m.business_id, false from public.middesk_business m
      where m.account_id = p_account_id and m.firm_id = p_firm_id;
  end if;
end;
$$;

revoke all on function public.claim_middesk_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_middesk_business(uuid, uuid) to service_role;

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('courtlistener_pace', 'service-role only bookkeeping for CourtListener pacing')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.courtlistener_pace
  for each row execute function odb.refuse_team_move();

insert into odb.personal_account_tables (table_name, reason) values
  ('middesk_business', 'service-role only bookkeeping, keyed by a team firm'),
  ('courtlistener_pace', 'service-role only bookkeeping, one pacing row per account')
on conflict (table_name) do update set reason = excluded.reason;
