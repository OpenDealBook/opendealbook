-- Notification producers. Each row carries the relevant account_id and a
-- recipient_user_id targeting one user. These functions are security definer so
-- they can insert regardless of the caller's grants, and they insert nothing
-- when a recipient cannot be resolved rather than guessing.

-- A team invitation is addressed by email. Notify the invitee only when that
-- email already belongs to an auth user; a brand-new invitee has no in-app
-- inbox yet and is reached by the invitation email instead.
create or replace function tuckin.notify_on_invitation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  invitee_id uuid;
  team_name text;
begin
  select id into invitee_id from auth.users where email = new.email;
  if invitee_id is null then
    return new;
  end if;

  select name into team_name from public.accounts where id = new.account_id;

  insert into public.notifications (account_id, recipient_user_id, type, body)
  values (new.account_id, invitee_id, 'info', 'You have been invited to join ' || coalesce(team_name, 'a team'));

  return new;
end;
$$;

create trigger invitations_notify
  after insert on public.invitations
  for each row execute function tuckin.notify_on_invitation();

-- A new membership notifies the team owner, skipping the owner's own founding
-- membership and personal accounts (which have no memberships anyway).
create or replace function tuckin.notify_on_membership()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  owner_id uuid;
  team_name text;
begin
  select primary_owner_user_id, name into owner_id, team_name
  from public.accounts
  where id = new.account_id and not is_personal_account;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, type, body)
  values (new.account_id, owner_id, 'info', 'A new member joined ' || coalesce(team_name, 'your team'));

  return new;
end;
$$;

create trigger memberships_notify
  after insert on public.accounts_memberships
  for each row execute function tuckin.notify_on_membership();

-- A subscription status change notifies the account owner.
create or replace function tuckin.notify_on_subscription_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  owner_id uuid;
begin
  select primary_owner_user_id into owner_id
  from public.accounts where id = new.account_id;

  if owner_id is null then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, type, body)
  values (new.account_id, owner_id, 'info', 'Your subscription status changed to ' || new.status::text);

  return new;
end;
$$;

create trigger subscriptions_notify_status
  after update of status on public.subscriptions
  for each row when (old.status is distinct from new.status)
  execute function tuckin.notify_on_subscription_change();

-- A deal stage move notifies every party on the deal except the actor.
create or replace function tuckin.notify_on_deal_stage_move()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if coalesce(current_setting('odb.replay', true), 'off') = 'on' then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, type, body)
  select distinct new.account_id, dp.user_id, 'info'::public.notification_type, 'Deal moved to ' || new.stage
  from public.deal_participant dp
  where dp.deal_id = new.id
    and dp.user_id is distinct from auth.uid();

  return new;
end;
$$;

create trigger deal_notify_stage_move
  after update of stage on public.deal
  for each row when (old.stage is distinct from new.stage)
  execute function tuckin.notify_on_deal_stage_move();
