-- Compiled from supabase/schemas/28-api-key.sql.

create or replace function tuckin.revoke_api_keys_without_holder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.api_key k
    set revoked_at = now()
    where k.revoked_at is null
      and not public.has_permission(k.created_by, k.account_id, 'api_keys.manage');
  return null;
end;
$$;

create trigger revoke_api_keys_without_holder
  after update of account_role or delete on public.accounts_memberships
  for each statement execute function tuckin.revoke_api_keys_without_holder();

create trigger revoke_api_keys_without_holder
  after update or delete on public.role_permissions
  for each statement execute function tuckin.revoke_api_keys_without_holder();
