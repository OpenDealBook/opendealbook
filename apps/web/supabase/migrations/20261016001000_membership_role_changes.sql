-- Compiled from supabase/schemas/05-memberships.sql; edit that file, not this one.

-- Members with roles.manage change the roles of members below them, to a role
-- below their own; the owner changes any role but their own.
create policy accounts_memberships_update on public.accounts_memberships
  for update to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'roles.manage')
    and public.can_action_account_member(account_id, user_id)
  )
  with check (
    public.has_permission((select auth.uid()), account_id, 'roles.manage')
    and public.has_more_elevated_role((select auth.uid()), account_id, account_role)
  );
