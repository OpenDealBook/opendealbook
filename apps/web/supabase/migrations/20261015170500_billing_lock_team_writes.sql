-- Compiled from supabase/schemas/99c-billing-lock.sql and the api_key insert
-- policy in supabase/schemas/28-api-key.sql; edit those files, not this one.

grant insert (account_id, name, key_hash, key_prefix, scopes, created_by) on public.api_key to authenticated;

create policy api_key_insert on public.api_key
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.is_account_owner(account_id)
      or public.has_permission((select auth.uid()), account_id, 'members.manage')
    )
  );

create or replace function public.storage_object_team_locked(bucket text, object_name text)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
begin
  if bucket in ('templates', 'generated', 'contracts', 'vendor-imports', 'buyer-profile') then
    target_account_id := ((storage.foldername(object_name))[1])::uuid;
  elsif bucket in ('data-room', 'meeting-recordings') then
    select account_id into target_account_id from public.deal
    where id = ((storage.foldername(object_name))[2])::uuid;
  end if;
  return tuckin.team_locked(target_account_id) and public.has_role_on_account(target_account_id);
end;
$$;

revoke all on function public.storage_object_team_locked(text, text) from public, anon;
grant execute on function public.storage_object_team_locked(text, text) to authenticated;

create policy team_lock_objects_insert on storage.objects
  as restrictive for insert to authenticated
  with check (not public.storage_object_team_locked(bucket_id, name));

create policy team_lock_objects_update on storage.objects
  as restrictive for update to authenticated
  using (not public.storage_object_team_locked(bucket_id, name))
  with check (not public.storage_object_team_locked(bucket_id, name));

create policy team_lock_objects_delete on storage.objects
  as restrictive for delete to authenticated
  using (not public.storage_object_team_locked(bucket_id, name));

delete from tuckin.billing_lock_exempt_tables where table_name in ('api_key', 'ai_call_log');

update tuckin.billing_lock_exempt_tables
  set reason = 'one user''s own data inside the team'
  where table_name in (
    'notifications', 'notification_preference', 'deal_star', 'saved_view', 'personal_todo',
    'calendar_connection', 'mailbox_connection', 'integration_connection'
  );

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.ai_call_log
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.api_key
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
