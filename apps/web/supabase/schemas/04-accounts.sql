-- Accounts: the single tenant table. Every row is either one person's personal
-- account (slug null) or a team (slug set and unique).

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  primary_owner_user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name varchar(255) not null,
  slug text unique,
  email varchar(320) unique,
  is_personal_account boolean not null default false,
  picture_url varchar(1000),
  public_data jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  constraint accounts_personal_has_no_slug check (
    (is_personal_account and slug is null)
    or (not is_personal_account and slug is not null)
  ),
  constraint accounts_slug_shape check (
    slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'
  )
);

comment on table public.accounts is 'Personal and team accounts; the tenant boundary for all other tables.';

alter table public.accounts enable row level security;

create index ix_accounts_primary_owner on public.accounts (primary_owner_user_id);

create unique index ux_accounts_one_personal_per_owner on public.accounts (primary_owner_user_id)
  where is_personal_account;

revoke all on public.accounts from authenticated, service_role;

-- authenticated never inserts directly: rows are born through the new-user
-- trigger or create_team_account (both security definer).
grant select, delete on public.accounts to authenticated;
grant update (name, picture_url, public_data) on public.accounts to authenticated;
grant select, insert, update, delete on public.accounts to service_role;

create trigger accounts_timestamps
  before insert or update on public.accounts
  for each row execute function public.set_timestamps();

create trigger accounts_user_tracking
  before insert or update on public.accounts
  for each row execute function public.set_user_tracking();

-- Identity columns must never move once set. Enforced for end users only;
-- service_role bypasses so ownership transfer can rewrite the owner.
create or replace function tuckin.guard_account_identity()
  returns trigger
  set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
      or new.is_personal_account is distinct from old.is_personal_account
      or new.primary_owner_user_id is distinct from old.primary_owner_user_id
      or new.email is distinct from old.email then
      raise exception 'account identity fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger accounts_guard_identity
  before update on public.accounts
  for each row execute function tuckin.guard_account_identity();

create or replace function tuckin.slugify(value text)
  returns text
  set search_path = '' as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(value)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$ language sql strict immutable;

-- A team slug is unique among live slugs and other teams' former slugs, never
-- a static route under /home, at most 64 characters including its counter suffix.
create or replace function tuckin.assign_team_slug()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  base text := case when tg_op = 'INSERT' then coalesce(new.slug, tuckin.slugify(new.name)) else tuckin.slugify(new.name) end;
  candidate text := rtrim(left(base, 64), '-');
  suffix int := 0;
begin
  if base = '' then
    raise exception 'team name must contain a letter or number';
  end if;
  while candidate in ('settings', 'create-team', 'deals', 'billing', 'todos', 'outreach', 'underwriting', 'counsel')
    or exists (select 1 from public.accounts where slug = candidate and id <> new.id)
    or exists (select 1 from public.account_slug_history where slug = candidate and account_id <> new.id) loop
    suffix := suffix + 1;
    candidate := rtrim(left(base, 63 - length(suffix::text)), '-') || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

create trigger accounts_slug_on_insert
  before insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function tuckin.assign_team_slug();

create trigger accounts_slug_on_rename
  before update on public.accounts
  for each row when (new.name is distinct from old.name and not new.is_personal_account)
  execute function tuckin.assign_team_slug();

-- Create a personal account for every new auth user.
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
  insert into public.accounts (id, primary_owner_user_id, name, is_personal_account, email, picture_url)
  values (
    new.id,
    new.id,
    display_name,
    true,
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );

  perform public.seed_default_pipeline_stages(new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function tuckin.provision_personal_account();

-- Keep the personal account email aligned with the auth user email.
create or replace function tuckin.sync_personal_account_email()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.accounts
    set email = new.email
    where primary_owner_user_id = new.id and is_personal_account;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function tuckin.sync_personal_account_email();

create or replace function public.is_account_owner(account_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.accounts
    where id = is_account_owner.account_id
      and primary_owner_user_id = auth.uid()
  );
$$;

grant execute on function public.is_account_owner(uuid) to authenticated, service_role;

create or replace function public.get_upper_system_role()
  returns varchar
  set search_path = '' as $$
  select name from public.roles order by hierarchy_level limit 1;
$$ language sql;

grant execute on function public.get_upper_system_role() to service_role;

-- Create a team and its owner membership atomically. Service-role only; the
-- application enforces who may call it.
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

  insert into public.accounts (name, slug, is_personal_account, primary_owner_user_id)
  values (account_name, account_slug, false, user_id)
  returning * into team;

  insert into public.accounts_memberships (account_id, user_id, account_role)
  values (team.id, user_id, public.get_upper_system_role());

  perform public.seed_default_pipeline_stages(team.id);

  return team;
end;
$$;

grant execute on function public.create_team_account(text, uuid, text) to service_role;

-- Move team ownership to an existing member and promote them to the top role.
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

create policy accounts_delete_team on public.accounts
  for delete to authenticated
  using (auth.uid() = primary_owner_user_id and not is_personal_account);
