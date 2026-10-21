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

  insert into public.notifications (account_id, recipient_user_id, type, body, link)
  values (new.account_id, invitee_id, 'info', 'You have been invited to join ' || coalesce(team_name, 'a team'),
    '/join?token=' || new.invite_token);

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
  team_slug text;
begin
  select primary_owner_user_id, name, slug into owner_id, team_name, team_slug
  from public.accounts
  where id = new.account_id and not is_personal_account;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, type, body, link)
  values (new.account_id, owner_id, 'info', 'A new member joined ' || coalesce(team_name, 'your team'),
    '/home/' || team_slug || '/members');

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
  account_slug text;
begin
  select primary_owner_user_id, slug into owner_id, account_slug
  from public.accounts where id = new.account_id;

  if owner_id is null then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, type, body, link)
  values (new.account_id, owner_id, 'info', 'Your subscription status changed to ' || new.status::text,
    '/home/' || account_slug || '/billing');

  return new;
end;
$$;

create trigger subscriptions_notify_status
  after update of status on public.subscriptions
  for each row when (old.status is distinct from new.status)
  execute function tuckin.notify_on_subscription_change();

alter table public.notifications
  add column deal_id uuid references public.deal (id) on delete set null;

create index ix_notifications_deal on public.notifications (deal_id);

-- A deal stage move notifies every party on the deal except the actor. Only
-- the team's own members get a link, since outside parties never see team pages.
create or replace function tuckin.notify_on_deal_stage_move()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if coalesce(current_setting('odb.replay', true), 'off') = 'on' then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, deal_id, type, body, link)
  select distinct new.account_id, dp.user_id, new.id, 'info'::public.notification_type, 'Deal moved to ' || new.stage,
    case when exists (
      select 1 from public.accounts_memberships m
      where m.account_id = new.account_id and m.user_id = dp.user_id
    ) then (select '/home/' || a.slug || '/deals/' || new.id from public.accounts a where a.id = new.account_id)
    end
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
