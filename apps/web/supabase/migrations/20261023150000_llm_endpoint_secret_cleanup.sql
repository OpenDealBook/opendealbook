-- An endpoint's vault secret goes with it, whether a settings manager
-- disconnects the provider or the team is deleted.

create or replace function tuckin.delete_llm_endpoint_secret()
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
  for each row execute function tuckin.delete_llm_endpoint_secret();

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
