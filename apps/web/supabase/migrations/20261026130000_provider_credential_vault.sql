-- Email lookup (Apify) and letters (Lob) run on each team's own key. The key
-- lives encrypted in Supabase Vault; provider_credential keeps only the vault
-- secret id, which members never see. Settings managers write through
-- save_provider_credential and disconnect_provider_credential, the only way to
-- write the table. Each kind has a fixed provider and address, and a changed
-- address needs a fresh key. Email lookup also names the Apify actor it runs.
-- Registry takes bulk files only, so it has no key.

alter table public.provider_credential alter column api_key_secret_ref drop not null;
alter table public.provider_credential add column api_key_secret_id uuid;
alter table public.provider_credential add column actor_id text
  constraint provider_credential_actor_id check (actor_id ~ '^[A-Za-z0-9_.-]+([/~][A-Za-z0-9_.-]+)?$');

drop policy provider_credential_insert on public.provider_credential;
drop policy provider_credential_update on public.provider_credential;
drop policy provider_credential_delete on public.provider_credential;
drop policy provider_credential_read on public.provider_credential;

create policy provider_credential_read on public.provider_credential
  for select to authenticated
  using (public.has_role_on_account(account_id));

revoke all on public.provider_credential from authenticated;
grant select (
  id, account_id, kind, provider, base_url, actor_id, created_at, updated_at, created_by, updated_by
) on public.provider_credential to authenticated;

create or replace function public.save_provider_credential(
  p_account_id uuid,
  p_kind public.provider_kind,
  p_api_key text default null,
  p_actor_id text default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  existing public.provider_credential;
  secret_id uuid;
  provider text := case p_kind when 'email_lookup' then 'apify' when 'letters' then 'lob' end;
  base_url text := case p_kind
    when 'email_lookup' then 'https://api.apify.com/v2'
    when 'letters' then 'https://api.lob.com/v1'
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

  perform pg_advisory_xact_lock(hashtextextended('provider_credential:' || p_account_id || ':' || p_kind, 0));

  select * into existing from public.provider_credential where account_id = p_account_id and kind = p_kind;
  secret_id := existing.api_key_secret_id;

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

  insert into public.provider_credential (account_id, kind, provider, base_url, api_key_secret_id, actor_id)
  values (
    p_account_id, p_kind, provider, base_url, secret_id,
    case when p_kind = 'email_lookup'
      then coalesce(p_actor_id, existing.actor_id, 'vdrmota/contact-info-scraper')
    end
  )
  on conflict (account_id, kind) do update
    set provider = excluded.provider,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id,
        actor_id = excluded.actor_id;
end;
$$;

revoke all on function public.save_provider_credential(uuid, public.provider_kind, text, text) from public, anon;
grant execute on function public.save_provider_credential(uuid, public.provider_kind, text, text) to authenticated;

create or replace function public.disconnect_provider_credential(p_account_id uuid, p_kind public.provider_kind)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing provider keys needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  delete from public.provider_credential where account_id = p_account_id and kind = p_kind;
end;
$$;

revoke all on function public.disconnect_provider_credential(uuid, public.provider_kind) from public, anon;
grant execute on function public.disconnect_provider_credential(uuid, public.provider_kind) to authenticated;

create or replace function public.provider_key(p_account_id uuid, p_kind public.provider_kind)
  returns table (api_key text, actor_id text)
  language sql stable security definer
  set search_path = '' as $$
  select s.decrypted_secret, c.actor_id
  from public.provider_credential c
  join vault.decrypted_secrets s on s.id = c.api_key_secret_id
  where c.account_id = p_account_id and c.kind = p_kind;
$$;

revoke all on function public.provider_key(uuid, public.provider_kind) from public, anon, authenticated;
grant execute on function public.provider_key(uuid, public.provider_kind) to service_role;

create or replace function tuckin.delete_provider_credential_secret()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from vault.secrets where id = old.api_key_secret_id;
  return null;
end;
$$;

create trigger delete_provider_credential_secret
  after delete on public.provider_credential
  for each row execute function tuckin.delete_provider_credential_secret();
