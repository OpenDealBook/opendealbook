-- Convenience read models for the app. All use security_invoker so the
-- caller's RLS applies.

-- The signed-in user's personal account plus its latest subscription status.
create or replace view public.user_account_workspace
  with (security_invoker = true) as
select
  a.id,
  a.name,
  a.picture_url,
  (
    select status from public.subscriptions
    where account_id = a.id
    order by created_at desc
    limit 1
  ) as subscription_status
from public.accounts a
where a.primary_owner_user_id = (select auth.uid())
  and a.is_personal_account
limit 1;

grant select on public.user_account_workspace to authenticated, service_role;

-- Every team the signed-in user belongs to, with their role.
create or replace view public.user_accounts
  with (security_invoker = true) as
select
  a.id,
  a.name,
  a.picture_url,
  a.slug,
  m.account_role as role
from public.accounts a
join public.accounts_memberships m on m.account_id = a.id
where m.user_id = (select auth.uid())
  and not a.is_personal_account;

grant select on public.user_accounts to authenticated, service_role;

-- Full workspace payload for one team, including role hierarchy and the
-- caller's effective permissions.
create or replace function public.team_account_workspace(account_slug text)
  returns table (
    id uuid,
    name varchar(255),
    picture_url varchar(1000),
    slug text,
    role varchar(50),
    role_hierarchy_level int,
    primary_owner_user_id uuid,
    subscription_status public.subscription_status,
    permissions public.app_permissions[]
  )
  set search_path = '' as $$
  select
    a.id,
    a.name,
    a.picture_url,
    a.slug,
    m.account_role,
    r.hierarchy_level,
    a.primary_owner_user_id,
    (select s.status from public.subscriptions s where s.account_id = a.id order by s.created_at desc limit 1),
    array(select rp.permission from public.role_permissions rp where rp.role = m.account_role)
  from public.accounts a
  join public.accounts_memberships m on m.account_id = a.id
  join public.roles r on r.name = m.account_role
  where a.slug = account_slug
    and m.user_id = (select auth.uid());
$$ language sql;

grant execute on function public.team_account_workspace(text) to authenticated, service_role;
