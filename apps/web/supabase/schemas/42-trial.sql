-- Trial window on the account. trial_ends_at is stamped at provisioning to 30
-- days out; a null value means the account is not time-limited. Both
-- provisioning paths set it, mirroring how seed_default_pipeline_stages is wired.

alter table public.accounts add column trial_ends_at timestamptz;

-- Re-created here (not in 04-accounts) because trial_ends_at only exists from
-- this file onward; the insert now stamps the trial start.
create or replace function tuckin.provision_personal_account()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  display_name text := coalesce(
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1),
    ''
  );
begin
  insert into public.accounts (id, primary_owner_user_id, name, is_personal_account, email, picture_url, trial_ends_at)
  values (
    new.id,
    new.id,
    display_name,
    true,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    now() + interval '30 days'
  );

  perform public.seed_default_pipeline_stages(new.id);

  return new;
end;
$$;

create or replace function public.create_team_account(account_name text, user_id uuid, account_slug text default null)
  returns public.accounts
  language plpgsql security definer
  set search_path = '' as $$
declare
  team public.accounts;
begin
  if not public.is_set('enable_team_accounts') then
    raise exception 'team accounts are disabled';
  end if;

  insert into public.accounts (name, slug, is_personal_account, primary_owner_user_id, trial_ends_at)
  values (account_name, account_slug, false, user_id, now() + interval '30 days')
  returning * into team;

  insert into public.accounts_memberships (account_id, user_id, account_role)
  values (team.id, user_id, public.get_upper_system_role());

  perform public.seed_default_pipeline_stages(team.id);

  return team;
end;
$$;

create or replace function public.is_trial_active(p_account_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.accounts a
    where a.id = is_trial_active.p_account_id
      and (a.trial_ends_at is null or a.trial_ends_at > now())
  );
$$;

grant execute on function public.is_trial_active(uuid) to authenticated, service_role;

-- Keep any account created before this column existed consistent.
update public.accounts
  set trial_ends_at = coalesce(created_at, now()) + interval '30 days'
  where trial_ends_at is null;
