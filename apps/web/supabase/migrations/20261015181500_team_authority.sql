-- Compiled from public.add_invitations_to_account in supabase/schemas/07-invitations.sql,
-- public.transfer_team_account_ownership in supabase/schemas/04-accounts.sql and
-- supabase/schemas/99c-billing-lock.sql; edit those files, not this one.

drop function public.add_invitations_to_account(text, public.invitation[], uuid);

-- Insert invitations for a team, one per (email, role) pair, from the caller.
-- The caller needs invites.manage and may not grant a role above their own;
-- the owner may grant any role.
create or replace function public.add_invitations_to_account(account_slug text, invites public.invitation[])
  returns setof public.invitations
  language plpgsql security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
  inviter_level int;
  invite public.invitation;
begin
  select id into target_account_id from public.accounts where slug = account_slug;

  select r.hierarchy_level into inviter_level
  from public.accounts_memberships m
  join public.roles r on r.name = m.account_role
  where m.account_id = target_account_id and m.user_id = auth.uid();

  if not public.has_permission(auth.uid(), target_account_id, 'invites.manage')
    or exists (
      select 1 from unnest(invites) i
      join public.roles r on r.name = i.role
      where r.hierarchy_level < inviter_level
    ) then
    raise exception 'not allowed to invite to this team' using errcode = 'insufficient_privilege';
  end if;

  foreach invite in array invites loop
    return query
    insert into public.invitations (email, account_id, invited_by, role)
    values (invite.email, target_account_id, auth.uid(), invite.role)
    returning *;
  end loop;
end;
$$;

grant execute on function public.add_invitations_to_account(text, public.invitation[]) to authenticated;

create or replace function public.transfer_team_account_ownership(target_account_id uuid, new_owner_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.is_account_owner(target_account_id) then
    raise exception 'only the owner can transfer this team' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.accounts_memberships
    where account_id = target_account_id and user_id = new_owner_id
  ) then
    raise exception 'the new owner must already be a member';
  end if;

  update public.accounts
    set primary_owner_user_id = new_owner_id
    where id = target_account_id and not is_personal_account;

  update public.accounts_memberships
    set account_role = public.get_upper_system_role()
    where account_id = target_account_id and user_id = new_owner_id;
end;
$$;

grant execute on function public.transfer_team_account_ownership(uuid, uuid) to authenticated;

revoke execute on function public.transfer_team_account_ownership(uuid, uuid) from service_role;

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('seller_send_limit', 'service-role only, written by super-admins')
on conflict (table_name) do update set reason = excluded.reason;
