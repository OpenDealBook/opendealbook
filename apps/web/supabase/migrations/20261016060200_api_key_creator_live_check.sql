-- Compiled from supabase/schemas/28-api-key.sql.

create or replace function public.verify_api_key(prefix text, raw text)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  matched_account uuid;
begin
  update public.api_key
    set last_used_at = now()
    where key_prefix = verify_api_key.prefix
      and key_hash = extensions.digest(verify_api_key.raw, 'sha256')
      and revoked_at is null
      and public.has_permission(created_by, account_id, 'api_keys.manage')
    returning account_id into matched_account;
  return matched_account;
end;
$$;
