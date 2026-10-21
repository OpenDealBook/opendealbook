-- llm_endpoint.model names the embedding model; a provider saved from settings
-- names only its chat model, so model stays null until a team sets embeddings.
-- Settings managers can disconnect the provider, which deletes the vault secret
-- with the endpoint. Redaction covers the team's own members as well.

alter table public.llm_endpoint alter column model drop not null;

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
  secret_id uuid;
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing the AI provider needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  secret_id := (select api_key_secret_id from public.llm_endpoint where account_id = p_account_id);

  if p_api_key is not null and secret_id is not null then
    perform vault.update_secret(secret_id, p_api_key);
  elsif p_api_key is not null then
    secret_id := vault.create_secret(p_api_key);
  elsif secret_id is null then
    raise exception 'paste an API key' using errcode = 'check_violation';
  end if;

  insert into public.llm_endpoint (account_id, provider, chat_model, base_url, api_key_secret_id)
  values (p_account_id, p_provider, p_model, p_base_url, secret_id)
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id;
end;
$$;

create or replace function public.disconnect_llm_endpoint(p_account_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing the AI provider needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  delete from vault.secrets
  where id = (select api_key_secret_id from public.llm_endpoint where account_id = p_account_id);

  delete from public.llm_endpoint where account_id = p_account_id;
end;
$$;

revoke all on function public.disconnect_llm_endpoint(uuid) from public, anon;
grant execute on function public.disconnect_llm_endpoint(uuid) to authenticated;

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
