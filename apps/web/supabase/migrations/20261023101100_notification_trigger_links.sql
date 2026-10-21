-- Trigger-written notices link to where the person acts on them: an
-- invitation to the page that accepts it, a new member to the team members
-- page, a subscription change to billing, and a stage move to the deal for
-- team members only.

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
