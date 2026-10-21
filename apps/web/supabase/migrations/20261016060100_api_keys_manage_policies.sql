-- Compiled from supabase/schemas/15-roles-seed.sql and supabase/schemas/28-api-key.sql.

insert into public.role_permissions (role, permission) values
  ('owner', 'api_keys.manage'),
  ('admin', 'api_keys.manage')
on conflict (role, permission) do nothing;

drop policy if exists api_key_read on public.api_key;
create policy api_key_read on public.api_key
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'));

drop policy if exists api_key_insert on public.api_key;
create policy api_key_insert on public.api_key
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission((select auth.uid()), account_id, 'api_keys.manage')
  );

drop policy if exists api_key_update on public.api_key;
create policy api_key_update on public.api_key
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'));
