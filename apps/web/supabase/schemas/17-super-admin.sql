-- Permissive read policies that let a verified super admin see across every
-- tenant's core records. These sit alongside the existing per-account policies;
-- a permissive policy widens access, so ordinary members are unaffected and
-- only a caller passing is_super_admin() gains the cross-tenant read.

create policy super_admins_access_accounts on public.accounts
  for select to authenticated
  using (public.is_super_admin());

create policy super_admins_access_accounts_memberships on public.accounts_memberships
  for select to authenticated
  using (public.is_super_admin());

create policy super_admins_access_subscriptions on public.subscriptions
  for select to authenticated
  using (public.is_super_admin());

create policy super_admins_access_orders on public.orders
  for select to authenticated
  using (public.is_super_admin());

create policy super_admins_access_invitations on public.invitations
  for select to authenticated
  using (public.is_super_admin());

create policy super_admins_access_role_permissions on public.role_permissions
  for select to authenticated
  using (public.is_super_admin());
