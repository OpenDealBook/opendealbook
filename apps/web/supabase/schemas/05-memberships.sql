-- Membership links a user to an account with a role. The (user_id, account_id)
-- pair is the tenancy edge.

create table if not exists public.accounts_memberships (
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  account_role varchar(50) not null references public.roles (name),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  primary key (user_id, account_id)
);

alter table public.accounts_memberships enable row level security;

create index ix_memberships_account on public.accounts_memberships (account_id);
create index ix_memberships_user on public.accounts_memberships (user_id);

revoke all on public.accounts_memberships from authenticated, service_role;
-- authenticated never inserts: memberships are created by create_team_account
-- and accept_invitation (both security definer).
grant select, delete on public.accounts_memberships to authenticated;
grant update (account_role) on public.accounts_memberships to authenticated;
grant select, insert, update, delete on public.accounts_memberships to service_role;

create trigger memberships_timestamps
  before insert or update on public.accounts_memberships
  for each row execute function public.set_timestamps();

create trigger memberships_user_tracking
  before insert or update on public.accounts_memberships
  for each row execute function public.set_user_tracking();

-- The primary owner's membership row is permanent while they own the account.
create or replace function tuckin.block_primary_owner_removal()
  returns trigger
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.accounts
    where id = old.account_id and primary_owner_user_id = old.user_id
  ) then
    raise exception 'the primary owner cannot leave their own account';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger memberships_block_owner_removal
  before delete on public.accounts_memberships
  for each row execute function tuckin.block_primary_owner_removal();

create or replace function public.has_role_on_account(account_id uuid, account_role varchar(50) default null)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.accounts_memberships m
    where m.user_id = (select auth.uid())
      and m.account_id = has_role_on_account.account_id
      and (has_role_on_account.account_role is null
           or m.account_role = has_role_on_account.account_role)
  )
  -- The primary owner holds every role on their own account, even with no
  -- membership row (personal accounts have none).
  or exists (
    select 1 from public.accounts a
    where a.id = has_role_on_account.account_id
      and a.primary_owner_user_id = (select auth.uid())
  );
$$;

grant execute on function public.has_role_on_account(uuid, varchar) to authenticated, service_role;

create or replace function public.is_team_member(account_id uuid, user_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.accounts_memberships m
    where public.has_role_on_account(is_team_member.account_id)
      and m.account_id = is_team_member.account_id
      and m.user_id = is_team_member.user_id
  );
$$;

grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;

-- Whether the caller may manage a target member. A predicate, not a guard: it
-- returns false rather than raising, because it is evaluated inside the delete
-- policy against every candidate row and a raise there would abort the whole
-- statement. The primary owner is never actionable, the account owner may
-- action anyone else, and otherwise the caller needs members.manage and a
-- strictly higher role than the target.
create or replace function public.can_action_account_member(target_team_account_id uuid, target_user_id uuid)
  returns boolean
  language plpgsql security definer
  set search_path = '' as $$
declare
  caller_level int;
  target_level int;
begin
  if target_user_id = auth.uid() then
    return false;
  end if;

  if exists (
    select 1 from public.accounts
    where id = target_team_account_id and primary_owner_user_id = target_user_id
  ) then
    return false;
  end if;

  if public.is_account_owner(target_team_account_id) then
    return true;
  end if;

  if not public.has_permission(auth.uid(), target_team_account_id, 'members.manage') then
    return false;
  end if;

  select cr.hierarchy_level into caller_level
  from public.accounts_memberships cm
  join public.roles cr on cr.name = cm.account_role
  where cm.account_id = target_team_account_id and cm.user_id = auth.uid();

  select tr.hierarchy_level into target_level
  from public.accounts_memberships tm
  join public.roles tr on tr.name = tm.account_role
  where tm.account_id = target_team_account_id and tm.user_id = target_user_id;

  return caller_level is not null and target_level is not null and caller_level < target_level;
end;
$$;

grant execute on function public.can_action_account_member(uuid, uuid) to authenticated, service_role;

create policy accounts_memberships_read on public.accounts_memberships
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_team_member(account_id, user_id));

create policy accounts_memberships_delete on public.accounts_memberships
  for delete to authenticated
  using ((select auth.uid()) = user_id or public.can_action_account_member(account_id, user_id));

-- accounts SELECT lives here because it depends on the membership helpers above.
create policy accounts_read on public.accounts
  for select to authenticated
  using (
    (select auth.uid()) = primary_owner_user_id
    or public.has_role_on_account(id)
  );
