-- A team brings its own AI provider. The pasted API key lives encrypted in
-- Supabase Vault; llm_endpoint keeps only the vault secret id. Settings managers
-- save the endpoint through save_llm_endpoint and never read the key back; only
-- the service role can decrypt it for a model call.

alter table public.llm_endpoint add column api_key_secret_id uuid;

alter table public.llm_endpoint add constraint llm_endpoint_one_per_team unique (account_id);

alter table public.llm_endpoint add constraint llm_endpoint_provider
  check (provider in ('openai', 'anthropic', 'openai_compatible'));

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

  insert into public.llm_endpoint (account_id, provider, model, chat_model, base_url, api_key_secret_id)
  values (p_account_id, p_provider, p_model, p_model, p_base_url, secret_id)
  on conflict (account_id) do update
    set provider = excluded.provider,
        chat_model = excluded.chat_model,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id;
end;
$$;

revoke all on function public.save_llm_endpoint(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_llm_endpoint(uuid, text, text, text, text) to authenticated;

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
  ) people
  where btrim(name) <> '';
$$;

revoke all on function public.team_people_names(uuid) from public, anon, authenticated;
grant execute on function public.team_people_names(uuid) to service_role;
