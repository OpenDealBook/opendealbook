-- Tuckin base schema.
-- Compiled from supabase/schemas/*.sql in dependency order. Regenerate by
-- concatenating the declarative schema files; edit those files, not this one.


-- ===== schemas/00-privileges.sql =====
-- Baseline privileges for Tuckin.
-- The public schema is locked down: nothing is executable or readable by
-- anon/authenticated unless a later file grants it back explicitly.

create schema if not exists tuckin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter default privileges revoke execute on functions from public;

revoke all on schema public from public;
revoke all privileges on database "postgres" from anon;

revoke all privileges on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all functions in schema public from anon;

alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

grant usage on schema public to authenticated, service_role;

-- ===== schemas/01-enums.sql =====
-- Domain enums shared across the schema.

create type public.app_permissions as enum (
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage',
  'deals.create',
  'deals.manage',
  'checklists.manage',
  'participants.manage',
  'buyer_profile.manage'
);

create type public.billing_provider as enum ('stripe', 'lemon-squeezy', 'paddle');

create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

create type public.subscription_item_type as enum ('flat', 'per_seat', 'metered');

create type public.payment_status as enum ('pending', 'succeeded', 'failed');

create type public.notification_type as enum ('info', 'warning', 'error');

create type public.notification_channel as enum ('in_app', 'email');

-- Tuple used by bulk invitation helpers so an array of (email, role) pairs can
-- be passed as a single argument.
create type public.invitation as (email text, role varchar(50));

-- ===== schemas/02-config.sql =====
-- Single-row feature configuration plus the shared timestamp/tracking triggers
-- that most tables reuse.

create table if not exists public.config (
  enable_team_accounts boolean not null default true,
  enable_account_billing boolean not null default true,
  enable_team_account_billing boolean not null default true,
  billing_provider public.billing_provider not null default 'stripe',
  comp_pool_min_bucket int not null default 5
);

alter table public.config enable row level security;

insert into public.config default values;

revoke all on public.config from authenticated, service_role;
grant select on public.config to authenticated, service_role;

create policy config_read on public.config
  for select to authenticated using (true);

create or replace function public.is_set(field_name text)
  returns boolean
  set search_path = '' as $$
declare
  value boolean;
begin
  execute format('select %I from public.config limit 1', field_name) into value;
  return value;
end;
$$ language plpgsql;

grant execute on function public.is_set(text) to authenticated, service_role;

create or replace function public.get_config()
  returns json
  set search_path = '' as $$
  select row_to_json(c) from public.config c limit 1;
$$ language sql;

grant execute on function public.get_config() to authenticated, service_role;

-- Stamp created_at/updated_at on write. created_at is frozen after insert.
create or replace function public.set_timestamps()
  returns trigger
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

-- Stamp created_by/updated_by with the acting user. created_by is frozen after
-- insert.
create or replace function public.set_user_tracking()
  returns trigger
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$ language plpgsql;

-- ===== schemas/03-roles.sql =====
-- Roles available to memberships. hierarchy_level orders authority; the lowest
-- number is the most powerful role.

create table if not exists public.roles (
  name varchar(50) primary key,
  hierarchy_level int not null unique check (hierarchy_level > 0)
);

alter table public.roles enable row level security;

revoke all on public.roles from authenticated, service_role;
grant select on public.roles to authenticated, service_role;

create policy roles_read on public.roles
  for select to authenticated using (true);

-- ===== schemas/04-accounts.sql =====
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
grant update (name, slug, picture_url, public_data) on public.accounts to authenticated;
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

-- Derive a unique slug from the team name, suffixing a counter on collision.
create or replace function tuckin.assign_team_slug()
  returns trigger
  set search_path = '' as $$
declare
  base text := tuckin.slugify(new.name);
  candidate text := base;
  suffix int := 1;
begin
  while exists (select 1 from public.accounts where slug = candidate) loop
    candidate := base || '-' || suffix;
    suffix := suffix + 1;
  end loop;
  new.slug := candidate;
  return new;
end;
$$ language plpgsql;

create trigger accounts_slug_on_insert
  before insert on public.accounts
  for each row when (new.name is not null and new.slug is null and not new.is_personal_account)
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
  if current_user <> 'service_role' then
    raise exception 'ownership transfer is restricted to the service role';
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

grant execute on function public.transfer_team_account_ownership(uuid, uuid) to service_role;

create policy accounts_update on public.accounts
  for update to authenticated
  using ((select auth.uid()) = primary_owner_user_id)
  with check ((select auth.uid()) = primary_owner_user_id);

create policy accounts_delete_team on public.accounts
  for delete to authenticated
  using (auth.uid() = primary_owner_user_id and not is_personal_account);

-- ===== schemas/05-memberships.sql =====
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

-- ===== schemas/06-roles-permissions.sql =====
-- Which permissions each role grants. Global reference data, readable by all
-- authenticated users.

create table if not exists public.role_permissions (
  id bigint generated by default as identity primary key,
  role varchar(50) not null references public.roles (name),
  permission public.app_permissions not null,
  unique (role, permission)
);

alter table public.role_permissions enable row level security;

create index ix_role_permissions_role on public.role_permissions (role);

revoke all on public.role_permissions from authenticated, service_role;
grant select on public.role_permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to service_role;

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

create or replace function public.has_permission(user_id uuid, account_id uuid, permission_name public.app_permissions)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.accounts_memberships m
    join public.role_permissions rp on rp.role = m.account_role
    where m.user_id = has_permission.user_id
      and m.account_id = has_permission.account_id
      and rp.permission = has_permission.permission_name
  )
  -- The primary owner holds every permission on their own account, even with no
  -- membership row (personal accounts have none).
  or exists (
    select 1 from public.accounts a
    where a.id = has_permission.account_id
      and a.primary_owner_user_id = has_permission.user_id
  );
$$;

grant execute on function public.has_permission(uuid, uuid, public.app_permissions) to authenticated, service_role;

-- True when the target user outranks the given role on the account (or is the
-- primary owner). Used to stop a member from granting a role above their own.
create or replace function public.has_more_elevated_role(target_user_id uuid, target_account_id uuid, role_name varchar)
  returns boolean
  language plpgsql security definer
  set search_path = '' as $$
declare
  user_level int;
  role_level int;
begin
  if exists (
    select 1 from public.accounts
    where id = target_account_id and primary_owner_user_id = target_user_id
  ) then
    return true;
  end if;

  select r.hierarchy_level into user_level
  from public.accounts_memberships m
  join public.roles r on r.name = m.account_role
  where m.account_id = target_account_id and m.user_id = target_user_id;

  select hierarchy_level into role_level from public.roles where name = role_name;

  if user_level is null or role_level is null then
    return false;
  end if;

  return user_level < role_level;
end;
$$;

grant execute on function public.has_more_elevated_role(uuid, uuid, varchar) to authenticated, service_role;

-- ===== schemas/07-invitations.sql =====
-- Pending invitations to join a team account.

create table if not exists public.invitations (
  id bigint generated by default as identity primary key,
  email varchar(320) not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  invited_by uuid not null references auth.users on delete cascade,
  role varchar(50) not null references public.roles (name),
  invite_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  constraint invitations_expiry_after_creation check (expires_at > created_at),
  constraint invitations_email_shape check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  unique (email, account_id)
);

alter table public.invitations enable row level security;

create index ix_invitations_account on public.invitations (account_id);

revoke all on public.invitations from authenticated, service_role;
grant select, insert, update, delete on public.invitations to service_role;
grant delete on public.invitations to authenticated;
grant update (role, expires_at) on public.invitations to authenticated;
-- invite_token is a credential and is deliberately withheld from the
-- authenticated column grant.
grant select (id, email, account_id, invited_by, role, created_at, updated_at, expires_at)
  on public.invitations to authenticated;

create trigger invitations_timestamps
  before insert or update on public.invitations
  for each row execute function public.set_timestamps();

-- Invitations only make sense for team accounts.
create or replace function tuckin.reject_personal_account_invite()
  returns trigger
  set search_path = '' as $$
begin
  if (select is_personal_account from public.accounts where id = new.account_id) then
    raise exception 'personal accounts cannot have invitations';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger invitations_team_only
  before insert or update on public.invitations
  for each row execute function tuckin.reject_personal_account_invite();

create policy invitations_read on public.invitations
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy invitations_update on public.invitations
  for update to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'invites.manage')
    and public.has_more_elevated_role((select auth.uid()), account_id, role)
  )
  with check (
    public.has_permission((select auth.uid()), account_id, 'invites.manage')
    and public.has_more_elevated_role((select auth.uid()), account_id, role)
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (
    public.has_role_on_account(account_id)
    and public.has_permission((select auth.uid()), account_id, 'invites.manage')
  );

-- Insert invitations for a team, one per (email, role) pair. Service-role only.
create or replace function public.add_invitations_to_account(account_slug text, invites public.invitation[], invited_by uuid)
  returns setof public.invitations
  language plpgsql security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
  invite public.invitation;
begin
  select id into target_account_id from public.accounts where slug = account_slug;

  foreach invite in array invites loop
    return query
    insert into public.invitations (email, account_id, invited_by, role)
    values (invite.email, target_account_id, add_invitations_to_account.invited_by, invite.role)
    returning *;
  end loop;
end;
$$;

grant execute on function public.add_invitations_to_account(text, public.invitation[], uuid) to service_role;

-- Consume a valid token: create the membership and drop the invitation.
create or replace function public.accept_invitation(token text, user_id uuid)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  target_account_id uuid;
  target_role varchar(50);
begin
  select account_id, role into target_account_id, target_role
  from public.invitations
  where invite_token = token and expires_at > now();

  if not found then
    raise exception 'invalid or expired invitation';
  end if;

  insert into public.accounts_memberships (user_id, account_id, account_role)
  values (accept_invitation.user_id, target_account_id, target_role);

  delete from public.invitations where invite_token = token;

  return target_account_id;
end;
$$;

grant execute on function public.accept_invitation(text, uuid) to service_role;

-- ===== schemas/08-billing-customers.sql =====
-- Maps an account to its customer record in a billing provider.

create table if not exists public.billing_customers (
  id bigint generated by default as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider public.billing_provider not null,
  customer_id text not null,
  email text,
  unique (account_id, provider, customer_id)
);

alter table public.billing_customers enable row level security;

create index ix_billing_customers_account on public.billing_customers (account_id);

revoke all on public.billing_customers from authenticated, service_role;
grant select on public.billing_customers to authenticated;
grant select, insert, update, delete on public.billing_customers to service_role;

-- billing.manage gates read access, so ordinary members never see billing data.
create policy billing_customers_read on public.billing_customers
  for select to authenticated
  using (
    (account_id = (select auth.uid()) and public.is_set('enable_account_billing'))
    or public.has_permission((select auth.uid()), account_id, 'billing.manage')
  );

-- ===== schemas/09-subscriptions.sql =====
-- Recurring subscription state for an account and its priced line items.

create table if not exists public.subscriptions (
  id text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  billing_customer_id bigint not null references public.billing_customers on delete cascade,
  status public.subscription_status not null,
  active boolean not null,
  billing_provider public.billing_provider not null,
  cancel_at_period_end boolean not null,
  currency varchar(3) not null,
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create index ix_subscriptions_account on public.subscriptions (account_id);

revoke all on public.subscriptions from authenticated, service_role;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create trigger subscriptions_timestamps
  before insert or update on public.subscriptions
  for each row execute function public.set_timestamps();

create policy subscriptions_read on public.subscriptions
  for select to authenticated
  using (
    (account_id = (select auth.uid()) and public.is_set('enable_account_billing'))
    or (public.has_permission((select auth.uid()), account_id, 'billing.manage')
        and public.is_set('enable_team_account_billing'))
  );

create table if not exists public.subscription_items (
  id varchar(255) primary key,
  subscription_id text not null references public.subscriptions (id) on delete cascade,
  product_id varchar(255) not null,
  variant_id varchar(255) not null,
  type public.subscription_item_type not null,
  price_amount numeric,
  quantity integer not null default 1,
  interval varchar(255) not null,
  interval_count integer not null check (interval_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, product_id, variant_id)
);

alter table public.subscription_items enable row level security;

create index ix_subscription_items_subscription on public.subscription_items (subscription_id);

revoke all on public.subscription_items from authenticated, service_role;
grant select on public.subscription_items to authenticated;
grant select, insert, update, delete on public.subscription_items to service_role;

create trigger subscription_items_timestamps
  before insert or update on public.subscription_items
  for each row execute function public.set_timestamps();

create policy subscription_items_read on public.subscription_items
  for select to authenticated
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (s.account_id = (select auth.uid())
             or public.has_permission((select auth.uid()), s.account_id, 'billing.manage'))
    )
  );

create or replace function public.has_active_subscription(target_account_id uuid)
  returns boolean
  language sql
  set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions
    where account_id = target_account_id and active
  );
$$;

grant execute on function public.has_active_subscription(uuid) to authenticated, service_role;

-- Upsert a subscription and reconcile its line items from a billing webhook.
create or replace function public.upsert_subscription(
  target_account_id uuid,
  target_customer_id text,
  target_subscription_id text,
  active boolean,
  status public.subscription_status,
  billing_provider public.billing_provider,
  cancel_at_period_end boolean,
  currency varchar(3),
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  line_items jsonb,
  trial_starts_at timestamptz default null,
  trial_ends_at timestamptz default null
) returns public.subscriptions
  language plpgsql security definer
  set search_path = '' as $$
declare
  customer_row_id bigint;
  result public.subscriptions;
begin
  insert into public.billing_customers (account_id, provider, customer_id)
  values (target_account_id, billing_provider, target_customer_id)
  on conflict (account_id, provider, customer_id) do update
    set provider = excluded.provider
  returning id into customer_row_id;

  insert into public.subscriptions (
    id, account_id, billing_customer_id, status, active, billing_provider,
    cancel_at_period_end, currency, period_starts_at, period_ends_at,
    trial_starts_at, trial_ends_at
  )
  values (
    target_subscription_id, target_account_id, customer_row_id, status, active, billing_provider,
    cancel_at_period_end, currency, period_starts_at, period_ends_at,
    trial_starts_at, trial_ends_at
  )
  on conflict (id) do update set
    status = excluded.status,
    active = excluded.active,
    cancel_at_period_end = excluded.cancel_at_period_end,
    currency = excluded.currency,
    period_starts_at = excluded.period_starts_at,
    period_ends_at = excluded.period_ends_at,
    trial_starts_at = excluded.trial_starts_at,
    trial_ends_at = excluded.trial_ends_at
  returning * into result;

  delete from public.subscription_items
  where subscription_id = result.id
    and id not in (select item ->> 'id' from jsonb_array_elements(line_items) as item);

  insert into public.subscription_items (
    id, subscription_id, product_id, variant_id, type, price_amount, quantity, interval, interval_count
  )
  select
    item ->> 'id',
    result.id,
    item ->> 'product_id',
    item ->> 'variant_id',
    (item ->> 'type')::public.subscription_item_type,
    (item ->> 'price_amount')::numeric,
    (item ->> 'quantity')::integer,
    item ->> 'interval',
    (item ->> 'interval_count')::integer
  from jsonb_array_elements(line_items) as item
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    type = excluded.type,
    price_amount = excluded.price_amount,
    quantity = excluded.quantity,
    interval = excluded.interval,
    interval_count = excluded.interval_count;

  return result;
end;
$$;

grant execute on function public.upsert_subscription(
  uuid, text, text, boolean, public.subscription_status, public.billing_provider,
  boolean, varchar, timestamptz, timestamptz, jsonb, timestamptz, timestamptz
) to service_role;

-- ===== schemas/10-orders.sql =====
-- One-time purchases for an account and their line items.

create table if not exists public.orders (
  id text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  billing_customer_id bigint not null references public.billing_customers on delete cascade,
  status public.payment_status not null,
  billing_provider public.billing_provider not null,
  total_amount numeric not null,
  currency varchar(3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index ix_orders_account on public.orders (account_id);

revoke all on public.orders from authenticated, service_role;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.orders to service_role;

create trigger orders_timestamps
  before insert or update on public.orders
  for each row execute function public.set_timestamps();

create policy orders_read on public.orders
  for select to authenticated
  using (
    (account_id = (select auth.uid()) and public.is_set('enable_account_billing'))
    or (public.has_permission((select auth.uid()), account_id, 'billing.manage')
        and public.is_set('enable_team_account_billing'))
  );

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders (id) on delete cascade,
  product_id text not null,
  variant_id text not null,
  price_amount numeric,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id, variant_id)
);

alter table public.order_items enable row level security;

create index ix_order_items_order on public.order_items (order_id);

revoke all on public.order_items from authenticated, service_role;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_items to service_role;

create trigger order_items_timestamps
  before insert or update on public.order_items
  for each row execute function public.set_timestamps();

create policy order_items_read on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.account_id = (select auth.uid())
             or public.has_permission((select auth.uid()), o.account_id, 'billing.manage'))
    )
  );

-- Upsert an order and reconcile its line items from a billing webhook.
create or replace function public.upsert_order(
  target_account_id uuid,
  target_customer_id text,
  target_order_id text,
  status public.payment_status,
  billing_provider public.billing_provider,
  total_amount numeric,
  currency varchar(3),
  line_items jsonb
) returns public.orders
  language plpgsql security definer
  set search_path = '' as $$
declare
  customer_row_id bigint;
  result public.orders;
begin
  insert into public.billing_customers (account_id, provider, customer_id)
  values (target_account_id, billing_provider, target_customer_id)
  on conflict (account_id, provider, customer_id) do update
    set provider = excluded.provider
  returning id into customer_row_id;

  insert into public.orders (
    id, account_id, billing_customer_id, status, billing_provider, total_amount, currency
  )
  values (
    target_order_id, target_account_id, customer_row_id, status, billing_provider, total_amount, currency
  )
  on conflict (id) do update set
    status = excluded.status,
    total_amount = excluded.total_amount,
    currency = excluded.currency
  returning * into result;

  delete from public.order_items
  where order_id = result.id
    and id not in (select item ->> 'id' from jsonb_array_elements(line_items) as item);

  insert into public.order_items (id, order_id, product_id, variant_id, price_amount, quantity)
  select
    item ->> 'id',
    result.id,
    item ->> 'product_id',
    item ->> 'variant_id',
    (item ->> 'price_amount')::numeric,
    (item ->> 'quantity')::integer
  from jsonb_array_elements(line_items) as item
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    price_amount = excluded.price_amount,
    quantity = excluded.quantity;

  return result;
end;
$$;

grant execute on function public.upsert_order(
  uuid, text, text, public.payment_status, public.billing_provider, numeric, varchar, jsonb
) to service_role;

-- ===== schemas/11-notifications.sql =====
-- In-app notifications. A row is either targeted to one user (recipient_user_id
-- set) or an account-wide broadcast (recipient_user_id null, read by every
-- account member). Only the dismissed flag is user-writable.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  recipient_user_id uuid references auth.users (id) on delete cascade,
  type public.notification_type not null default 'info',
  channel public.notification_channel not null default 'in_app',
  body varchar(5000) not null,
  link varchar(255),
  dismissed boolean not null default false,
  expires_at timestamptz default now() + interval '1 month',
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create index ix_notifications_account_active on public.notifications (account_id, dismissed, expires_at);
create index ix_notifications_recipient on public.notifications (recipient_user_id);

revoke all on public.notifications from authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (dismissed) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

create policy notifications_read on public.notifications
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and public.has_role_on_account(account_id))
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and public.has_role_on_account(account_id))
  );

-- Only the dismissed flag may change through an authenticated update.
create or replace function tuckin.restrict_notification_update()
  returns trigger
  set search_path = '' as $$
begin
  old.dismissed := new.dismissed;
  if new is distinct from old then
    raise exception 'only the dismissed flag can be updated';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger notifications_restrict_update
  before update on public.notifications
  for each row execute function tuckin.restrict_notification_update();

-- ===== schemas/12-one-time-tokens.sql =====
-- Single-use tokens (nonces) for email verification, secure invites, and
-- similar flows. The table is RPC-only: authenticated is granted nothing, and
-- all access goes through the security-definer functions below. Only a hash of
-- the token is stored; the plaintext is returned once at creation.

create table if not exists public.nonces (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  purpose text not null,
  user_id uuid references auth.users on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  scopes text[] not null default '{}',
  verification_attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.nonces enable row level security;

create index ix_nonces_lookup on public.nonces (token_hash, purpose)
  where used_at is null;

revoke all on public.nonces from authenticated, service_role;
grant select, insert, update, delete on public.nonces to service_role;

create or replace function tuckin.hash_token(token text)
  returns text
  set search_path = '' as $$
  select encode(extensions.digest(token, 'sha256'), 'hex');
$$ language sql immutable;

-- Mint a nonce and return its plaintext token exactly once.
create or replace function public.create_nonce(
  purpose text,
  user_id uuid default null,
  account_id uuid default null,
  expires_in_seconds integer default 3600,
  metadata jsonb default '{}'::jsonb,
  scopes text[] default '{}'
) returns text
  language plpgsql security definer
  set search_path = '' as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.nonces (token_hash, purpose, user_id, account_id, metadata, scopes, expires_at)
  values (
    tuckin.hash_token(token),
    create_nonce.purpose,
    create_nonce.user_id,
    create_nonce.account_id,
    create_nonce.metadata,
    create_nonce.scopes,
    now() + make_interval(secs => expires_in_seconds)
  );
  return token;
end;
$$;

grant execute on function public.create_nonce(text, uuid, uuid, integer, jsonb, text[]) to service_role;

-- Redeem a nonce. Returns a JSONB result rather than raising so callers can
-- branch on the outcome: on success { valid, user_id, metadata, scopes, purpose },
-- otherwise { valid: false, message } with a max_attempts_exceeded or scope
-- variant. Each redemption of a still-live nonce increments its attempt count;
-- once the count passes the clamp the nonce is consumed so repeated failing
-- guesses (for example a scope mismatch retried in a loop) cannot continue.
create or replace function public.verify_nonce(
  token text,
  purpose text,
  required_scopes text[] default null,
  max_verification_attempts integer default 5
) returns jsonb
  language plpgsql security definer
  set search_path = '' as $$
declare
  matched public.nonces;
  attempt_ceiling integer := least(greatest(coalesce(max_verification_attempts, 5), 1), 10);
begin
  update public.nonces n
    set verification_attempts = n.verification_attempts + 1
    where n.id = (
      select id
      from public.nonces
      where token_hash = tuckin.hash_token(token)
        and nonces.purpose = verify_nonce.purpose
        and used_at is null
        and expires_at > now()
      for update skip locked
      limit 1
    )
  returning n.* into matched;

  if matched.id is null then
    return jsonb_build_object('valid', false, 'message', 'invalid, expired, or already used token');
  end if;

  if matched.verification_attempts > attempt_ceiling then
    update public.nonces set used_at = now() where id = matched.id and used_at is null;
    return jsonb_build_object(
      'valid', false,
      'message', 'token locked after too many attempts',
      'max_attempts_exceeded', true
    );
  end if;

  if required_scopes is not null
     and array_length(required_scopes, 1) > 0
     and not (matched.scopes @> required_scopes) then
    return jsonb_build_object(
      'valid', false,
      'message', 'token missing required scopes',
      'token_scopes', matched.scopes,
      'required_scopes', required_scopes
    );
  end if;

  update public.nonces set used_at = now() where id = matched.id;

  return jsonb_build_object(
    'valid', true,
    'user_id', matched.user_id,
    'metadata', matched.metadata,
    'scopes', matched.scopes,
    'purpose', matched.purpose
  );
end;
$$;

grant execute on function public.verify_nonce(text, text, text[], integer) to service_role;

-- ===== schemas/13-mfa.sql =====
-- MFA design choice: Tuckin relies on Supabase Auth's built-in multi-factor
-- support (auth.mfa_factors, managed by GoTrue and configured under
-- [auth.mfa] in config.toml) rather than a bespoke factors table. Enrollment,
-- challenge, and verification are handled by the auth service; the app only
-- needs to read whether the current user has a verified factor, which the
-- helper below exposes to RLS and the API.

create or replace function public.user_has_verified_mfa()
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = auth.uid() and status::text = 'verified'
  );
$$;

grant execute on function public.user_has_verified_mfa() to authenticated, service_role;

-- True when the current session was elevated to assurance level 2 (a second
-- factor was verified in this session), read straight from the JWT.
create or replace function public.is_aal2()
  returns boolean
  language sql stable
  set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal' = 'aal2', false);
$$;

grant execute on function public.is_aal2() to authenticated;

-- Compliance gate for the restrictive-policy pattern: a user who has enrolled
-- any verified factor must be at aal2; a user with no factors is unaffected.
create or replace function public.is_mfa_compliant()
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select case
    when public.user_has_verified_mfa() then public.is_aal2()
    else true
  end;
$$;

grant execute on function public.is_mfa_compliant() to authenticated;

-- Role check only, with no assurance-level requirement, so the super-admin MFA
-- setup page can be reached before a second factor has been enrolled.
create or replace function public.has_super_admin_role()
  returns boolean
  language sql stable
  set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata') ->> 'role' = 'super-admin', false);
$$;

grant execute on function public.has_super_admin_role() to authenticated;

-- A super admin must hold the role, be at aal2, and have a verified TOTP factor
-- enrolled. All three are required; any missing piece denies the elevation.
create or replace function public.is_super_admin()
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_aal2()
    and public.has_super_admin_role()
    and exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid()
        and factor_type = 'totp'
        and status::text = 'verified'
    );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- One round trip for the admin guard: the role gate (for the setup page) and
-- the full elevation check together.
create or replace function public.super_admin_state()
  returns table (has_role boolean, is_super_admin boolean)
  language sql stable security definer
  set search_path = '' as $$
  select public.has_super_admin_role(), public.is_super_admin();
$$;

grant execute on function public.super_admin_state() to authenticated;

-- ===== schemas/14-account-views.sql =====
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

-- ===== schemas/15-roles-seed.sql =====
-- Seed roles and their permissions. owner outranks admin outranks member.

insert into public.roles (name, hierarchy_level) values
  ('owner', 1),
  ('admin', 2),
  ('member', 3);

insert into public.role_permissions (role, permission) values
  ('owner', 'roles.manage'),
  ('owner', 'billing.manage'),
  ('owner', 'settings.manage'),
  ('owner', 'members.manage'),
  ('owner', 'invites.manage'),
  ('admin', 'settings.manage'),
  ('admin', 'members.manage'),
  ('admin', 'invites.manage'),
  ('member', 'settings.manage');

-- ===== schemas/16-mfa-recovery.sql =====
-- Backup codes a user mints after enrolling MFA so they can recover access if
-- they lose their authenticator. Codes are stored as keyed HMAC-SHA256 over
-- (user_id, normalized code) with a server-side pepper, never in plaintext.
-- Lookup is an indexed equality probe, so timing does not leak which code (if
-- any) matched. The table is function-only: no role holds base privileges, and
-- every path runs through the security-definer functions below.

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade not null,
  code_hmac bytea not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ix_mfa_recovery_codes_user_hmac_unused
  on public.mfa_recovery_codes (user_id, code_hmac)
  where used_at is null;

alter table public.mfa_recovery_codes enable row level security;

revoke all on public.mfa_recovery_codes from authenticated, service_role;

-- Server-side pepper. Operators set it once per database with
--   alter database postgres set app.mfa_recovery_pepper = '<long-random>';
-- Unset falls back to an empty key so dev and tests still work; production
-- deploys must set it.
create or replace function tuckin.mfa_recovery_pepper()
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select coalesce(current_setting('app.mfa_recovery_pepper', true), '');
$$;

-- Deterministic keyed hash of a normalized code. The same normalization runs
-- at mint and at redemption so equality lookups line up; whitespace and dashes
-- are stripped and the code is upper-cased.
create or replace function tuckin.mfa_recovery_code_hmac(user_id uuid, code text)
  returns bytea
  language sql stable security definer
  set search_path = '' as $$
  select extensions.hmac(
    mfa_recovery_code_hmac.user_id::text || ':' || upper(regexp_replace(mfa_recovery_code_hmac.code, '[\s-]+', '', 'g')),
    tuckin.mfa_recovery_pepper(),
    'sha256'
  );
$$;

-- Replace the caller's entire code set with a fresh batch. Requires aal2 and
-- validates every code before deleting the old set, so a malformed input can
-- never leave the user with fewer codes than they had.
create or replace function public.replace_mfa_recovery_codes(p_codes text[])
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  caller uuid := auth.uid();
  code text;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_aal2() then
    raise exception 'multi-factor verification required' using errcode = '28000';
  end if;

  if p_codes is null or array_length(p_codes, 1) is null then
    raise exception 'at least one code is required' using errcode = '22023';
  end if;

  foreach code in array p_codes loop
    if code is null or length(code) < 8 then
      raise exception 'code too short' using errcode = '22023';
    end if;
  end loop;

  delete from public.mfa_recovery_codes where user_id = caller;

  insert into public.mfa_recovery_codes (user_id, code_hmac)
  select caller, tuckin.mfa_recovery_code_hmac(caller, c)
  from unnest(p_codes) as c;
end;
$$;

grant execute on function public.replace_mfa_recovery_codes(text[]) to authenticated;

-- Redeem one code during recovery, while the session is still at aal1. Returns
-- the owning user_id on success or null when no unused code matches. A single
-- indexed seek keeps timing uniform regardless of how many codes remain.
create or replace function public.consume_mfa_recovery_code(p_code text)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  caller uuid := auth.uid();
  target bytea;
  consumed uuid;
begin
  if caller is null or p_code is null or length(p_code) = 0 then
    return null;
  end if;

  target := tuckin.mfa_recovery_code_hmac(caller, p_code);

  update public.mfa_recovery_codes
    set used_at = now()
    where id = (
      select id
      from public.mfa_recovery_codes
      where user_id = caller
        and code_hmac = target
        and used_at is null
      for update skip locked
      limit 1
    )
  returning user_id into consumed;

  return consumed;
end;
$$;

grant execute on function public.consume_mfa_recovery_code(text) to authenticated;

-- Let a user see how many codes they minted and how many remain. Gated on aal2
-- so an attacker at aal1 cannot probe the victim's remaining-code count.
create or replace function public.mfa_recovery_codes_status()
  returns table (total integer, unused integer, last_generated_at timestamptz)
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if not public.is_aal2() then
    raise exception 'multi-factor verification required' using errcode = '28000';
  end if;

  return query
  select
    count(*)::integer,
    count(*) filter (where used_at is null)::integer,
    max(created_at)
  from public.mfa_recovery_codes
  where user_id = auth.uid();
end;
$$;

grant execute on function public.mfa_recovery_codes_status() to authenticated;

-- ===== schemas/17-super-admin.sql =====
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

-- ===== schemas/18-deal-enums.sql =====
-- Enums for the OpenDealbook deal domain.

-- The single checklist status used everywhere a checklist item has a state.
create type public.checklist_status as enum (
  'not_started',
  'requested',
  'received',
  'reviewed'
);

create type public.deal_source as enum (
  'manual',
  'broker',
  'outreach',
  'marketplace',
  'referral'
);

create type public.participant_party as enum (
  'buyer',
  'seller',
  'broker',
  'lender'
);

create type public.participant_scope as enum (
  'deal',
  'contract',
  'data_room_folder',
  'checklist'
);

create type public.participant_permission as enum (
  'view',
  'comment',
  'suggest',
  'edit',
  'sign'
);

create type public.approval_subject as enum (
  'stage_move',
  'loi',
  'apa',
  'schedule',
  'participant_change'
);

create type public.approval_decision as enum (
  'approved',
  'declined'
);

create type public.checklist_outcome as enum (
  'accepted',
  'follow_up',
  'rejected'
);

-- ===== schemas/19-deal-box.sql =====
-- Account-scoped acquisition criteria and broker summary. Versions are kept:
-- a new version is a new row rather than an overwrite.

create table if not exists public.deal_box (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  criteria_json jsonb not null default '{}'::jsonb,
  broker_summary text,
  min_dscr numeric,
  required_personal_cash_flow numeric,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, version)
);

alter table public.deal_box enable row level security;

create index ix_deal_box_account on public.deal_box (account_id);

revoke all on public.deal_box from authenticated, service_role;
grant select, insert, update, delete on public.deal_box to authenticated;
grant select, insert, update, delete on public.deal_box to service_role;

create trigger deal_box_timestamps
  before insert or update on public.deal_box
  for each row execute function public.set_timestamps();

create trigger deal_box_user_tracking
  before insert or update on public.deal_box
  for each row execute function public.set_user_tracking();

create policy deal_box_read on public.deal_box
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_box_insert on public.deal_box
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_box_update on public.deal_box
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_box_delete on public.deal_box
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/20-firm.sql =====
-- Account-scoped firms sourced into the pipeline. website is the dedupe key
-- within an account. status drives the sourcing state machine.

create table if not exists public.firm (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name varchar(255) not null,
  industry text,
  city text,
  state text,
  website text,
  employee_band text,
  established_year int,
  owner_name text,
  owner_age_estimate int,
  service_mix_json jsonb not null default '{}'::jsonb,
  icp_score numeric,
  source text,
  source_url text,
  imported_at timestamptz not null default now(),
  status text not null default 'imported' check (
    status in ('imported', 'enriched', 'scored', 'contacted', 'responded', 'deal_created', 'disqualified')
  ),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, website)
);

alter table public.firm enable row level security;

create index ix_firm_account_status on public.firm (account_id, status);

revoke all on public.firm from authenticated, service_role;
grant select, insert, update, delete on public.firm to authenticated;
grant select, insert, update, delete on public.firm to service_role;

create trigger firm_timestamps
  before insert or update on public.firm
  for each row execute function public.set_timestamps();

create trigger firm_user_tracking
  before insert or update on public.firm
  for each row execute function public.set_user_tracking();

create policy firm_read on public.firm
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy firm_insert on public.firm
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy firm_update on public.firm
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy firm_delete on public.firm
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/21-contact.sql =====
-- Account-scoped contacts, optionally attached to a firm.

create table if not exists public.contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid references public.firm (id) on delete set null,
  name varchar(255) not null,
  email varchar(320),
  phone text,
  kind text not null default 'other',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.contact enable row level security;

create index ix_contact_account on public.contact (account_id);
create index ix_contact_firm on public.contact (firm_id);

revoke all on public.contact from authenticated, service_role;
grant select, insert, update, delete on public.contact to authenticated;
grant select, insert, update, delete on public.contact to service_role;

create trigger contact_timestamps
  before insert or update on public.contact
  for each row execute function public.set_timestamps();

create trigger contact_user_tracking
  before insert or update on public.contact
  for each row execute function public.set_user_tracking();

create policy contact_read on public.contact
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy contact_insert on public.contact
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contact_update on public.contact
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contact_delete on public.contact
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/22-deal.sql =====
-- A deal. Account-scoped for internal members; per-deal access for external
-- parties is granted through deal_participant. owner_user_id is the deal owner.
-- Policies live in 24-deal-access.sql because they depend on has_deal_permission.

create table if not exists public.deal (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid references public.firm (id) on delete set null,
  owner_user_id uuid references auth.users,
  description text,
  asking_price numeric,
  revenue_ttm numeric,
  sde_ttm numeric,
  ebitda_ttm numeric,
  source public.deal_source not null default 'manual',
  stage text not null default 'sourcing',
  notes text,
  deal_box_version int,
  close_date date,
  broker_contact_id uuid references public.contact (id) on delete set null,
  outcome_reason text,
  -- resolution is the structured lifecycle outcome, set by deal.resolved; a
  -- resolved deal keeps its stage. resolution_reason is the structured reason,
  -- validated by the feature layer. The legacy free-text outcome_reason stays
  -- for the comps/activity_pool path and is not superseded here.
  resolution text,
  resolution_reason text,
  listing_status text not null default 'active' check (listing_status in ('active', 'pulled', 'sold')),
  archived_at timestamptz,
  stage_changed_at timestamptz,
  discovered_at timestamptz,
  earnings_basis text not null default 'sde' check (earnings_basis in ('sde', 'ebitda')),
  open_to_partnership boolean not null default false,
  duplicate_of uuid references public.deal (id) on delete set null,
  capture_method text,
  source_url text,
  search_tsv tsvector,
  created_by_kind text,
  created_by_ref text,
  created_by_via text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal enable row level security;

create index ix_deal_account_stage on public.deal (account_id, stage);
create index ix_deal_firm on public.deal (firm_id);
create index ix_deal_owner on public.deal (owner_user_id);

-- List and search indexes for the deals list. The list query is always
-- account-scoped, so the range indexes lead with account_id to stay useful
-- under the account filter. pg_trgm (created in 00-privileges.sql) backs the
-- title (description) prefix and fuzzy match through gin_trgm_ops.
create index ix_deal_search_tsv on public.deal using gin (search_tsv);
create index ix_deal_description_trgm on public.deal using gin (description extensions.gin_trgm_ops);
create index ix_deal_account_archived_stage_updated on public.deal (account_id, archived_at, stage, updated_at desc);
create index ix_deal_account_asking_price on public.deal (account_id, asking_price);
create index ix_deal_account_revenue_ttm on public.deal (account_id, revenue_ttm);
create index ix_deal_account_sde_ttm on public.deal (account_id, sde_ttm);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal from authenticated, service_role;
grant select on public.deal to authenticated;
grant select on public.deal to service_role;

create trigger deal_timestamps
  before insert or update on public.deal
  for each row execute function public.set_timestamps();

-- search_tsv is kept in a BEFORE trigger rather than a stored generated column:
-- to_tsvector is only stable, not immutable, so a generated column rejects it.
-- The trigger fires on the projector's writes even though deal is DML-revoked,
-- the same way deal_timestamps does. Only deal-local text is indexed here;
-- industry, location and broker text live on deal_profile and contact (report).
create or replace function public.deal_search_tsv()
  returns trigger
  set search_path = '' as $$
begin
  new.search_tsv := to_tsvector('english', coalesce(new.description, ''));
  return new;
end;
$$ language plpgsql;

create trigger deal_search_tsv
  before insert or update on public.deal
  for each row execute function public.deal_search_tsv();

-- ===== schemas/23-deal-participant.sql =====
-- Per-deal access grants for internal and external parties. A grant scoped
-- narrower than the whole deal names the scoped object in scope_id.
-- Policies live in 24-deal-access.sql because they depend on has_deal_permission.

create table if not exists public.deal_participant (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  party public.participant_party not null,
  role text,
  scope public.participant_scope not null default 'deal',
  scope_id uuid,
  permission public.participant_permission not null default 'view',
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_participant enable row level security;

create index ix_deal_participant_deal on public.deal_participant (deal_id);
create index ix_deal_participant_user on public.deal_participant (user_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_participant from authenticated, service_role;
grant select on public.deal_participant to authenticated;
grant select on public.deal_participant to service_role;

create trigger deal_participant_timestamps
  before insert or update on public.deal_participant
  for each row execute function public.set_timestamps();

-- ===== schemas/24-deal-access.sql =====
-- Deal-scoped access. A caller reaches a deal either as an internal member of
-- the deal's account holding the tenant permission, or through an unexpired
-- deal_participant grant. Internal read visibility is account membership;
-- the participant branch is what lets external parties reach a single deal.

create or replace function public.has_deal_permission(deal_id uuid, permission text)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal d
    where d.id = has_deal_permission.deal_id
      and public.has_permission((select auth.uid()), d.account_id, has_deal_permission.permission::public.app_permissions)
  )
  or exists (
    select 1 from public.deal_participant dp
    where dp.deal_id = has_deal_permission.deal_id
      and dp.user_id = (select auth.uid())
      and (dp.expires_at is null or dp.expires_at > now())
  );
$$;

grant execute on function public.has_deal_permission(uuid, text) to authenticated, service_role;

create policy deal_read on public.deal
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(id, 'deals.manage')
  );

create policy deal_insert on public.deal
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.create'));

create policy deal_update on public.deal
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_delete on public.deal
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_participant_read on public.deal_participant
  for select to authenticated
  using (
    public.has_role_on_account((select account_id from public.deal where id = deal_id))
    or public.has_deal_permission(deal_id, 'participants.manage')
  );

create policy deal_participant_insert on public.deal_participant
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));

create policy deal_participant_update on public.deal_participant
  for update to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'))
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));

create policy deal_participant_delete on public.deal_participant
  for delete to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));

-- ===== schemas/25-checklist-item.sql =====
-- Diligence checklist items on a deal. status is the shared checklist_status.

create table if not exists public.checklist_item (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  category text,
  title varchar(500) not null,
  owner_user_id uuid references auth.users,
  due_at timestamptz,
  status public.checklist_status not null default 'not_started',
  requested_at timestamptz,
  received_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users,
  outcome public.checklist_outcome,
  due_offset_days int,
  artifact_type text,
  artifact_id uuid,
  kind text check (kind in ('offer', 'diligence', 'closing', 'post_close')),
  owner_role text check (owner_role in ('buyer', 'attorney', 'cpa', 'broker', 'seller', 'sales_team')),
  importance text check (importance in ('required', 'nice_to_have', 'na')),
  answer text,
  offer_term_key text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  removed_at timestamptz
);

alter table public.checklist_item enable row level security;

create index ix_checklist_item_deal_status on public.checklist_item (deal_id, status);
create index ix_checklist_item_account on public.checklist_item (account_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.checklist_item from authenticated, service_role;
grant select on public.checklist_item to authenticated;
grant select on public.checklist_item to service_role;

create trigger checklist_item_timestamps
  before insert or update on public.checklist_item
  for each row execute function public.set_timestamps();

create policy checklist_item_read on public.checklist_item
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'checklists.manage')
    )
  );

create policy checklist_item_insert on public.checklist_item
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_item_update on public.checklist_item
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_item_delete on public.checklist_item
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

-- ===== schemas/26-approval.sql =====
-- Approval requests raised against a deal and their decision.

create table if not exists public.approval (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  subject public.approval_subject not null,
  requested_by uuid not null default auth.uid() references auth.users,
  decided_by uuid references auth.users,
  decision public.approval_decision,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.approval enable row level security;

create index ix_approval_deal on public.approval (deal_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.approval from authenticated, service_role;
grant select on public.approval to authenticated;
grant select on public.approval to service_role;

create policy approval_read on public.approval
  for select to authenticated
  using (
    public.has_role_on_account((select account_id from public.deal where id = deal_id))
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy approval_insert on public.approval
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));

create policy approval_update on public.approval
  for update to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'))
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));

create policy approval_delete on public.approval
  for delete to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));

-- ===== schemas/28-api-key.sql =====
-- Account API keys for the MCP/REST surface. Only the sha256 hash is stored;
-- the raw key exists once, at issue time, and is never persisted. key_prefix is
-- the leading characters kept for display and lookup.

create table if not exists public.api_key (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name varchar(255) not null,
  key_hash bytea not null,
  key_prefix text not null,
  scopes text[] not null default '{}',
  created_by uuid references auth.users,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.api_key enable row level security;

create index ix_api_key_account on public.api_key (account_id);
create index ix_api_key_prefix on public.api_key (key_prefix);

revoke all on public.api_key from authenticated, service_role;
-- key_hash is intentionally excluded from the authenticated select grant so a
-- client can list and revoke keys without ever reading the stored hash.
grant select (id, account_id, name, key_prefix, scopes, created_by, last_used_at, revoked_at, created_at)
  on public.api_key to authenticated;
grant update (name, scopes, revoked_at) on public.api_key to authenticated;
grant select, insert, update, delete on public.api_key to service_role;

create policy api_key_read on public.api_key
  for select to authenticated
  using (
    public.is_account_owner(account_id)
    or public.has_permission((select auth.uid()), account_id, 'members.manage')
  );

create policy api_key_update on public.api_key
  for update to authenticated
  using (
    public.is_account_owner(account_id)
    or public.has_permission((select auth.uid()), account_id, 'members.manage')
  )
  with check (
    public.is_account_owner(account_id)
    or public.has_permission((select auth.uid()), account_id, 'members.manage')
  );

-- Match a presented raw key against its stored hash, stamp last_used_at, and
-- return the owning account. Runs as definer so the caller never needs read
-- access to key_hash.
create or replace function public.verify_api_key(prefix text, raw text)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  matched_account uuid;
begin
  update public.api_key
    set last_used_at = now()
    where key_prefix = verify_api_key.prefix
      and key_hash = extensions.digest(verify_api_key.raw, 'sha256')
      and revoked_at is null
    returning account_id into matched_account;
  return matched_account;
end;
$$;

grant execute on function public.verify_api_key(text, text) to service_role;

-- ===== schemas/29-deal-roles-seed.sql =====
-- Per-tenant deal roles layered onto owner/admin/member. External roles
-- (external_counsel, seller, broker) carry no tenant permissions: they reach a
-- deal only through a deal_participant grant. deal_owner is not a tenant role;
-- it is deal.owner_user_id plus a participant row.

insert into public.roles (name, hierarchy_level) values
  ('deal_lead', 4),
  ('analyst', 5),
  ('counsel', 6),
  ('external_counsel', 7),
  ('seller', 8),
  ('broker', 9),
  ('viewer', 10);

-- owner and admin keep full deal control alongside their existing permissions.
insert into public.role_permissions (role, permission) values
  ('owner', 'deals.create'),
  ('owner', 'deals.manage'),
  ('owner', 'checklists.manage'),
  ('owner', 'participants.manage'),
  ('owner', 'buyer_profile.manage'),
  ('admin', 'deals.create'),
  ('admin', 'deals.manage'),
  ('admin', 'checklists.manage'),
  ('admin', 'participants.manage'),
  ('admin', 'buyer_profile.manage'),
  ('deal_lead', 'deals.create'),
  ('deal_lead', 'deals.manage'),
  ('deal_lead', 'checklists.manage'),
  ('deal_lead', 'participants.manage'),
  ('analyst', 'deals.create'),
  ('analyst', 'checklists.manage'),
  ('counsel', 'checklists.manage');

-- ===== schemas/30-buyer-profile.sql =====
-- Account-scoped buyer marketing profile. Versions are kept: a new version is a
-- new row rather than an overwrite, so the current profile is the max version.
-- sensitive_json holds opt-in fields (credit score, pre-approval, phone) and is
-- only populated when include_sensitive; that gating is enforced by the feature
-- layer, not the database.

create table if not exists public.buyer_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  display_name text,
  headline text,
  about text,
  expertise_json jsonb,
  financing_json jsonb,
  contact_json jsonb,
  target_statement text,
  motivation text,
  interested_json jsonb,
  not_interested_json jsonb,
  value_proposition text,
  experience text,
  photo_path text,
  include_sensitive boolean not null default false,
  sensitive_json jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, version)
);

alter table public.buyer_profile enable row level security;

create index ix_buyer_profile_account on public.buyer_profile (account_id);

revoke all on public.buyer_profile from authenticated, service_role;
grant select, insert, update, delete on public.buyer_profile to authenticated;
grant select, insert, update, delete on public.buyer_profile to service_role;

create trigger buyer_profile_timestamps
  before insert or update on public.buyer_profile
  for each row execute function public.set_timestamps();

create trigger buyer_profile_user_tracking
  before insert or update on public.buyer_profile
  for each row execute function public.set_user_tracking();

create policy buyer_profile_read on public.buyer_profile
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy buyer_profile_insert on public.buyer_profile
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'buyer_profile.manage'));

create policy buyer_profile_update on public.buyer_profile
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'buyer_profile.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'buyer_profile.manage'));

create policy buyer_profile_delete on public.buyer_profile
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'buyer_profile.manage'));

-- Latest version row for an account. Runs as the invoker, so buyer_profile RLS
-- decides what the caller can see.
create or replace function public.current_buyer_profile(account_id uuid)
  returns public.buyer_profile
  language sql
  stable
  set search_path = '' as $$
  select bp.*
  from public.buyer_profile bp
  where bp.account_id = current_buyer_profile.account_id
  order by bp.version desc
  limit 1;
$$;

grant execute on function public.current_buyer_profile(uuid) to authenticated, service_role;

-- ===== schemas/31-pipeline-stage.sql =====
-- Account-scoped deal pipeline stages. Every account owns its own ordered set,
-- seeded from the default 9-stage pipeline at account creation. Renaming,
-- reordering, and adding stages are plain updates and inserts; deal.stage is
-- validated against this table. Terminality is no longer a stage: a deal keeps
-- its stage and carries resolution separately (see deal.resolution), so every
-- seeded stage is non-terminal.

create table if not exists public.pipeline_stage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null,
  is_terminal boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, key),
  unique (account_id, sort_order)
);

alter table public.pipeline_stage enable row level security;

create index ix_pipeline_stage_account on public.pipeline_stage (account_id);

revoke all on public.pipeline_stage from authenticated, service_role;
grant select, insert, update, delete on public.pipeline_stage to authenticated;
grant select, insert, update, delete on public.pipeline_stage to service_role;

create trigger pipeline_stage_timestamps
  before insert or update on public.pipeline_stage
  for each row execute function public.set_timestamps();

create trigger pipeline_stage_user_tracking
  before insert or update on public.pipeline_stage
  for each row execute function public.set_user_tracking();

create policy pipeline_stage_read on public.pipeline_stage
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy pipeline_stage_insert on public.pipeline_stage
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy pipeline_stage_update on public.pipeline_stage
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy pipeline_stage_delete on public.pipeline_stage
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- Populate an account with the default ordered pipeline. Called from every
-- account-provisioning path so a deal can always reference a valid stage.
create or replace function public.seed_default_pipeline_stages(p_account_id uuid)
  returns void
  language sql
  security definer
  set search_path = '' as $$
  insert into public.pipeline_stage (account_id, key, label, sort_order, is_terminal)
  values
    (p_account_id, 'sourcing', 'Sourcing', 1, false),
    (p_account_id, 'pre_nda', 'Pre-NDA', 2, false),
    (p_account_id, 'nda_signed', 'NDA Signed', 3, false),
    (p_account_id, 'loi_submitted', 'LOI Submitted', 4, false),
    (p_account_id, 'loi_accepted', 'LOI Accepted', 5, false),
    (p_account_id, 'pa_submitted', 'PA Submitted', 6, false),
    (p_account_id, 'pa_accepted', 'PA Accepted', 7, false),
    (p_account_id, 'announcement', 'Announcement', 8, false),
    (p_account_id, 'integration', 'Integration', 9, false);
$$;

grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;

-- A deal's stage must be one of its own account's stages. NO ACTION (the
-- default) defers the check to statement end, so an account cascade delete that
-- removes both the deal and its stages in one statement stays satisfiable.
alter table public.deal
  add constraint deal_stage_pipeline_stage_fk
  foreign key (account_id, stage) references public.pipeline_stage (account_id, key);

-- ===== schemas/32-integration-connection.sql =====
-- Third-party integration connections managed through Nango. A row is either
-- account-level (user_id null) for tenant integrations like SendGrid or a CRM,
-- or user-level (user_id set) for a member's mailbox or calendar. The app only
-- ever stores the nango_connection_id; third-party tokens live in Nango.

create table if not exists public.integration_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid references auth.users on delete cascade,
  provider text not null,
  nango_connection_id text not null,
  scopes text[],
  status text,
  connected_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.integration_connection enable row level security;

create index ix_integration_connection_account on public.integration_connection (account_id);

revoke all on public.integration_connection from authenticated, service_role;
grant select, insert, update, delete on public.integration_connection to authenticated;
grant select, insert, update, delete on public.integration_connection to service_role;

create trigger integration_connection_timestamps
  before insert or update on public.integration_connection
  for each row execute function public.set_timestamps();

create policy integration_connection_read on public.integration_connection
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy integration_connection_insert on public.integration_connection
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy integration_connection_update on public.integration_connection
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy integration_connection_delete on public.integration_connection
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- ===== schemas/33-data-source.sql =====
-- Account-scoped deal sourcing inputs. A data_source describes where inbound
-- deals come from; config_json holds the source-specific settings.

create table if not exists public.data_source (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  type text not null check (type in ('csv', 'clay', 'state_board', 'listing_email', 'manual')),
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.data_source enable row level security;

create index ix_data_source_account on public.data_source (account_id);

revoke all on public.data_source from authenticated, service_role;
grant select, insert, update, delete on public.data_source to authenticated;
grant select, insert, update, delete on public.data_source to service_role;

create trigger data_source_timestamps
  before insert or update on public.data_source
  for each row execute function public.set_timestamps();

create policy data_source_read on public.data_source
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy data_source_insert on public.data_source
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy data_source_update on public.data_source
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy data_source_delete on public.data_source
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/34-broker-intake.sql =====
-- Broker-submitted deal intakes, typically arriving through a magic-link form.
-- Internal members read and manage them with deals.manage; the unauthenticated
-- magic-link submission path is served separately by the service role (an edge
-- function or signed request), which holds full grants here. That auth flow is
-- a separate lane and is not built in the database.

create type public.broker_intake_status as enum ('new', 'accepted', 'rejected');

create table if not exists public.broker_intake (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_name text not null,
  teaser text,
  asking_price numeric,
  nda_required boolean not null default false,
  submitted_by_contact_id uuid references public.contact (id) on delete set null,
  status public.broker_intake_status not null default 'new',
  firm_id uuid references public.firm (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.broker_intake enable row level security;

create index ix_broker_intake_account_status on public.broker_intake (account_id, status);

revoke all on public.broker_intake from authenticated, service_role;
grant select, insert, update, delete on public.broker_intake to authenticated;
grant select, insert, update, delete on public.broker_intake to service_role;

create policy broker_intake_read on public.broker_intake
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy broker_intake_insert on public.broker_intake
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy broker_intake_update on public.broker_intake
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy broker_intake_delete on public.broker_intake
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/35-document-template.sql =====
-- Account-scoped document templates (the .docx lives at docx_path in storage).
-- Managed with deals.manage. Field definitions live in template_field.

create table if not exists public.document_template (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  type text not null check (type in ('nda', 'loi', 'apa', 'data_request', 'letter')),
  docx_path text,
  version int not null default 1,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.document_template enable row level security;

create index ix_document_template_account on public.document_template (account_id);

revoke all on public.document_template from authenticated, service_role;
grant select, insert, update, delete on public.document_template to authenticated;
grant select, insert, update, delete on public.document_template to service_role;

create trigger document_template_timestamps
  before insert or update on public.document_template
  for each row execute function public.set_timestamps();

create policy document_template_read on public.document_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy document_template_insert on public.document_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_template_update on public.document_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_template_delete on public.document_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/36-template-field.sql =====
-- Merge-field definitions for a document_template. source says where the value
-- comes from (a deal/firm/account column, or manual entry) and source_path is
-- the path into that source. Access is inherited from the owning template.

create table if not exists public.template_field (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_template (id) on delete cascade,
  key text not null,
  label text,
  type text check (type in ('text', 'currency', 'date', 'percent', 'list')),
  source text check (source in ('deal', 'firm', 'account', 'manual')),
  source_path text,
  format text,
  required boolean not null default false,
  sort_order int
);

alter table public.template_field enable row level security;

create index ix_template_field_template on public.template_field (template_id);

revoke all on public.template_field from authenticated, service_role;
grant select, insert, update, delete on public.template_field to authenticated;
grant select, insert, update, delete on public.template_field to service_role;

create policy template_field_read on public.template_field
  for select to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id and public.has_role_on_account(t.account_id)
    )
  );

create policy template_field_insert on public.template_field
  for insert to authenticated
  with check (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

create policy template_field_update on public.template_field
  for update to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  )
  with check (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

create policy template_field_delete on public.template_field
  for delete to authenticated
  using (
    exists (
      select 1 from public.document_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'deals.manage')
    )
  );

-- ===== schemas/37-generated-document.sql =====
-- A document produced from a template for a specific deal. template_version
-- records the template revision used so the output stays reproducible even if
-- the template later changes. Deal-scoped: reachable by internal members and by
-- external parties holding a participant grant on the deal.

create table if not exists public.generated_document (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  template_id uuid references public.document_template (id) on delete set null,
  template_version int,
  deal_id uuid not null references public.deal (id) on delete cascade,
  values_json jsonb not null default '{}'::jsonb,
  docx_path text,
  pdf_path text,
  contract_id uuid,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.generated_document enable row level security;

create index ix_generated_document_deal on public.generated_document (deal_id);
create index ix_generated_document_account on public.generated_document (account_id);

revoke all on public.generated_document from authenticated, service_role;
grant select, insert, update, delete on public.generated_document to authenticated;
grant select, insert, update, delete on public.generated_document to service_role;

create policy generated_document_read on public.generated_document
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy generated_document_insert on public.generated_document
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy generated_document_update on public.generated_document
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy generated_document_delete on public.generated_document
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/38-document-share.sql =====
-- A share of a generated_document with a recipient, tracking send/view/expiry
-- and the external signing workflow. Deal-scoped through the shared document's
-- deal; the recipient may also read their own share row.

create table if not exists public.document_share (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  generated_document_id uuid not null references public.generated_document (id) on delete cascade,
  recipient_user_id uuid references auth.users on delete cascade,
  permission text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  expires_at timestamptz,
  workflow_id text,
  created_at timestamptz not null default now()
);

alter table public.document_share enable row level security;

create index ix_document_share_document on public.document_share (generated_document_id);
create index ix_document_share_account on public.document_share (account_id);

revoke all on public.document_share from authenticated, service_role;
grant select, insert, update, delete on public.document_share to authenticated;
grant select, insert, update, delete on public.document_share to service_role;

create policy document_share_read on public.document_share
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or recipient_user_id = (select auth.uid())
    or exists (
      select 1 from public.generated_document g
      where g.id = generated_document_id
        and public.has_deal_permission(g.deal_id, 'deals.manage')
    )
  );

create policy document_share_insert on public.document_share
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_share_update on public.document_share
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_share_delete on public.document_share
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/39-dr-folder.sql =====
-- Data room folders. Each deal owns a folder tree; parent_id nests them and is
-- null at the root. Deal-scoped so external parties on the deal can browse it.

create table if not exists public.dr_folder (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  parent_id uuid references public.dr_folder (id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.dr_folder enable row level security;

create index ix_dr_folder_deal on public.dr_folder (deal_id);
create index ix_dr_folder_parent on public.dr_folder (parent_id);

revoke all on public.dr_folder from authenticated, service_role;
grant select, insert, update, delete on public.dr_folder to authenticated;
grant select, insert, update, delete on public.dr_folder to service_role;

create trigger dr_folder_timestamps
  before insert or update on public.dr_folder
  for each row execute function public.set_timestamps();

create policy dr_folder_read on public.dr_folder
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy dr_folder_insert on public.dr_folder
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_folder_update on public.dr_folder
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_folder_delete on public.dr_folder
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/40-dr-document.sql =====
-- A file in a data room folder. Re-uploading a file with the same name is a new
-- row with a higher version; the database allows it and the app decides how to
-- present versions. checklist_item_id links a document to the diligence item it
-- satisfies. Deal-scoped.

create table if not exists public.dr_document (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  storage_path text not null,
  version int not null default 1,
  uploaded_by uuid references auth.users default auth.uid(),
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  removed_at timestamptz
);

alter table public.dr_document enable row level security;

create index ix_dr_document_deal on public.dr_document (deal_id);
create index ix_dr_document_folder on public.dr_document (folder_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.dr_document from authenticated, service_role;
grant select on public.dr_document to authenticated;
grant select on public.dr_document to service_role;

create trigger dr_document_timestamps
  before insert or update on public.dr_document
  for each row execute function public.set_timestamps();

create policy dr_document_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'deals.manage')
    )
  );

create policy dr_document_insert on public.dr_document
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_document_update on public.dr_document
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_document_delete on public.dr_document
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/41-notification-triggers.sql =====
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

-- ===== schemas/42-trial.sql =====
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

-- ===== schemas/43-workbook-template.sql =====
-- Installable workflow definitions. A platform template (account_id null) ships
-- with the product and is readable by every authenticated user; a tenant
-- template belongs to one account. scope and account_id are kept in lockstep.

create table if not exists public.workbook_template (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'tenant')),
  account_id uuid references public.accounts (id) on delete cascade,
  name text not null,
  workflow_type text not null,
  config_schema jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz,
  constraint workbook_template_scope_account check (
    (scope = 'platform' and account_id is null)
    or (scope = 'tenant' and account_id is not null)
  )
);

alter table public.workbook_template enable row level security;

create index ix_workbook_template_account on public.workbook_template (account_id);

revoke all on public.workbook_template from authenticated, service_role;
grant select, insert, update, delete on public.workbook_template to authenticated;
grant select, insert, update, delete on public.workbook_template to service_role;

create trigger workbook_template_timestamps
  before insert or update on public.workbook_template
  for each row execute function public.set_timestamps();

-- Platform templates are global reference data; tenant templates are account
-- scoped. Mutations always require a concrete account grant, so platform
-- templates are writable only by the service role.
create policy workbook_template_read on public.workbook_template
  for select to authenticated
  using (account_id is null or public.has_role_on_account(account_id));

create policy workbook_template_insert on public.workbook_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_template_update on public.workbook_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_template_delete on public.workbook_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/44-workbook.sql =====
-- An account's installed workbook: a template plus the account's own config and
-- run scheduling. Account-scoped; managed with deals.manage.

create table if not exists public.workbook (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workbook_template (id),
  account_id uuid not null references public.accounts (id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  status text,
  next_run_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.workbook enable row level security;

create index ix_workbook_account on public.workbook (account_id);
create index ix_workbook_template on public.workbook (template_id);

revoke all on public.workbook from authenticated, service_role;
grant select, insert, update, delete on public.workbook to authenticated;
grant select, insert, update, delete on public.workbook to service_role;

create trigger workbook_timestamps
  before insert or update on public.workbook
  for each row execute function public.set_timestamps();

create policy workbook_read on public.workbook
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workbook_insert on public.workbook
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_update on public.workbook
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_delete on public.workbook
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/45-workbook-run.sql =====
-- One execution of a workbook. Rows are produced by the background runner
-- (service role); account members read them but never write them directly.

create table if not exists public.workbook_run (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbook (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_total int,
  items_done int,
  exceptions jsonb,
  status text,
  created_at timestamptz not null default now()
);

alter table public.workbook_run enable row level security;

create index ix_workbook_run_account on public.workbook_run (account_id);
create index ix_workbook_run_workbook on public.workbook_run (workbook_id);

revoke all on public.workbook_run from authenticated, service_role;
grant select on public.workbook_run to authenticated;
grant select, insert, update, delete on public.workbook_run to service_role;

create policy workbook_run_read on public.workbook_run
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- ===== schemas/46-checklist-template.sql =====
-- Reusable diligence checklist templates. A template holds ordered items that
-- are copied into a deal's checklist_item rows when applied. Account-scoped;
-- managed with checklists.manage. Items inherit access from their template.

create table if not exists public.checklist_template (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  category text,
  kind text check (kind in ('offer', 'diligence', 'closing', 'post_close')),
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.checklist_template enable row level security;

create index ix_checklist_template_account on public.checklist_template (account_id);

revoke all on public.checklist_template from authenticated, service_role;
grant select, insert, update, delete on public.checklist_template to authenticated;
grant select, insert, update, delete on public.checklist_template to service_role;

create trigger checklist_template_timestamps
  before insert or update on public.checklist_template
  for each row execute function public.set_timestamps();

create policy checklist_template_read on public.checklist_template
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy checklist_template_insert on public.checklist_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_template_update on public.checklist_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_template_delete on public.checklist_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create table if not exists public.checklist_template_item (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_template (id) on delete cascade,
  category text,
  title varchar(500) not null,
  priority int not null default 0,
  deal_killer boolean not null default false,
  due_offset_days int,
  owner_role text check (owner_role in ('buyer', 'attorney', 'cpa', 'broker', 'seller', 'sales_team')),
  importance text check (importance in ('required', 'nice_to_have', 'na')),
  offer_term_key text,
  sort_order int not null default 0
);

alter table public.checklist_template_item enable row level security;

create index ix_checklist_template_item_template on public.checklist_template_item (template_id);

revoke all on public.checklist_template_item from authenticated, service_role;
grant select, insert, update, delete on public.checklist_template_item to authenticated;
grant select, insert, update, delete on public.checklist_template_item to service_role;

create policy checklist_template_item_read on public.checklist_template_item
  for select to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id and public.has_role_on_account(t.account_id)
    )
  );

create policy checklist_template_item_insert on public.checklist_template_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );

create policy checklist_template_item_update on public.checklist_template_item
  for update to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  )
  with check (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );

create policy checklist_template_item_delete on public.checklist_template_item
  for delete to authenticated
  using (
    exists (
      select 1 from public.checklist_template t
      where t.id = template_id
        and public.has_permission((select auth.uid()), t.account_id, 'checklists.manage')
    )
  );

-- ===== schemas/47-diligence-schedule.sql =====
-- A diligence schedule for a deal: the plan from start to a target APA date,
-- broken into weeks (schedule_week). Deal-scoped; managed with checklists.manage.

create table if not exists public.diligence_schedule (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  start_date date,
  target_apa_date date,
  template_id uuid,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'active', 'done')),
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.diligence_schedule enable row level security;

create index ix_diligence_schedule_deal on public.diligence_schedule (deal_id);
create index ix_diligence_schedule_account on public.diligence_schedule (account_id);

revoke all on public.diligence_schedule from authenticated, service_role;
grant select, insert, update, delete on public.diligence_schedule to authenticated;
grant select, insert, update, delete on public.diligence_schedule to service_role;

create trigger diligence_schedule_timestamps
  before insert or update on public.diligence_schedule
  for each row execute function public.set_timestamps();

create policy diligence_schedule_read on public.diligence_schedule
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
  );

create policy diligence_schedule_insert on public.diligence_schedule
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy diligence_schedule_update on public.diligence_schedule
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy diligence_schedule_delete on public.diligence_schedule
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

-- ===== schemas/48-schedule-week.sql =====
-- One week of a diligence_schedule. Deal-scoped through the parent schedule's
-- deal; managed with checklists.manage. This file also extends checklist_item
-- with prioritization and a link back to the week an item belongs to, kept here
-- so the schedule_week table exists before the foreign key references it.

create table if not exists public.schedule_week (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.diligence_schedule (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  week_no int,
  starts_on date,
  theme text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.schedule_week enable row level security;

create index ix_schedule_week_schedule on public.schedule_week (schedule_id);
create index ix_schedule_week_account on public.schedule_week (account_id);

revoke all on public.schedule_week from authenticated, service_role;
grant select, insert, update, delete on public.schedule_week to authenticated;
grant select, insert, update, delete on public.schedule_week to service_role;

create trigger schedule_week_timestamps
  before insert or update on public.schedule_week
  for each row execute function public.set_timestamps();

create policy schedule_week_read on public.schedule_week
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select s.deal_id from public.diligence_schedule s where s.id = schedule_id),
      'checklists.manage'
    )
  );

create policy schedule_week_insert on public.schedule_week
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy schedule_week_update on public.schedule_week
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy schedule_week_delete on public.schedule_week
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

alter table public.checklist_item
  add column priority int not null default 0,
  add column deal_killer boolean not null default false,
  add column schedule_week_id uuid references public.schedule_week (id) on delete set null;

-- ===== schemas/49-seller-question.sql =====
-- Questions put to the seller during diligence, optionally tied to a schedule
-- week. Deal-scoped; managed with checklists.manage.

create table if not exists public.seller_question (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  schedule_week_id uuid references public.schedule_week (id) on delete set null,
  question text not null,
  answer text,
  status public.checklist_status not null default 'not_started',
  answered_at timestamptz,
  asked_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.seller_question enable row level security;

create index ix_seller_question_deal on public.seller_question (deal_id);
create index ix_seller_question_account on public.seller_question (account_id);

revoke all on public.seller_question from authenticated, service_role;
grant select, insert, update, delete on public.seller_question to authenticated;
grant select, insert, update, delete on public.seller_question to service_role;

create trigger seller_question_timestamps
  before insert or update on public.seller_question
  for each row execute function public.set_timestamps();

create policy seller_question_read on public.seller_question
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
  );

create policy seller_question_insert on public.seller_question
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy seller_question_update on public.seller_question
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy seller_question_delete on public.seller_question
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

-- ===== schemas/50-contract.sql =====
-- LOI/APA workspace for a deal. A contract holds its versions (contract_version)
-- and points at the current one. Deal-scoped; managed with deals.manage. This
-- file also wires generated_document.contract_id to reference a contract now
-- that the table exists.

create table if not exists public.contract (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  type text not null check (type in ('loi', 'apa')),
  status text,
  current_version int,
  -- The offer_version this contract was generated from, pinned at contract.created
  -- so the LOI/APA keeps its link back to the accepted offer. A plain uuid, like
  -- deal_financials.source_calc_version_id: the offer_version is written in the same
  -- event batch, so no foreign key is enforced here.
  source_offer_version_id uuid,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.contract enable row level security;

create index ix_contract_deal on public.contract (deal_id);
create index ix_contract_account on public.contract (account_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.contract from authenticated, service_role;
grant select on public.contract to authenticated;
grant select on public.contract to service_role;

create trigger contract_timestamps
  before insert or update on public.contract
  for each row execute function public.set_timestamps();

create policy contract_read on public.contract
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy contract_insert on public.contract
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_update on public.contract
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_delete on public.contract
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

alter table public.generated_document
  add constraint generated_document_contract_id_fk
  foreign key (contract_id) references public.contract (id) on delete set null;

-- ===== schemas/51-contract-version.sql =====
-- An immutable revision of a contract. version is unique within a contract.
-- Deal-scoped through the parent contract's deal; managed with deals.manage.

create table if not exists public.contract_version (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  source text not null check (source in ('editor_save', 'upload', 'generated')),
  author_user_id uuid references auth.users,
  party text not null check (party in ('buyer', 'seller')),
  docx_path text,
  pdf_path text,
  change_summary text,
  is_signed boolean not null default false,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

alter table public.contract_version enable row level security;

create index ix_contract_version_contract on public.contract_version (contract_id);
create index ix_contract_version_account on public.contract_version (account_id);

revoke all on public.contract_version from authenticated, service_role;
grant select, insert, update, delete on public.contract_version to authenticated;
grant select, insert, update, delete on public.contract_version to service_role;

create policy contract_version_read on public.contract_version
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select c.deal_id from public.contract c where c.id = contract_id),
      'deals.manage'
    )
  );

create policy contract_version_insert on public.contract_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_update on public.contract_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_delete on public.contract_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/52-meeting-series.sql =====
-- A recurring meeting cadence for a deal (Stage 4). A meeting_series is the
-- template that individual meeting rows are scheduled from. Deal-scoped;
-- managed with deals.manage.

create table if not exists public.meeting_series (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  weekday int,
  time_of_day time,
  timezone text,
  duration_mins int,
  video_provider text,
  attendees jsonb not null default '[]'::jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.meeting_series enable row level security;

create index ix_meeting_series_deal on public.meeting_series (deal_id);
create index ix_meeting_series_account on public.meeting_series (account_id);

revoke all on public.meeting_series from authenticated, service_role;
grant select, insert, update, delete on public.meeting_series to authenticated;
grant select, insert, update, delete on public.meeting_series to service_role;

create trigger meeting_series_timestamps
  before insert or update on public.meeting_series
  for each row execute function public.set_timestamps();

create trigger meeting_series_user_tracking
  before insert or update on public.meeting_series
  for each row execute function public.set_user_tracking();

create policy meeting_series_read on public.meeting_series
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy meeting_series_insert on public.meeting_series
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_series_update on public.meeting_series
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_series_delete on public.meeting_series
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/53-meeting.sql =====
-- A single meeting on a deal (Stage 4). A meeting may belong to a recurring
-- series (series_id) or stand alone. Deal-scoped; managed with deals.manage.

create type public.meeting_status as enum ('scheduled', 'held', 'skipped', 'cancelled');

create table if not exists public.meeting (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  series_id uuid references public.meeting_series (id) on delete set null,
  type text not null check (type in ('weekly', 'site_visit')),
  scheduled_at timestamptz,
  status public.meeting_status default 'scheduled',
  attendees jsonb not null default '[]'::jsonb,
  notes text,
  decisions text,
  recording_url text,
  video_url text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.meeting enable row level security;

create index ix_meeting_deal on public.meeting (deal_id);
create index ix_meeting_account on public.meeting (account_id);
create index ix_meeting_series on public.meeting (series_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.meeting from authenticated, service_role;
grant select on public.meeting to authenticated;
grant select on public.meeting to service_role;

create trigger meeting_timestamps
  before insert or update on public.meeting
  for each row execute function public.set_timestamps();

create policy meeting_read on public.meeting
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy meeting_insert on public.meeting
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_update on public.meeting
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_delete on public.meeting
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/54-meeting-action-item.sql =====
-- An action item captured on a meeting (Stage 4). It can be assigned to an
-- internal user or a seller, and optionally linked to the checklist item or
-- schedule week it advances. Deal-scoped; managed with deals.manage.

create table if not exists public.meeting_action_item (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meeting (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  description text not null,
  owner_user_id uuid references auth.users,
  owner_is_seller boolean not null default false,
  due_at timestamptz,
  status public.checklist_status not null default 'not_started',
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  schedule_week_id uuid references public.schedule_week (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  removed_at timestamptz
);

alter table public.meeting_action_item enable row level security;

create index ix_meeting_action_item_meeting on public.meeting_action_item (meeting_id);
create index ix_meeting_action_item_deal on public.meeting_action_item (deal_id);
create index ix_meeting_action_item_account on public.meeting_action_item (account_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.meeting_action_item from authenticated, service_role;
grant select on public.meeting_action_item to authenticated;
grant select on public.meeting_action_item to service_role;

create trigger meeting_action_item_timestamps
  before insert or update on public.meeting_action_item
  for each row execute function public.set_timestamps();

create policy meeting_action_item_read on public.meeting_action_item
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'deals.manage')
    )
  );

create policy meeting_action_item_insert on public.meeting_action_item
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_action_item_update on public.meeting_action_item
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_action_item_delete on public.meeting_action_item
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/55-hr-audit-engagement.sql =====
-- HR/compensation audit engagement on a deal (Stage 5). Tracks the vendor (or
-- internal team) running the audit and links the resulting report document.
-- Deal-scoped; managed with deals.manage. References dr_document, so it is
-- ordered after that table.

create table if not exists public.hr_audit_engagement (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('third_party', 'internal')),
  vendor_name text,
  vendor_contact text,
  scope text,
  ordered_at timestamptz,
  due_at timestamptz,
  report_document_id uuid references public.dr_document (id) on delete set null,
  findings_json jsonb not null default '{}'::jsonb,
  status public.checklist_status not null default 'not_started',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.hr_audit_engagement enable row level security;

create index ix_hr_audit_engagement_deal on public.hr_audit_engagement (deal_id);
create index ix_hr_audit_engagement_account on public.hr_audit_engagement (account_id);

revoke all on public.hr_audit_engagement from authenticated, service_role;
grant select, insert, update, delete on public.hr_audit_engagement to authenticated;
grant select, insert, update, delete on public.hr_audit_engagement to service_role;

create trigger hr_audit_engagement_timestamps
  before insert or update on public.hr_audit_engagement
  for each row execute function public.set_timestamps();

create trigger hr_audit_engagement_user_tracking
  before insert or update on public.hr_audit_engagement
  for each row execute function public.set_user_tracking();

create policy hr_audit_engagement_read on public.hr_audit_engagement
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy hr_audit_engagement_insert on public.hr_audit_engagement
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy hr_audit_engagement_update on public.hr_audit_engagement
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy hr_audit_engagement_delete on public.hr_audit_engagement
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/56-employee.sql =====
-- An employee assessed during the HR audit (Stage 5). Captures compensation,
-- tenure, and the retention risk flags that matter for the deal. Deal-scoped;
-- managed with deals.manage.

create table if not exists public.employee (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  role text,
  comp numeric,
  tenure_years numeric,
  credentials text,
  non_compete boolean not null default false,
  non_solicit boolean not null default false,
  key_person boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.employee enable row level security;

create index ix_employee_deal on public.employee (deal_id);
create index ix_employee_account on public.employee (account_id);

revoke all on public.employee from authenticated, service_role;
grant select, insert, update, delete on public.employee to authenticated;
grant select, insert, update, delete on public.employee to service_role;

create trigger employee_timestamps
  before insert or update on public.employee
  for each row execute function public.set_timestamps();

create trigger employee_user_tracking
  before insert or update on public.employee
  for each row execute function public.set_user_tracking();

create policy employee_read on public.employee
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy employee_insert on public.employee
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy employee_update on public.employee
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy employee_delete on public.employee
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/57-client-transition.sql =====
-- Per-client transition tracking for integration and close (Stage 8). Each row
-- follows one client through the paperwork required to move them to the buyer.
-- Deal-scoped; managed with deals.manage.

create table if not exists public.client_transition (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  client_name text not null,
  engagement_letter_status public.checklist_status not null default 'not_started',
  consent_7216_status public.checklist_status not null default 'not_started',
  efile_auth_status public.checklist_status not null default 'not_started',
  portal_migration_status public.checklist_status not null default 'not_started',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.client_transition enable row level security;

create index ix_client_transition_deal on public.client_transition (deal_id);
create index ix_client_transition_account on public.client_transition (account_id);

revoke all on public.client_transition from authenticated, service_role;
grant select, insert, update, delete on public.client_transition to authenticated;
grant select, insert, update, delete on public.client_transition to service_role;

create trigger client_transition_timestamps
  before insert or update on public.client_transition
  for each row execute function public.set_timestamps();

create trigger client_transition_user_tracking
  before insert or update on public.client_transition
  for each row execute function public.set_user_tracking();

create policy client_transition_read on public.client_transition
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy client_transition_insert on public.client_transition
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy client_transition_update on public.client_transition
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy client_transition_delete on public.client_transition
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/58-account-analytics.sql =====
-- Account-scoped analytics for the dashboard charts. Each function is the
-- access path (there are no materialized views with their own RLS); every one
-- runs security definer and gates on has_role_on_account(p_account_id), so a
-- caller who is not a member of the account gets an empty result. Revenue is
-- sensitive: functions that expose it take p_include_revenue, and the caller
-- passes true only for roles allowed to see revenue (owner/admin); when false
-- the revenue column is zeroed. asking_price is the pipeline revenue figure.

create or replace function public.analytics_pipeline_by_stage(p_account_id uuid, p_include_revenue boolean default false)
  returns table (stage text, label text, deal_count bigint, total_revenue numeric)
  language sql security definer
  set search_path = '' as $$
  select ps.key, ps.label, count(d.id),
    case when p_include_revenue then coalesce(sum(d.asking_price), 0) else 0 end
  from public.pipeline_stage ps
  left join public.deal d on d.account_id = ps.account_id and d.stage = ps.key
  where ps.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by ps.key, ps.label, ps.sort_order
  order by ps.sort_order;
$$;

create or replace function public.analytics_checklist_status_by_deal(p_account_id uuid)
  returns table (deal_id uuid, status public.checklist_status, item_count bigint)
  language sql security definer
  set search_path = '' as $$
  select ci.deal_id, ci.status, count(*)
  from public.checklist_item ci
  where ci.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by ci.deal_id, ci.status;
$$;

-- Median days from a checklist item being requested to being received.
create or replace function public.analytics_requested_to_received_median(p_account_id uuid)
  returns numeric
  language sql security definer
  set search_path = '' as $$
  select percentile_cont(0.5) within group (
    order by extract(epoch from (ci.received_at - ci.requested_at)) / 86400
  )
  from public.checklist_item ci
  where ci.account_id = p_account_id
    and ci.requested_at is not null
    and ci.received_at is not null
    and public.has_role_on_account(p_account_id);
$$;

create or replace function public.analytics_contract_turns_per_deal(p_account_id uuid)
  returns table (deal_id uuid, turns bigint)
  language sql security definer
  set search_path = '' as $$
  select c.deal_id, count(cv.id)
  from public.contract c
  join public.contract_version cv on cv.contract_id = c.id
  where c.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by c.deal_id;
$$;

create or replace function public.analytics_meetings_held_vs_skipped(p_account_id uuid)
  returns table (held bigint, skipped bigint)
  language sql security definer
  set search_path = '' as $$
  select
    count(*) filter (where m.status = 'held'),
    count(*) filter (where m.status = 'skipped')
  from public.meeting m
  where m.account_id = p_account_id
  having public.has_role_on_account(p_account_id);
$$;

create or replace function public.analytics_open_action_items_by_owner(p_account_id uuid)
  returns table (owner_user_id uuid, owner_is_seller boolean, open_count bigint)
  language sql security definer
  set search_path = '' as $$
  select ai.owner_user_id, ai.owner_is_seller, count(*)
  from public.meeting_action_item ai
  where ai.account_id = p_account_id
    and ai.status <> 'reviewed'
    and public.has_role_on_account(p_account_id)
  group by ai.owner_user_id, ai.owner_is_seller;
$$;

create or replace function public.analytics_broker_deal_flow_by_quarter(p_account_id uuid, p_include_revenue boolean default false)
  returns table (quarter date, broker_contact_id uuid, deal_count bigint, total_revenue numeric)
  language sql security definer
  set search_path = '' as $$
  select date_trunc('quarter', d.created_at)::date, d.broker_contact_id, count(*),
    case when p_include_revenue then coalesce(sum(d.asking_price), 0) else 0 end
  from public.deal d
  where d.account_id = p_account_id
    and d.broker_contact_id is not null
    and public.has_role_on_account(p_account_id)
  group by 1, d.broker_contact_id
  order by 1;
$$;

grant execute on function public.analytics_pipeline_by_stage(uuid, boolean) to authenticated, service_role;
grant execute on function public.analytics_checklist_status_by_deal(uuid) to authenticated, service_role;
grant execute on function public.analytics_requested_to_received_median(uuid) to authenticated, service_role;
grant execute on function public.analytics_contract_turns_per_deal(uuid) to authenticated, service_role;
grant execute on function public.analytics_meetings_held_vs_skipped(uuid) to authenticated, service_role;
grant execute on function public.analytics_open_action_items_by_owner(uuid) to authenticated, service_role;
grant execute on function public.analytics_broker_deal_flow_by_quarter(uuid, boolean) to authenticated, service_role;

-- ===== schemas/59-search.sql =====
-- Full-text search projection. One row per searchable source row, holding a
-- prebuilt tsvector so global search and the diligence chat rank matches
-- without scanning every domain table. The projection is maintained by the
-- backend (service_role); readers select through the same account and deal
-- access as the source rows. entity_type and entity_id name the source row;
-- deal_id is null for account-scoped entities and set for deal-scoped ones.

create table if not exists public.search_document (
  entity_type text not null,
  entity_id uuid not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  tsv tsvector not null,
  primary key (entity_type, entity_id)
);

alter table public.search_document enable row level security;

create index ix_search_document_tsv on public.search_document using gin (tsv);
create index ix_search_document_account on public.search_document (account_id);

revoke all on public.search_document from authenticated, service_role;
grant select on public.search_document to authenticated;
grant select, insert, update, delete on public.search_document to service_role;

create policy search_document_read on public.search_document
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );

-- Ranked full-text search within one account. security definer so it can read
-- the projection; the account gate mirrors the analytics functions, and the
-- deal branch keeps a participant's results to the deals they were granted.
create or replace function public.search_documents(p_account_id uuid, p_query text)
  returns table (entity_type text, entity_id uuid, deal_id uuid, rank real)
  language sql security definer
  set search_path = '' as $$
  select sd.entity_type, sd.entity_id, sd.deal_id,
    ts_rank(sd.tsv, websearch_to_tsquery('english', p_query))
  from public.search_document sd
  where sd.account_id = p_account_id
    and sd.tsv @@ websearch_to_tsquery('english', p_query)
    and (
      public.has_role_on_account(p_account_id)
      or (sd.deal_id is not null and public.has_deal_permission(sd.deal_id, 'deals.manage'))
    )
  order by 4 desc;
$$;

grant execute on function public.search_documents(uuid, text) to authenticated, service_role;

-- ===== schemas/60-ai-layer.sql =====
-- AI layer groundwork. pgvector powers embedding search over document chunks;
-- llm_endpoint holds each account's model and endpoint configuration; its
-- api_key_secret_ref names the env or secret-store entry that carries the bearer
-- token, so the raw key never lives in a table row; every
-- model call is written to ai_call_log for audit; document_chunk stores the
-- embedded text spans of data-room documents. ai_redaction_enabled toggles
-- whether an account's prompts are redacted before they leave the tenant.

create extension if not exists vector with schema extensions;

alter table public.accounts add column ai_redaction_enabled boolean not null default false;

create table if not exists public.llm_endpoint (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null,
  model text not null,
  base_url text,
  api_key_secret_ref text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.llm_endpoint enable row level security;

create index ix_llm_endpoint_account on public.llm_endpoint (account_id);

revoke all on public.llm_endpoint from authenticated, service_role;
grant select, insert, update, delete on public.llm_endpoint to authenticated;
grant select, insert, update, delete on public.llm_endpoint to service_role;

create trigger llm_endpoint_timestamps
  before insert or update on public.llm_endpoint
  for each row execute function public.set_timestamps();

create trigger llm_endpoint_user_tracking
  before insert or update on public.llm_endpoint
  for each row execute function public.set_user_tracking();

create policy llm_endpoint_read on public.llm_endpoint
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy llm_endpoint_insert on public.llm_endpoint
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy llm_endpoint_update on public.llm_endpoint
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy llm_endpoint_delete on public.llm_endpoint
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- Append-only audit of model calls. created_by defaults to the acting user;
-- rows are never updated, so no timestamp trigger is wired.
create table if not exists public.ai_call_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  endpoint_id uuid references public.llm_endpoint (id) on delete set null,
  deal_id uuid references public.deal (id) on delete cascade,
  model text not null,
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users default auth.uid()
);

alter table public.ai_call_log enable row level security;

create index ix_ai_call_log_account on public.ai_call_log (account_id);

revoke all on public.ai_call_log from authenticated, service_role;
grant select on public.ai_call_log to authenticated;
grant select, insert, update, delete on public.ai_call_log to service_role;

create policy ai_call_log_read on public.ai_call_log
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- Embedded spans of a data-room document. Deal-scoped; access mirrors
-- dr_document so a chunk is reachable exactly when its document is.
create table if not exists public.document_chunk (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  document_id uuid not null references public.dr_document (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

alter table public.document_chunk enable row level security;

create index ix_document_chunk_document on public.document_chunk (document_id);
create index ix_document_chunk_deal on public.document_chunk (deal_id);

revoke all on public.document_chunk from authenticated, service_role;
grant select, insert, update, delete on public.document_chunk to authenticated;
grant select, insert, update, delete on public.document_chunk to service_role;

create policy document_chunk_read on public.document_chunk
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy document_chunk_insert on public.document_chunk
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_chunk_update on public.document_chunk
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_chunk_delete on public.document_chunk
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/61-data-room-upload.sql =====
-- Data-room bulk upload staging. An upload_batch stages a single file, a group
-- of files, or a ZIP before the extraction worker expands it into dr_document
-- rows; each staged file is an upload_item pointing at its landing spot and,
-- once imported, at the dr_document it became. Deal-scoped; access mirrors
-- dr_document so external parties on the deal reach their own batches, while
-- the worker writes through service_role.

create type public.upload_batch_kind as enum ('single', 'group', 'zip');

create type public.upload_batch_status as enum ('pending', 'extracting', 'ready', 'imported', 'failed');

create type public.upload_item_status as enum ('pending', 'imported', 'failed');

create table if not exists public.upload_batch (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  kind public.upload_batch_kind not null,
  status public.upload_batch_status not null default 'pending',
  file_count int not null default 0,
  source_filename text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.upload_batch enable row level security;

create index ix_upload_batch_deal on public.upload_batch (deal_id);

revoke all on public.upload_batch from authenticated, service_role;
grant select, insert, update, delete on public.upload_batch to authenticated;
grant select, insert, update, delete on public.upload_batch to service_role;

create trigger upload_batch_timestamps
  before insert or update on public.upload_batch
  for each row execute function public.set_timestamps();

create policy upload_batch_read on public.upload_batch
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy upload_batch_insert on public.upload_batch
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy upload_batch_update on public.upload_batch
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy upload_batch_delete on public.upload_batch
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create table if not exists public.upload_item (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.upload_batch (id) on delete cascade,
  storage_path text not null,
  original_path text not null,
  size_bytes bigint,
  content_type text,
  status public.upload_item_status not null default 'pending',
  target_folder_id uuid references public.dr_folder (id) on delete set null,
  dr_document_id uuid references public.dr_document (id) on delete set null,
  error text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.upload_item enable row level security;

create index ix_upload_item_batch on public.upload_item (batch_id);

revoke all on public.upload_item from authenticated, service_role;
grant select, insert, update, delete on public.upload_item to authenticated;
grant select, insert, update, delete on public.upload_item to service_role;

create trigger upload_item_timestamps
  before insert or update on public.upload_item
  for each row execute function public.set_timestamps();

create policy upload_item_read on public.upload_item
  for select to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and (
          public.has_role_on_account(b.account_id)
          or public.has_deal_permission(b.deal_id, 'deals.manage')
        )
    )
  );

create policy upload_item_insert on public.upload_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );

create policy upload_item_update on public.upload_item
  for update to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  )
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );

create policy upload_item_delete on public.upload_item
  for delete to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );

-- ===== schemas/62-notification-preference.sql =====
-- Per-recipient notification controls. A row switches one event_type on one
-- channel on or off for one recipient. deal_id null is an account-wide default;
-- deal_id set is a deal-scoped override. Participants and external attorneys
-- manage only their own rows; account admins may read across the account to see
-- who has muted what.

create table if not exists public.notification_preference (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  channel public.notification_channel not null,
  event_type text not null,
  enabled boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid references auth.users default auth.uid(),
  unique (account_id, deal_id, recipient_user_id, channel, event_type)
);

alter table public.notification_preference enable row level security;

create index ix_notification_preference_recipient on public.notification_preference (recipient_user_id);
create index ix_notification_preference_account on public.notification_preference (account_id);

revoke all on public.notification_preference from authenticated, service_role;
grant select, insert, update, delete on public.notification_preference to authenticated;
grant select, insert, update, delete on public.notification_preference to service_role;

create trigger notification_preference_timestamps
  before insert or update on public.notification_preference
  for each row execute function public.set_timestamps();

create policy notification_preference_read on public.notification_preference
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or public.has_permission((select auth.uid()), account_id, 'members.manage')
  );

create policy notification_preference_insert on public.notification_preference
  for insert to authenticated
  with check (recipient_user_id = (select auth.uid()));

create policy notification_preference_update on public.notification_preference
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

create policy notification_preference_delete on public.notification_preference
  for delete to authenticated
  using (recipient_user_id = (select auth.uid()));

-- ===== schemas/63-ai-ingestion-index.sql =====
-- AI ingestion index. The ivfflat index over document_chunk.embedding lets RAG
-- retrieval run cosine-similarity search without a full scan. embedding_job
-- tracks each Docling ingestion and embedding run for a data-room document.
-- Deal-scoped; access mirrors document_chunk and dr_document.

create index ix_document_chunk_embedding on public.document_chunk
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

create type public.embedding_job_status as enum ('queued', 'running', 'done', 'failed');

create table if not exists public.embedding_job (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  dr_document_id uuid not null references public.dr_document (id) on delete cascade,
  status public.embedding_job_status not null default 'queued',
  chunk_count int,
  model text,
  error text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.embedding_job enable row level security;

create index ix_embedding_job_deal on public.embedding_job (deal_id);
create index ix_embedding_job_document on public.embedding_job (dr_document_id);

revoke all on public.embedding_job from authenticated, service_role;
grant select, insert, update, delete on public.embedding_job to authenticated;
grant select, insert, update, delete on public.embedding_job to service_role;

create trigger embedding_job_timestamps
  before insert or update on public.embedding_job
  for each row execute function public.set_timestamps();

create policy embedding_job_read on public.embedding_job
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy embedding_job_insert on public.embedding_job
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy embedding_job_update on public.embedding_job
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy embedding_job_delete on public.embedding_job
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/64-deal-event.sql =====
-- The deal-wide event store. deal_event is the append-only source of truth for
-- everything that happens inside a deal's saga; the domain tables are synchronous
-- projections of this log. Rows are written only through append_deal_event
-- (66-deal-event-append.sql): there is no insert/update/delete grant to anyone.
-- deal_event_snapshot holds materialised checkpoints written on the every-64
-- boundary. Both are deal-scoped and read with the same visibility as the deal.

create type public.event_actor_kind as enum ('user', 'service', 'api_key', 'system');

create table if not exists public.deal_event (
  id uuid primary key default gen_random_uuid(),
  global_seq bigint generated always as identity,
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade deferrable initially deferred,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_kind public.event_actor_kind not null,
  actor_ref uuid,
  actor_via text,
  deal_seq bigint not null,
  aggregate_seq bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (deal_id, deal_seq),
  unique (aggregate_type, aggregate_id, aggregate_seq)
);

alter table public.deal_event enable row level security;

create index ix_deal_event_deal_seq on public.deal_event (deal_id, deal_seq);
create index ix_deal_event_aggregate on public.deal_event (aggregate_type, aggregate_id, aggregate_seq);
create index ix_deal_event_account on public.deal_event (account_id, created_at);

revoke all on public.deal_event from authenticated, service_role;
grant select on public.deal_event to authenticated, service_role;

create policy deal_event_read on public.deal_event
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create table if not exists public.deal_event_snapshot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade deferrable initially deferred,
  aggregate_type text not null,
  aggregate_id uuid not null,
  through_seq bigint not null,
  state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (aggregate_type, aggregate_id, through_seq)
);

alter table public.deal_event_snapshot enable row level security;

create index ix_deal_event_snapshot_latest on public.deal_event_snapshot (aggregate_type, aggregate_id, through_seq desc);

revoke all on public.deal_event_snapshot from authenticated, service_role;
grant select on public.deal_event_snapshot to authenticated, service_role;

create policy deal_event_snapshot_read on public.deal_event_snapshot
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

-- ===== schemas/65-deal-event-projectors.sql =====
-- Per-aggregate projectors. Each project_* function folds one event into its
-- domain table with an upsert or a tombstone; project_deal_event is the explicit
-- dispatch. append_deal_event (live) and rebuild_deal (replay) are the two
-- callers, so a projection has exactly one code path. Projectors run as the
-- table owner (security definer) and are never granted to authenticated: the
-- log is the only public write surface. created_by/updated_by are stamped from
-- the event actor; timestamp/tracking triggers on the projection tables still
-- run this wave and are neutralised with the grant revokes in a later wave.
--
-- An unknown event_type raises rather than falling through, and enum-typed
-- payload fields are cast so an illegal value raises on the cast.

create or replace function public.project_deal(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.created' then
    insert into public.deal (id, account_id, firm_id, owner_user_id, description, asking_price, revenue_ttm, sde_ttm, ebitda_ttm, notes, source, stage, broker_contact_id, deal_box_version, capture_method, source_url, discovered_at, created_by_kind, created_by_ref, created_by_via, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'firm_id')::uuid,
      (ev.payload ->> 'owner_user_id')::uuid,
      ev.payload ->> 'description',
      (ev.payload ->> 'asking_price')::numeric,
      (ev.payload ->> 'revenue_ttm')::numeric,
      (ev.payload ->> 'sde_ttm')::numeric,
      (ev.payload ->> 'ebitda_ttm')::numeric,
      ev.payload ->> 'notes',
      coalesce((ev.payload ->> 'source')::public.deal_source, 'manual'),
      coalesce(ev.payload ->> 'stage', 'sourcing'),
      (ev.payload ->> 'broker_contact_id')::uuid,
      (ev.payload ->> 'deal_box_version')::int,
      ev.payload ->> 'capture_method',
      ev.payload ->> 'source_url',
      coalesce((ev.payload ->> 'discovered_at')::timestamptz, ev.created_at),
      case ev.actor_kind
        when 'user' then 'user'
        when 'service' then 'workflow'
        when 'api_key' then 'agent'
        when 'system' then 'integration'
      end,
      ev.actor_ref::text,
      ev.actor_via,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      firm_id = excluded.firm_id,
      owner_user_id = excluded.owner_user_id,
      description = excluded.description,
      asking_price = excluded.asking_price,
      revenue_ttm = excluded.revenue_ttm,
      sde_ttm = excluded.sde_ttm,
      ebitda_ttm = excluded.ebitda_ttm,
      notes = excluded.notes,
      broker_contact_id = excluded.broker_contact_id,
      deal_box_version = excluded.deal_box_version,
      capture_method = excluded.capture_method,
      source_url = excluded.source_url,
      updated_by = excluded.updated_by;
    insert into public.deal_profile (deal_id, account_id, year_established, industry_id, location_id, location_raw, employee_band, website, owner_role, reason_for_sale)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'year_established')::int,
      (ev.payload ->> 'industry_id')::uuid,
      (ev.payload ->> 'location_id')::uuid,
      ev.payload ->> 'location_raw',
      ev.payload ->> 'employee_band',
      ev.payload ->> 'website',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'reason_for_sale'
    )
    on conflict (deal_id) do update set
      year_established = excluded.year_established,
      industry_id = excluded.industry_id,
      location_id = excluded.location_id,
      location_raw = excluded.location_raw,
      employee_band = excluded.employee_band,
      website = excluded.website,
      owner_role = excluded.owner_role,
      reason_for_sale = excluded.reason_for_sale;
  elsif ev.event_type = 'deal.updated' then
    update public.deal set
      description = coalesce(ev.payload ->> 'description', description),
      asking_price = coalesce((ev.payload ->> 'asking_price')::numeric, asking_price),
      revenue_ttm = coalesce((ev.payload ->> 'revenue_ttm')::numeric, revenue_ttm),
      sde_ttm = coalesce((ev.payload ->> 'sde_ttm')::numeric, sde_ttm),
      ebitda_ttm = coalesce((ev.payload ->> 'ebitda_ttm')::numeric, ebitda_ttm),
      notes = coalesce(ev.payload ->> 'notes', notes),
      close_date = coalesce((ev.payload ->> 'close_date')::date, close_date),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
    update public.deal_profile set
      year_established = coalesce((ev.payload ->> 'year_established')::int, year_established),
      industry_id = coalesce((ev.payload ->> 'industry_id')::uuid, industry_id),
      location_id = coalesce((ev.payload ->> 'location_id')::uuid, location_id),
      location_raw = coalesce(ev.payload ->> 'location_raw', location_raw),
      employee_band = coalesce(ev.payload ->> 'employee_band', employee_band),
      website = coalesce(ev.payload ->> 'website', website),
      owner_role = coalesce(ev.payload ->> 'owner_role', owner_role),
      reason_for_sale = coalesce(ev.payload ->> 'reason_for_sale', reason_for_sale)
    where deal_id = ev.aggregate_id;
  elsif ev.event_type = 'deal.stage_changed' then
    update public.deal set
      stage = ev.payload ->> 'stage',
      stage_changed_at = ev.created_at,
      outcome_reason = coalesce(ev.payload ->> 'outcome_reason', outcome_reason),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.resolved' then
    update public.deal set
      resolution = ev.payload ->> 'resolution',
      resolution_reason = ev.payload ->> 'resolution_reason',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.archived' then
    update public.deal set
      archived_at = coalesce((ev.payload ->> 'archived_at')::timestamptz, ev.created_at),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.unarchived' then
    update public.deal set
      archived_at = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.listing_status_changed' then
    update public.deal set
      listing_status = ev.payload ->> 'listing_status',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_flagged' then
    update public.deal set
      duplicate_of = (ev.payload ->> 'duplicate_of')::uuid,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_cleared' then
    update public.deal set
      duplicate_of = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown deal event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_deal_box(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_box.set' then
    insert into public.deal_box (id, account_id, version, criteria_json, broker_summary, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'version')::int,
      coalesce(ev.payload -> 'criteria_json', '{}'::jsonb),
      ev.payload ->> 'broker_summary',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      criteria_json = excluded.criteria_json,
      broker_summary = excluded.broker_summary,
      updated_by = excluded.updated_by;
  else
    raise exception 'unknown deal_box event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      ev.payload ->> 'category',
      ev.payload ->> 'title',
      (ev.payload ->> 'owner_user_id')::uuid,
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      coalesce((ev.payload ->> 'priority')::int, 0),
      coalesce((ev.payload ->> 'deal_killer')::boolean, false),
      (ev.payload ->> 'schedule_week_id')::uuid,
      (ev.payload ->> 'due_offset_days')::int,
      ev.payload ->> 'kind',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'importance',
      ev.payload ->> 'answer',
      ev.payload ->> 'offer_term_key',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      category = excluded.category,
      title = excluded.title,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      priority = excluded.priority,
      deal_killer = excluded.deal_killer,
      schedule_week_id = excluded.schedule_week_id,
      due_offset_days = excluded.due_offset_days,
      kind = excluded.kind,
      owner_role = excluded.owner_role,
      importance = excluded.importance,
      answer = excluded.answer,
      offer_term_key = excluded.offer_term_key,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'checklist_item.status_changed' then
    update public.checklist_item set
      status = (ev.payload ->> 'status')::public.checklist_status,
      requested_at = coalesce((ev.payload ->> 'requested_at')::timestamptz, requested_at),
      received_at = coalesce((ev.payload ->> 'received_at')::timestamptz, received_at),
      reviewed_at = coalesce((ev.payload ->> 'reviewed_at')::timestamptz, reviewed_at),
      reviewed_by = coalesce((ev.payload ->> 'reviewed_by')::uuid, reviewed_by),
      outcome = coalesce((ev.payload ->> 'outcome')::public.checklist_outcome, outcome),
      answer = coalesce(ev.payload ->> 'answer', answer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.rescheduled' then
    update public.checklist_item set
      schedule_week_id = (ev.payload ->> 'schedule_week_id')::uuid,
      priority = coalesce((ev.payload ->> 'priority')::int, priority),
      deal_killer = coalesce((ev.payload ->> 'deal_killer')::boolean, deal_killer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_approval(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'approval.requested' then
    insert into public.approval (id, deal_id, subject, requested_by)
    values (
      ev.aggregate_id, ev.deal_id,
      (ev.payload ->> 'subject')::public.approval_subject,
      ev.actor_ref
    )
    on conflict (id) do update set subject = excluded.subject;
  elsif ev.event_type = 'approval.decided' then
    update public.approval set
      decision = (ev.payload ->> 'decision')::public.approval_decision,
      decided_by = ev.actor_ref,
      decided_at = ev.created_at
    where id = ev.aggregate_id;
  else
    raise exception 'unknown approval event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_deal_participant(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_participant.added' then
    insert into public.deal_participant (id, deal_id, user_id, party, role, scope, scope_id, permission, expires_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id,
      (ev.payload ->> 'user_id')::uuid,
      (ev.payload ->> 'party')::public.participant_party,
      ev.payload ->> 'role',
      coalesce((ev.payload ->> 'scope')::public.participant_scope, 'deal'),
      (ev.payload ->> 'scope_id')::uuid,
      coalesce((ev.payload ->> 'permission')::public.participant_permission, 'view'),
      (ev.payload ->> 'expires_at')::timestamptz,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      role = excluded.role,
      scope_id = excluded.scope_id,
      permission = excluded.permission,
      expires_at = excluded.expires_at,
      updated_by = excluded.updated_by;
  else
    raise exception 'unknown deal_participant event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_dr_document(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'dr_document.added' then
    insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, checklist_item_id, uploaded_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'folder_id')::uuid,
      ev.payload ->> 'name',
      ev.payload ->> 'storage_path',
      coalesce((ev.payload ->> 'version')::int, 1),
      (ev.payload ->> 'checklist_item_id')::uuid,
      ev.actor_ref
    )
    on conflict (id) do update set
      folder_id = excluded.folder_id,
      name = excluded.name,
      checklist_item_id = excluded.checklist_item_id;
  elsif ev.event_type = 'dr_document.moved' then
    update public.dr_document set folder_id = (ev.payload ->> 'folder_id')::uuid
    where id = ev.aggregate_id;
  elsif ev.event_type = 'dr_document.removed' then
    update public.dr_document set removed_at = ev.created_at where id = ev.aggregate_id;
  else
    raise exception 'unknown dr_document event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_meeting(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'meeting.scheduled' then
    insert into public.meeting (id, deal_id, account_id, series_id, type, scheduled_at, status, notes, created_by, updated_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      (ev.payload ->> 'series_id')::uuid,
      ev.payload ->> 'type',
      (ev.payload ->> 'scheduled_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.meeting_status, 'scheduled'),
      ev.payload ->> 'notes',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      scheduled_at = excluded.scheduled_at,
      status = excluded.status,
      notes = excluded.notes,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'meeting.updated' then
    update public.meeting set
      status = coalesce((ev.payload ->> 'status')::public.meeting_status, status),
      scheduled_at = coalesce((ev.payload ->> 'scheduled_at')::timestamptz, scheduled_at),
      notes = coalesce(ev.payload ->> 'notes', notes),
      decisions = coalesce(ev.payload ->> 'decisions', decisions),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown meeting event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_meeting_action_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'meeting_action_item.added' then
    insert into public.meeting_action_item (id, meeting_id, deal_id, account_id, description, owner_user_id, owner_is_seller, due_at, status, checklist_item_id, schedule_week_id, created_by, updated_by)
    values (
      ev.aggregate_id,
      (ev.payload ->> 'meeting_id')::uuid,
      ev.deal_id, ev.account_id,
      ev.payload ->> 'description',
      (ev.payload ->> 'owner_user_id')::uuid,
      coalesce((ev.payload ->> 'owner_is_seller')::boolean, false),
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      (ev.payload ->> 'checklist_item_id')::uuid,
      (ev.payload ->> 'schedule_week_id')::uuid,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      description = excluded.description,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      schedule_week_id = excluded.schedule_week_id,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'meeting_action_item.updated' then
    update public.meeting_action_item set
      status = coalesce((ev.payload ->> 'status')::public.checklist_status, status),
      description = coalesce(ev.payload ->> 'description', description),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'meeting_action_item.removed' then
    update public.meeting_action_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown meeting_action_item event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_contract(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'contract.created' then
    insert into public.contract (id, deal_id, account_id, type, status, current_version, source_offer_version_id, created_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      ev.payload ->> 'type',
      ev.payload ->> 'status',
      (ev.payload ->> 'current_version')::int,
      (ev.payload ->> 'source_offer_version_id')::uuid,
      ev.actor_ref
    )
    on conflict (id) do update set
      status = excluded.status,
      current_version = excluded.current_version;
  elsif ev.event_type = 'contract.version_set' then
    update public.contract set
      current_version = (ev.payload ->> 'current_version')::int,
      status = coalesce(ev.payload ->> 'status', status)
    where id = ev.aggregate_id;
  else
    raise exception 'unknown contract event %', ev.event_type;
  end if;
end;
$$;

-- offer.version_added carries the new offer_version's id in payload.version_id;
-- the offer aggregate_id is the parent offer. Version rows are insert-only so a
-- submitted version stays frozen; the insert is guarded on conflict do nothing
-- so a replay re-applying the event is a no-op rather than a unique violation.
-- The stage move to loi_submitted/loi_accepted and the contract.created for an
-- accepted offer are separate events the accept/submit action emits, not folded
-- here.
create or replace function public.project_offer(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'offer.drafted' then
    insert into public.offer (id, account_id, deal_id, status)
    values (ev.aggregate_id, ev.account_id, ev.deal_id, 'draft')
    on conflict (id) do nothing;
  elsif ev.event_type = 'offer.version_added' then
    insert into public.offer_version (id, account_id, offer_id, number, author_side, purchase_price, real_estate_portion, target_close_date, offer_expires_at, exclusivity_days, diligence_days, terms, calc_version_id, approved_by, approved_at)
    values (
      (ev.payload ->> 'version_id')::uuid,
      ev.account_id, ev.aggregate_id,
      (ev.payload ->> 'number')::int,
      ev.payload ->> 'author_side',
      (ev.payload ->> 'purchase_price')::numeric,
      (ev.payload ->> 'real_estate_portion')::numeric,
      (ev.payload ->> 'target_close_date')::date,
      (ev.payload ->> 'offer_expires_at')::timestamptz,
      (ev.payload ->> 'exclusivity_days')::int,
      (ev.payload ->> 'diligence_days')::int,
      coalesce(ev.payload -> 'terms', '{}'::jsonb),
      (ev.payload ->> 'calc_version_id')::uuid,
      (ev.payload ->> 'approved_by')::uuid,
      (ev.payload ->> 'approved_at')::timestamptz
    )
    on conflict (id) do nothing;
    update public.offer set current_version_id = (ev.payload ->> 'version_id')::uuid
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.submitted' then
    update public.offer set status = 'submitted', submitted_at = ev.created_at
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.countered' then
    update public.offer set status = 'countered' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.accepted' then
    update public.offer set status = 'accepted', responded_at = ev.created_at
    where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.rejected' then
    update public.offer set status = 'rejected' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.withdrawn' then
    update public.offer set status = 'withdrawn' where id = ev.aggregate_id;
  elsif ev.event_type = 'offer.expired' then
    update public.offer set status = 'expired' where id = ev.aggregate_id;
  else
    raise exception 'unknown offer event %', ev.event_type;
  end if;
end;
$$;

-- deal.financials_adopted rides the 'deal' aggregate but folds into the
-- deal_financials projection (86-deal-financials.sql) rather than the deal row.
create or replace function public.project_deal_financials(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.financials_adopted' then
    insert into public.deal_financials (deal_id, account_id, adopted_revenue, adopted_sde, adopted_ebitda, source_calc_version_id, adopted_by, adopted_at)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'adopted_revenue')::numeric,
      (ev.payload ->> 'adopted_sde')::numeric,
      (ev.payload ->> 'adopted_ebitda')::numeric,
      (ev.payload ->> 'source_calc_version_id')::uuid,
      ev.actor_ref,
      ev.created_at
    )
    on conflict (deal_id) do update set
      adopted_revenue = excluded.adopted_revenue,
      adopted_sde = excluded.adopted_sde,
      adopted_ebitda = excluded.adopted_ebitda,
      source_calc_version_id = excluded.source_calc_version_id,
      adopted_by = excluded.adopted_by,
      adopted_at = excluded.adopted_at;
  else
    raise exception 'unknown deal_financials event %', ev.event_type;
  end if;
end;
$$;

-- Explicit dispatch. Unknown aggregate_type raises rather than silently
-- dropping the event.
create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' then
    perform public.project_deal(ev);
  elsif ev.aggregate_type = 'deal_box' then
    perform public.project_deal_box(ev);
  elsif ev.aggregate_type = 'checklist_item' then
    perform public.project_checklist_item(ev);
  elsif ev.aggregate_type = 'approval' then
    perform public.project_approval(ev);
  elsif ev.aggregate_type = 'deal_participant' then
    perform public.project_deal_participant(ev);
  elsif ev.aggregate_type = 'dr_document' then
    perform public.project_dr_document(ev);
  elsif ev.aggregate_type = 'meeting' then
    perform public.project_meeting(ev);
  elsif ev.aggregate_type = 'meeting_action_item' then
    perform public.project_meeting_action_item(ev);
  elsif ev.aggregate_type = 'contract' then
    perform public.project_contract(ev);
  elsif ev.aggregate_type = 'offer' then
    perform public.project_offer(ev);
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;

-- The permission an event of a given aggregate must satisfy, mirroring the
-- insert policies the projection tables carried before the log.
create or replace function public.deal_event_permission(p_aggregate_type text)
  returns text
  language sql immutable set search_path = '' as $$
  select case p_aggregate_type
    when 'checklist_item' then 'checklists.manage'
    when 'deal_participant' then 'participants.manage'
    else 'deals.manage'
  end;
$$;

-- The materialised state stored in an aggregate-level snapshot: the projected
-- row as jsonb.
create or replace function public.deal_aggregate_state(p_aggregate_type text, p_aggregate_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_aggregate_type)
    into v_state using p_aggregate_id;
  return v_state;
end;
$$;

-- The deal-level snapshot body: the deal row plus a compact manifest of each
-- child aggregate's current head aggregate_seq (D3), not a full child bundle.
create or replace function public.deal_wide_manifest(p_deal_id uuid)
  returns jsonb
  language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'deal', (select to_jsonb(d) from public.deal d where d.id = p_deal_id),
    'heads', coalesce((
      select jsonb_object_agg(k, mx)
      from (
        select de.aggregate_type || ':' || de.aggregate_id::text as k, max(de.aggregate_seq) as mx
        from public.deal_event de
        where de.deal_id = p_deal_id
        group by de.aggregate_type, de.aggregate_id
      ) s
    ), '{}'::jsonb)
  );
$$;

-- ===== schemas/66-deal-event-append.sql =====
-- The single write entry point for the event store. append_deal_event
-- authorises the event, serialises appends per deal under a transaction advisory
-- lock, computes the gapless deal_seq and aggregate_seq, inserts the event,
-- dispatches to the projector in the same transaction, and writes the every-64
-- snapshots. append_deal_events appends several events atomically under one lock
-- so a cross-aggregate action stays in one transaction (D7).
--
-- Optimistic concurrency: p_expected_aggregate_seq, when supplied, must equal the
-- current aggregate head or the append raises serialization_failure (40001). When
-- omitted the write is last-writer-wins. A deal.created event authorises against
-- deals.create on the account and resolves the account from the payload, since the
-- deal row does not exist yet; every other event authorises with the log's
-- has_deal_permission and resolves the account from the deal.

create or replace function public.append_deal_event(
  p_deal_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_aggregate_seq bigint default null,
  p_actor_kind public.event_actor_kind default 'user',
  p_actor_via text default 'web'
) returns table (deal_seq bigint, aggregate_seq bigint)
  language plpgsql security definer set search_path = '' as $$
declare
  v_account_id uuid;
  v_actor_ref uuid;
  v_deal_seq bigint;
  v_agg_seq bigint;
  v_event public.deal_event;
begin
  select d.account_id into v_account_id from public.deal d where d.id = p_deal_id;
  if v_account_id is null then
    v_account_id := (p_payload ->> 'account_id')::uuid;
  end if;
  if v_account_id is null then
    raise exception 'cannot resolve account for deal %', p_deal_id using errcode = 'foreign_key_violation';
  end if;

  if p_actor_kind = 'user' then
    v_actor_ref := (select auth.uid());
    if p_event_type = 'deal.created' then
      if not public.has_permission(v_actor_ref, v_account_id, 'deals.create') then
        raise exception 'not authorized to create a deal on account %', v_account_id using errcode = 'insufficient_privilege';
      end if;
    elsif not public.has_deal_permission(p_deal_id, public.deal_event_permission(p_aggregate_type)) then
      raise exception 'not authorized to append % on deal %', p_event_type, p_deal_id using errcode = 'insufficient_privilege';
    end if;
  elsif (select auth.role()) <> 'service_role' then
    raise exception 'non-user events require the service role' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_deal_id::text));

  select coalesce(max(de.deal_seq), 0) + 1 into v_deal_seq
  from public.deal_event de where de.deal_id = p_deal_id;

  select coalesce(max(de.aggregate_seq), 0) + 1 into v_agg_seq
  from public.deal_event de
  where de.aggregate_type = p_aggregate_type and de.aggregate_id = p_aggregate_id;

  if p_expected_aggregate_seq is not null and p_expected_aggregate_seq <> v_agg_seq - 1 then
    raise exception 'stale aggregate %/%: expected head %, actual head %',
      p_aggregate_type, p_aggregate_id, p_expected_aggregate_seq, v_agg_seq - 1
      using errcode = 'serialization_failure';
  end if;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_ref, actor_via, deal_seq, aggregate_seq
  )
  values (
    v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, p_event_type, p_payload,
    p_actor_kind, v_actor_ref, p_actor_via, v_deal_seq, v_agg_seq
  )
  returning * into v_event;

  perform public.project_deal_event(v_event);

  if v_agg_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, p_aggregate_type, p_aggregate_id, v_agg_seq,
            public.deal_aggregate_state(p_aggregate_type, p_aggregate_id));
  end if;

  if v_deal_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (v_account_id, p_deal_id, 'deal-wide', p_deal_id, v_deal_seq,
            public.deal_wide_manifest(p_deal_id));
  end if;

  return query select v_deal_seq, v_agg_seq;
end;
$$;

grant execute on function public.append_deal_event(uuid, text, uuid, text, jsonb, bigint, public.event_actor_kind, text) to authenticated, service_role;

create or replace function public.append_deal_events(p_deal_id uuid, p_events jsonb)
  returns table (deal_seq bigint, aggregate_seq bigint)
  language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
begin
  for e in select * from jsonb_array_elements(p_events)
  loop
    return query
    select r.deal_seq, r.aggregate_seq
    from public.append_deal_event(
      p_deal_id,
      e ->> 'aggregate_type',
      (e ->> 'aggregate_id')::uuid,
      e ->> 'event_type',
      coalesce(e -> 'payload', '{}'::jsonb),
      (e ->> 'expected_aggregate_seq')::bigint,
      coalesce((e ->> 'actor_kind')::public.event_actor_kind, 'user'),
      coalesce(e ->> 'actor_via', 'web')
    ) r;
  end loop;
end;
$$;

grant execute on function public.append_deal_events(uuid, jsonb) to authenticated, service_role;

-- ===== schemas/67-deal-event-replay.sql =====
-- Authoritative whole-deal rebuild. replay_deal deletes the deal's child
-- projection rows and re-applies every event in deal_seq order through the same
-- projectors the live append uses, so projections equal fold(events). It runs
-- under the odb.replay GUC, which the deal-domain side-effect triggers honour by
-- early-returning, so a rebuild emits no notifications. The deal and deal_box
-- parents are upserted by their own events rather than deleted, so foreign keys
-- and account-shared rows are preserved. Rebuild is idempotent.

create or replace function public.replay_deal(p_deal_id uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_event public.deal_event;
begin
  perform set_config('odb.replay', 'on', true);

  delete from public.meeting_action_item where deal_id = p_deal_id;
  delete from public.dr_document where deal_id = p_deal_id;
  delete from public.meeting where deal_id = p_deal_id;
  delete from public.approval where deal_id = p_deal_id;
  delete from public.deal_participant where deal_id = p_deal_id;
  delete from public.checklist_item where deal_id = p_deal_id;

  for v_event in
    select * from public.deal_event de where de.deal_id = p_deal_id order by de.deal_seq
  loop
    perform public.project_deal_event(v_event);
  end loop;

  perform set_config('odb.replay', 'off', true);
end;
$$;

grant execute on function public.replay_deal(uuid) to service_role;

-- ===== schemas/68-account-analytics-events.sql =====
-- Analytics that read the deal_event log. They live after the event-store
-- files because their bodies reference public.deal_event, which is created in
-- 64-deal-event.sql; a security definer SQL function is validated against the
-- catalogue at creation time, so it must be declared after that table exists.
-- Stage moves are recorded as deal.stage_changed events; the entered stage is
-- payload->>'stage'.

create or replace function public.analytics_deals_added_lost_by_month(p_account_id uuid)
  returns table (month date, added bigint, lost bigint)
  language sql security definer
  set search_path = '' as $$
  with added as (
    select date_trunc('month', d.created_at)::date as m, count(*) as c
    from public.deal d
    where d.account_id = p_account_id
      and public.has_role_on_account(p_account_id)
    group by 1
  ),
  lost as (
    select date_trunc('month', de.created_at)::date as m, count(*) as c
    from public.deal_event de
    where de.account_id = p_account_id
      and de.event_type = 'deal.stage_changed'
      and de.payload ->> 'stage' = 'closed_lost'
      and public.has_role_on_account(p_account_id)
    group by 1
  )
  select coalesce(added.m, lost.m), coalesce(added.c, 0), coalesce(lost.c, 0)
  from added
  full outer join lost on added.m = lost.m
  order by 1;
$$;

-- Median days a deal spent in each stage, measured between consecutive
-- deal.stage_changed events. The stage entered is payload->>'stage'; its dwell
-- time ends at the next move, so a deal still in its current stage is not yet
-- counted.
create or replace function public.analytics_median_days_in_stage(p_account_id uuid)
  returns table (stage text, median_days numeric)
  language sql security definer
  set search_path = '' as $$
  with moves as (
    select de.deal_id,
      de.payload ->> 'stage' as stage,
      de.created_at,
      lead(de.created_at) over (partition by de.deal_id order by de.created_at) as next_at
    from public.deal_event de
    where de.account_id = p_account_id
      and de.event_type = 'deal.stage_changed'
      and public.has_role_on_account(p_account_id)
  )
  select stage,
    percentile_cont(0.5) within group (order by extract(epoch from (next_at - created_at)) / 86400)
  from moves
  where next_at is not null
  group by stage;
$$;

grant execute on function public.analytics_deals_added_lost_by_month(uuid) to authenticated, service_role;
grant execute on function public.analytics_median_days_in_stage(uuid) to authenticated, service_role;

-- ===== schemas/69-comps-enums.sql =====
-- Enums for the Comparables module. data_class is the core RLS invariant: it is
-- set once at insert and frozen by a trigger, and every cross-tenant path
-- excludes proprietary rows. license status drives the proprietary read join;
-- activity confidence tracks how far an anonymized deal was qualified.

create type public.comp_data_class as enum (
  'external',
  'proprietary',
  'internal'
);

create type public.comp_license_status as enum (
  'active',
  'expired',
  'revoked'
);

create type public.activity_confidence as enum (
  'listed',
  'screened',
  'verified'
);

-- ===== schemas/70-comp-license.sql =====
-- A tenant's vendor-seat license (DealStats, BIZCOMPS, PeerComps). An active
-- license is what the comp read policy joins to before it will expose that
-- tenant's proprietary rows; an expired or revoked license closes that door
-- without touching the rows. storage_path points at the raw vendor export kept
-- encrypted behind the same proprietary predicate.

create table if not exists public.comp_license (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  vendor text not null,
  status public.comp_license_status not null default 'active',
  contributor_member boolean not null default false,
  seats int,
  starts_at timestamptz,
  expires_at timestamptz,
  storage_path text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_license enable row level security;

create index ix_comp_license_account on public.comp_license (account_id, status);

revoke all on public.comp_license from authenticated, service_role;
grant select on public.comp_license to authenticated;
grant select, insert, update, delete on public.comp_license to service_role;

create trigger comp_license_timestamps
  before insert or update on public.comp_license
  for each row execute function public.set_timestamps();

create policy comp_license_read on public.comp_license
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- ===== schemas/71-comp.sql =====
-- A comparable transaction. Every row carries a data_class that fixes its
-- visibility for the life of the row: external rows are platform-owned open data
-- served cross-tenant through comp_external; internal and proprietary rows are
-- tenant-owned and never cross a tenant boundary. proprietary rows are readable
-- only while the owning tenant holds an active comp_license. data_class is set at
-- insert and made immutable by comp_data_class_immutable so a row can never be
-- reclassified into a more permissive class. Money multiples are generated so no
-- writer can desynchronise them. account_id is null for external rows, and
-- comp_external_labeled holds every external row to a source and a human-readable
-- source_label so open-data rows always carry their data-source attribution.

create table if not exists public.comp (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete set null,
  data_class public.comp_data_class not null,
  source text not null,
  source_ref text,
  source_label text,
  price_basis text,
  confidence text,
  naics_code text,
  industry text,
  region text,
  state text,
  close_date date,
  asking_price numeric,
  sale_price numeric,
  revenue numeric,
  sde numeric,
  ebitda numeric,
  multiple_sde numeric generated always as (sale_price / nullif(sde, 0)) stored,
  multiple_revenue numeric generated always as (sale_price / nullif(revenue, 0)) stored,
  multiple_ebitda numeric generated always as (sale_price / nullif(ebitda, 0)) stored,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  constraint comp_external_labeled check (
    data_class <> 'external' or (source is not null and source_label is not null)
  )
);

alter table public.comp enable row level security;

create index ix_comp_data_class on public.comp (data_class);
create index ix_comp_account on public.comp (account_id, data_class);
create index ix_comp_deal on public.comp (deal_id);
create index ix_comp_naics on public.comp (naics_code);
create unique index ux_comp_source_ref on public.comp (source, source_ref) where source_ref is not null;

revoke all on public.comp from authenticated, service_role;
grant select on public.comp to authenticated;
grant select, insert, update, delete on public.comp to service_role;

create trigger comp_timestamps
  before insert or update on public.comp
  for each row execute function public.set_timestamps();

-- data_class is frozen after insert. Reclassifying a row would move it between
-- visibility rules, so the change is rejected outright.
create or replace function public.comp_data_class_immutable()
  returns trigger
  set search_path = '' as $$
begin
  if new.data_class <> old.data_class then
    raise exception 'comp.data_class is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger comp_data_class_immutable
  before update on public.comp
  for each row execute function public.comp_data_class_immutable();

-- internal rows are visible within the owning tenant or to a granted deal
-- participant; proprietary rows only while the tenant holds an active license.
-- external rows are not exposed here: they are served by comp_external.
create policy comp_read on public.comp
  for select to authenticated
  using (
    (
      data_class = 'internal'
      and (
        public.has_role_on_account(account_id)
        or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
      )
    )
    or (
      data_class = 'proprietary'
      and public.has_role_on_account(account_id)
      and exists (
        select 1 from public.comp_license l
        where l.account_id = comp.account_id
          and l.status = 'active'
          and (l.expires_at is null or l.expires_at > now())
      )
    )
  );

-- The cross-tenant open-data surface. Runs with the view owner's rights so
-- external rows are public, and filters to external so the proprietary and
-- internal rows behind the same table never leak. The comps data-class guard
-- asserts no view over comp omits this exclusion.
create view public.comp_external as
  select
    id, source, source_ref, naics_code, industry, region, state, close_date,
    asking_price, sale_price, revenue, sde, ebitda,
    multiple_sde, multiple_revenue, multiple_ebitda, created_at
  from public.comp
  where data_class = 'external';

grant select on public.comp_external to authenticated, service_role;

-- Keep internal and proprietary comps searchable inside their tenant. External
-- rows have no account and are cross-tenant, so they are not indexed here.
create or replace function public.comp_search_index()
  returns trigger
  security definer set search_path = '' as $$
begin
  if new.account_id is not null then
    insert into public.search_document (entity_type, entity_id, account_id, deal_id, tsv)
    values (
      'comp', new.id, new.account_id, new.deal_id,
      to_tsvector('english', coalesce(new.industry, '') || ' ' || coalesce(new.naics_code, '') || ' ' || coalesce(new.region, '') || ' ' || coalesce(new.source, ''))
    )
    on conflict (entity_type, entity_id) do update set
      account_id = excluded.account_id,
      deal_id = excluded.deal_id,
      tsv = excluded.tsv;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger comp_search_index
  after insert or update on public.comp
  for each row execute function public.comp_search_index();

-- ===== schemas/72-comp-import.sql =====
-- A vendor export import batch. One row per uploaded file, recording what was
-- imported and under which license, so proprietary comps trace back to the seat
-- that authorised them.

create table if not exists public.comp_import (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  license_id uuid references public.comp_license (id) on delete set null,
  vendor text not null,
  filename text,
  status text not null default 'pending',
  row_count int,
  storage_path text,
  imported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_import enable row level security;

create index ix_comp_import_account on public.comp_import (account_id);

revoke all on public.comp_import from authenticated, service_role;
grant select on public.comp_import to authenticated;
grant select, insert, update, delete on public.comp_import to service_role;

create trigger comp_import_timestamps
  before insert or update on public.comp_import
  for each row execute function public.set_timestamps();

create policy comp_import_read on public.comp_import
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- ===== schemas/73-comp-search-recipe.sql =====
-- A saved comp-search definition owned by a tenant. criteria holds the filter
-- set a search runs against the comp corpus.

create table if not exists public.comp_search_recipe (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_search_recipe enable row level security;

create index ix_comp_search_recipe_account on public.comp_search_recipe (account_id);

revoke all on public.comp_search_recipe from authenticated, service_role;
grant select on public.comp_search_recipe to authenticated;
grant select, insert, update, delete on public.comp_search_recipe to service_role;

create trigger comp_search_recipe_timestamps
  before insert or update on public.comp_search_recipe
  for each row execute function public.set_timestamps();

create policy comp_search_recipe_read on public.comp_search_recipe
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- ===== schemas/74-comp-set.sql =====
-- A curated collection of comps and its members. A member links a comp into a
-- set; the set carries the tenant ownership, so a member's visibility follows
-- the set it belongs to.

create table if not exists public.comp_set (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_set enable row level security;

create index ix_comp_set_account on public.comp_set (account_id);

revoke all on public.comp_set from authenticated, service_role;
grant select on public.comp_set to authenticated;
grant select, insert, update, delete on public.comp_set to service_role;

create trigger comp_set_timestamps
  before insert or update on public.comp_set
  for each row execute function public.set_timestamps();

create policy comp_set_read on public.comp_set
  for select to authenticated
  using (public.has_role_on_account(account_id));

create table if not exists public.comp_set_member (
  id uuid primary key default gen_random_uuid(),
  comp_set_id uuid not null references public.comp_set (id) on delete cascade,
  comp_id uuid not null references public.comp (id) on delete cascade,
  created_at timestamptz,
  created_by uuid references auth.users,
  unique (comp_set_id, comp_id)
);

alter table public.comp_set_member enable row level security;

create index ix_comp_set_member_set on public.comp_set_member (comp_set_id);

revoke all on public.comp_set_member from authenticated, service_role;
grant select on public.comp_set_member to authenticated;
grant select, insert, update, delete on public.comp_set_member to service_role;

create policy comp_set_member_read on public.comp_set_member
  for select to authenticated
  using (
    exists (
      select 1 from public.comp_set s
      where s.id = comp_set_id and public.has_role_on_account(s.account_id)
    )
  );

-- ===== schemas/75-benchmark.sql =====
-- Platform-managed benchmark multiples per vertical. Readable by every tenant;
-- written only by the platform through the service role, so authenticated has no
-- write grant. Rows carry a citation and an as-of date; survey rows exist only
-- where a citation backs them.

create table if not exists public.benchmark (
  id uuid primary key default gen_random_uuid(),
  naics_code text,
  industry text,
  metric text not null,
  low numeric,
  median numeric,
  high numeric,
  source_citation text,
  as_of date,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.benchmark enable row level security;

create index ix_benchmark_naics on public.benchmark (naics_code);

revoke all on public.benchmark from authenticated, service_role;
grant select on public.benchmark to authenticated;
grant select, insert, update, delete on public.benchmark to service_role;

create trigger benchmark_timestamps
  before insert or update on public.benchmark
  for each row execute function public.set_timestamps();

create policy benchmark_read on public.benchmark
  for select to authenticated
  using (true);

-- ===== schemas/76-comp-pool.sql =====
-- The anonymized closed-deal pool: one platform-owned row per contributed close,
-- already pseudonymised and banded by the anonymize module before it lands here.
-- The base table is never read by tenants; comp_pool_public is the only tenant
-- surface, and it hides any bucket thinner than the admin-set minimum (default
-- from config.comp_pool_min_bucket) and exposes only the coarse dimensions
-- (region, NAICS 3-digit), so a single contributor can never be singled out.
-- comp_pool_key holds the pseudonym-to-deal link and cross-tenant fingerprint and
-- is platform-admin-only: it is never granted to tenants and never enters a view.

create table if not exists public.comp_pool (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  region text,
  naics3 text,
  industry_short text,
  close_quarter text,
  sale_price_banded numeric,
  revenue_banded numeric,
  sde_banded numeric,
  sde_multiple numeric,
  outcome text,
  created_at timestamptz not null default now()
);

alter table public.comp_pool enable row level security;

create index ix_comp_pool_bucket on public.comp_pool (region, naics3, industry_short, close_quarter);

revoke all on public.comp_pool from authenticated, service_role;
grant select, insert, update, delete on public.comp_pool to service_role;

create table if not exists public.comp_pool_key (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  deal_id uuid references public.deal (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (pseudonym)
);

alter table public.comp_pool_key enable row level security;

create index ix_comp_pool_key_fingerprint on public.comp_pool_key (fingerprint);

-- Never granted to tenants: the pseudonym-to-deal link is platform-admin-only
-- and reached through the service role, so authenticated has no privilege here.
revoke all on public.comp_pool_key from authenticated, service_role;
grant select, insert, update, delete on public.comp_pool_key to service_role;

create table if not exists public.comp_pool_optin (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id)
);

alter table public.comp_pool_optin enable row level security;

revoke all on public.comp_pool_optin from authenticated, service_role;
grant select on public.comp_pool_optin to authenticated;
grant select, insert, update, delete on public.comp_pool_optin to service_role;

create trigger comp_pool_optin_timestamps
  before insert or update on public.comp_pool_optin
  for each row execute function public.set_timestamps();

create policy comp_pool_optin_read on public.comp_pool_optin
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- The k-anonymity read surface. Runs with the owner's rights over the base pool,
-- groups to the coarse bucket, and drops any bucket below the admin-set minimum.
create view public.comp_pool_public as
  select
    region, naics3, industry_short, close_quarter,
    count(*) as n,
    percentile_cont(0.5) within group (order by sde_multiple) as median_sde_multiple,
    percentile_cont(0.5) within group (order by sale_price_banded) as median_sale_price
  from public.comp_pool
  group by region, naics3, industry_short, close_quarter
  having count(*) >= (select c.comp_pool_min_bucket from public.config c limit 1);

grant select on public.comp_pool_public to authenticated, service_role;

-- ===== schemas/77-activity-pool.sql =====
-- The anonymized activity pool: one platform-owned row per deal from creation,
-- capturing how far it went and how it ended, pseudonymised and banded upstream.
-- Like comp_pool, tenants read only activity_pool_public, which coarsens to the
-- bucket and hides any bucket below the admin-set minimum. activity_pool_key is
-- platform-admin-only and never enters a view or export.

create table if not exists public.activity_pool (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  region text,
  naics3 text,
  industry_short text,
  created_quarter text,
  confidence public.activity_confidence,
  asking_price_banded numeric,
  loi_price_banded numeric,
  furthest_stage text,
  outcome text,
  outcome_reason text,
  loss_reason text,
  created_at timestamptz not null default now()
);

alter table public.activity_pool enable row level security;

create index ix_activity_pool_bucket on public.activity_pool (region, naics3, industry_short, created_quarter);

revoke all on public.activity_pool from authenticated, service_role;
grant select, insert, update, delete on public.activity_pool to service_role;

create table if not exists public.activity_pool_key (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  deal_id uuid references public.deal (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (pseudonym)
);

alter table public.activity_pool_key enable row level security;

create index ix_activity_pool_key_fingerprint on public.activity_pool_key (fingerprint);

-- Platform-admin-only, reached through the service role; no tenant privilege.
revoke all on public.activity_pool_key from authenticated, service_role;
grant select, insert, update, delete on public.activity_pool_key to service_role;

-- The k-anonymity read surface over the activity pool.
create view public.activity_pool_public as
  select
    region, naics3, industry_short, created_quarter, outcome,
    count(*) as n,
    percentile_cont(0.5) within group (order by asking_price_banded) as median_asking_price,
    percentile_cont(0.5) within group (order by loi_price_banded) as median_loi_price
  from public.activity_pool
  group by region, naics3, industry_short, created_quarter, outcome
  having count(*) >= (select c.comp_pool_min_bucket from public.config c limit 1);

grant select on public.activity_pool_public to authenticated, service_role;

-- ===== schemas/78-agent.sql =====
-- A non-human principal (workflow or external agent) registered under a tenant.
-- An agent rides its owner's Supabase identity and authenticates with its own
-- hashed API key; only the sha256 hash is stored, and it is excluded from the
-- authenticated select grant so a client can list and revoke agents without ever
-- reading the hash. Mirrors api_key.

create table if not exists public.agent (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  owner_user_id uuid not null references auth.users,
  name text not null,
  key_hash bytea not null,
  key_prefix text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);

alter table public.agent enable row level security;

create index ix_agent_account on public.agent (account_id);
create index ix_agent_prefix on public.agent (key_prefix);

revoke all on public.agent from authenticated, service_role;
grant select (id, account_id, owner_user_id, name, key_prefix, scopes, last_used_at, revoked_at, created_at, created_by)
  on public.agent to authenticated;
grant select, insert, update, delete on public.agent to service_role;

create policy agent_read on public.agent
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- Match a presented raw key against its stored hash, stamp last_used_at, and
-- return the owning account. Definer so the caller never reads key_hash.
create or replace function public.verify_agent_key(prefix text, raw text)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  matched_account uuid;
begin
  update public.agent
    set last_used_at = now()
    where key_prefix = verify_agent_key.prefix
      and key_hash = extensions.digest(verify_agent_key.raw, 'sha256')
      and revoked_at is null
    returning account_id into matched_account;
  return matched_account;
end;
$$;

grant execute on function public.verify_agent_key(text, text) to service_role;

-- ===== schemas/79-duplicate-candidate.sql =====
-- A softer-signal duplicate suggestion raised by DetectDuplicates. An exact
-- listing-id or URL match auto-flags the deal itself (deal.duplicate_of, set
-- through the event store); anything below that bar lands here for a human to
-- confirm or dismiss. Scoped to the tenant and to the deals it references.

create table if not exists public.duplicate_candidate (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  candidate_deal_id uuid not null references public.deal (id) on delete cascade,
  signal text,
  score numeric,
  status text not null default 'open',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, candidate_deal_id)
);

alter table public.duplicate_candidate enable row level security;

create index ix_duplicate_candidate_account on public.duplicate_candidate (account_id);
create index ix_duplicate_candidate_deal on public.duplicate_candidate (deal_id);

revoke all on public.duplicate_candidate from authenticated, service_role;
grant select on public.duplicate_candidate to authenticated;
grant select, insert, update, delete on public.duplicate_candidate to service_role;

create trigger duplicate_candidate_timestamps
  before insert or update on public.duplicate_candidate
  for each row execute function public.set_timestamps();

create policy duplicate_candidate_read on public.duplicate_candidate
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

-- ===== schemas/80-verification.sql =====
-- Diligence verification framework. A verification_run is one execution of the
-- reconciliation-check suite against a deal; each run yields verification_finding
-- rows tying a discrepancy to the checklist item or data-room document it
-- concerns. These are standalone conventional tables, not event-sourced deal
-- projections: the verification runner writes them through the service role
-- after its own permission check, so authenticated keeps SELECT gated on deal
-- access, mirroring dr_document, and never writes directly.

create type public.verification_severity as enum ('info', 'warning', 'error');
create type public.verification_run_status as enum ('queued', 'running', 'done', 'failed');
create type public.verification_finding_status as enum ('open', 'resolved', 'dismissed');

create table if not exists public.verification_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  status public.verification_run_status not null default 'queued',
  trigger text not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.verification_run enable row level security;

create index ix_verification_run_deal_status on public.verification_run (deal_id, status);

revoke all on public.verification_run from authenticated, service_role;
grant select on public.verification_run to authenticated;
grant select, insert, update, delete on public.verification_run to service_role;

create trigger verification_run_timestamps
  before insert or update on public.verification_run
  for each row execute function public.set_timestamps();

create policy verification_run_read on public.verification_run
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create table if not exists public.verification_finding (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  run_id uuid not null references public.verification_run (id) on delete cascade,
  check_key text not null,
  severity public.verification_severity not null,
  status public.verification_finding_status not null default 'open',
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  dr_document_id uuid references public.dr_document (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.verification_finding enable row level security;

create index ix_verification_finding_deal_status on public.verification_finding (deal_id, status);
create index ix_verification_finding_run on public.verification_finding (run_id);

revoke all on public.verification_finding from authenticated, service_role;
grant select on public.verification_finding to authenticated;
grant select, insert, update, delete on public.verification_finding to service_role;

create trigger verification_finding_timestamps
  before insert or update on public.verification_finding
  for each row execute function public.set_timestamps();

create policy verification_finding_read on public.verification_finding
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

-- Per-severity totals for a deal's findings; the comps activity_pool consumes
-- this to populate its finding_counts. security invoker so the deal-scoped RLS
-- on verification_finding governs which rows a caller counts.
create or replace function public.verification_finding_counts(p_deal_id uuid)
  returns table (error int, warning int, info int)
  language sql stable security invoker
  set search_path = '' as $$
  select
    count(*) filter (where f.severity = 'error')::int,
    count(*) filter (where f.severity = 'warning')::int,
    count(*) filter (where f.severity = 'info')::int
  from public.verification_finding f
  where f.deal_id = verification_finding_counts.p_deal_id;
$$;

grant execute on function public.verification_finding_counts(uuid) to authenticated, service_role;

-- ===== schemas/81-ai-retrieval.sql =====
-- Per-deal RAG retrieval over document_chunk. llm_endpoint gains chat_model:
-- `model` stays the embedding model, chat_model names the generation model used
-- for the answer call. match_document_chunks runs the ivfflat cosine search
-- inside one transaction so `set local ivfflat.probes` governs the scan for the
-- statement that follows; security invoker keeps the caller's deal-scoped RLS on
-- document_chunk in force, and the deal_id filter narrows the search to one deal.

alter table public.llm_endpoint add column chat_model text;

create or replace function public.match_document_chunks(
  p_deal_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count int)
  returns table (id uuid, content text, distance float)
  language plpgsql security invoker
  set search_path = '' as $$
begin
  set local ivfflat.probes = 10;
  return query
    select c.id, c.content,
           c.embedding operator(extensions.<=>) p_embedding as distance
    from public.document_chunk c
    where c.deal_id = match_document_chunks.p_deal_id
    order by c.embedding operator(extensions.<=>) p_embedding
    limit match_document_chunks.p_match_count;
end;
$$;

grant execute on function public.match_document_chunks(uuid, extensions.vector, int) to authenticated, service_role;

-- ===== schemas/82-admin-action-log.sql =====
-- Append-only audit of every mutating super-admin action. audit_event was
-- retired and deal_event is deal-scoped, so this is the platform-level record of
-- who did what to which account or user. Rows are written only by the
-- service-role client from inside is_super_admin()-gated server actions: there is
-- no insert, update, or delete grant to end users, which keeps the log immutable
-- from the application's reach. actor_user_id is a bare user reference, matching
-- deal_event.actor_ref, so purging a user never erases the audit trail. A
-- verified super admin may read it.

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_action_log enable row level security;

create index ix_admin_action_log_created_at on public.admin_action_log (created_at desc);

revoke all on public.admin_action_log from authenticated, service_role;
grant select on public.admin_action_log to authenticated;
grant insert on public.admin_action_log to service_role;

create policy admin_action_log_read on public.admin_action_log
  for select to authenticated
  using (public.is_super_admin());

-- Role test for an arbitrary principal. has_super_admin_role() can only read the
-- current caller's JWT; this reads the stored app_metadata for any user so the
-- admin actions can refuse to ban or delete a peer super admin.
create or replace function public.is_user_super_admin(target_user_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select coalesce(
    (select u.raw_app_meta_data ->> 'role' = 'super-admin'
       from auth.users u
      where u.id = target_user_id),
    false
  );
$$;

grant execute on function public.is_user_super_admin(uuid) to authenticated, service_role;

-- ===== schemas/83-industry.sql =====
-- Per-account industry taxonomy, two levels deep. A root industry carries a null
-- parent_id; a child points at its root. deal and comp classification reference
-- these rows, so every account owns and curates its own set. Renaming and
-- reparenting are plain updates and inserts gated on deals.manage; every member
-- may read.

create table if not exists public.industry (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  parent_id uuid references public.industry (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, name, parent_id)
);

alter table public.industry enable row level security;

create index ix_industry_account on public.industry (account_id);
create index ix_industry_account_parent on public.industry (account_id, parent_id);

revoke all on public.industry from authenticated, service_role;
grant select, insert, update, delete on public.industry to authenticated;
grant select, insert, update, delete on public.industry to service_role;

create trigger industry_timestamps
  before insert or update on public.industry
  for each row execute function public.set_timestamps();

create trigger industry_user_tracking
  before insert or update on public.industry
  for each row execute function public.set_user_tracking();

create policy industry_read on public.industry
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy industry_insert on public.industry
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy industry_update on public.industry
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy industry_delete on public.industry
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/84-location.sql =====
-- Normalized places shared across an account. One row per distinct
-- city/region/country, reused by deals and comps so a location is captured once
-- rather than retyped and re-spelled. metro is an optional rollup label. Curation
-- is gated on deals.manage; every member may read.

create table if not exists public.location (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  city text,
  region text,
  country text,
  metro text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, city, region, country)
);

alter table public.location enable row level security;

create index ix_location_account on public.location (account_id);

revoke all on public.location from authenticated, service_role;
grant select, insert, update, delete on public.location to authenticated;
grant select, insert, update, delete on public.location to service_role;

create trigger location_timestamps
  before insert or update on public.location
  for each row execute function public.set_timestamps();

create trigger location_user_tracking
  before insert or update on public.location
  for each row execute function public.set_user_tracking();

create policy location_read on public.location
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy location_insert on public.location
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy location_update on public.location
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy location_delete on public.location
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/85-deal-star.sql =====
-- A personal star: one user flagging one deal as a favorite. Stars are private to
-- the user who sets them, so there is no shared or account-wide view of who
-- starred what. account_id scopes the row to the deal's tenant so RLS can require
-- both own-row ownership and account membership. A star is set or cleared, never
-- edited, so the table is insert and delete only.

create table if not exists public.deal_star (
  user_id uuid not null references auth.users (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

alter table public.deal_star enable row level security;

create index ix_deal_star_deal on public.deal_star (deal_id);

revoke all on public.deal_star from authenticated, service_role;
grant select, insert, delete on public.deal_star to authenticated;
grant select, insert, delete on public.deal_star to service_role;

create policy deal_star_read on public.deal_star
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );

create policy deal_star_insert on public.deal_star
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );

create policy deal_star_delete on public.deal_star
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );

-- ===== schemas/86-deal-financials.sql =====
-- The adopted earnings figures for a deal: the single set of revenue/SDE/EBITDA
-- the account has committed to for this deal, sourced from a calc version. One
-- row per deal (1:1), written only by deal.financials_adopted through
-- project_deal_financials (65-deal-event-projectors.sql); authenticated and
-- service_role keep read only. source_calc_version_id references the calc version
-- these figures were adopted from. Its foreign key to calc_version is declared at
-- the end of 89-calc-version.sql, since schema files apply in filename order and
-- calc_version does not yet exist at this file.

create table if not exists public.deal_financials (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  adopted_revenue numeric,
  adopted_sde numeric,
  adopted_ebitda numeric,
  source_calc_version_id uuid,
  adopted_at timestamptz,
  adopted_by uuid references auth.users
);

alter table public.deal_financials enable row level security;

create index ix_deal_financials_account on public.deal_financials (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_financials from authenticated, service_role;
grant select on public.deal_financials to authenticated;
grant select on public.deal_financials to service_role;

create policy deal_financials_read on public.deal_financials
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy deal_financials_insert on public.deal_financials
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_financials_update on public.deal_financials
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_financials_delete on public.deal_financials
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/87-deal-profile.sql =====
-- The descriptive profile of a deal's target business: industry, place, size and
-- the owner's context. One row per deal (1:1), written only through the deal
-- aggregate: project_deal (65-deal-event-projectors.sql) upserts it from
-- deal.created and deal.updated alongside the deal row, so these fields travel on
-- the same event as description and asking_price rather than a separate one. The
-- quantitative figures (asking_price, revenue_ttm, sde_ttm, ebitda_ttm) stay on
-- the deal table; this holds only the descriptive attributes. authenticated and
-- service_role keep read only.

create table if not exists public.deal_profile (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  year_established int,
  industry_id uuid references public.industry (id) on delete set null,
  location_id uuid references public.location (id) on delete set null,
  location_raw text,
  employee_band text,
  website text,
  owner_role text,
  reason_for_sale text
);

alter table public.deal_profile enable row level security;

create index ix_deal_profile_account on public.deal_profile (account_id);
create index ix_deal_profile_industry on public.deal_profile (industry_id);
create index ix_deal_profile_location on public.deal_profile (location_id);
create index ix_deal_profile_account_industry on public.deal_profile (account_id, industry_id);
create index ix_deal_profile_account_location on public.deal_profile (account_id, location_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_profile from authenticated, service_role;
grant select on public.deal_profile to authenticated;
grant select on public.deal_profile to service_role;

create policy deal_profile_read on public.deal_profile
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy deal_profile_insert on public.deal_profile
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_profile_update on public.deal_profile
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_profile_delete on public.deal_profile
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/88-lead.sql =====
-- Marketing lead capture from the public OpenDealbook site. The contact form is
-- served to anonymous, pre-auth visitors, so rows are written only by the
-- service-role client from inside the contact server action; there is no insert
-- grant to anon or authenticated, which keeps the form off any direct client
-- insert path. Leads belong to the OpenDealbook vendor team, not to a tenant, so
-- there is no account_id and the row is platform-level. A verified super admin
-- may read it; no one updates or deletes it except the service role.

create table if not exists public.lead (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  company text,
  message text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.lead enable row level security;

create index ix_lead_created_at on public.lead (created_at desc);
create index ix_lead_email on public.lead (email);

revoke all on public.lead from authenticated, service_role;
grant select on public.lead to authenticated;
grant insert on public.lead to service_role;

create policy lead_read on public.lead
  for select to authenticated
  using (public.is_super_admin());

-- ===== schemas/89-calc-version.sql =====
-- A saved calculator scenario for a deal. Many versions per deal: each is a
-- scratch what-if the account keeps alongside the others, one flagged primary.
-- type selects which calculator shape the version holds (sde, deal, or working
-- capital). outputs_snapshot captures the key computed outputs at save time so a
-- version reads back without re-running the calculator. Conventional RLS; these
-- are scratch scenarios, not event-sourced.

create table if not exists public.calc_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  type text check (type in ('sde', 'deal', 'working_capital')),
  name text,
  notes text,
  is_primary boolean not null default false,
  outputs_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.calc_version enable row level security;

create index ix_calc_version_deal on public.calc_version (deal_id);
create index ix_calc_version_deal_type on public.calc_version (deal_id, type);

revoke all on public.calc_version from authenticated, service_role;
grant select, insert, update, delete on public.calc_version to authenticated;
grant select, insert, update, delete on public.calc_version to service_role;

create trigger calc_version_timestamps
  before insert or update on public.calc_version
  for each row execute function public.set_timestamps();

create trigger calc_version_user_tracking
  before insert or update on public.calc_version
  for each row execute function public.set_user_tracking();

create policy calc_version_read on public.calc_version
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy calc_version_insert on public.calc_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy calc_version_update on public.calc_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy calc_version_delete on public.calc_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- The deferred link from deal_financials (86) back to the calc version a deal's
-- adopted figures came from. Declared here, not inline in 86, because schema
-- files apply in filename order and calc_version does not exist until this file.
alter table public.deal_financials
  add constraint deal_financials_source_calc_version_fk
  foreign key (source_calc_version_id) references public.calc_version (id) on delete set null;

-- ===== schemas/90-sde-period.sql =====
-- A single earnings period inside an SDE calc version: a full year, a partial
-- year, or a trailing-twelve-month window, carrying the weight it contributes to
-- the blended figure. months is null or 12 for a full year; a partial year sets
-- months between 1 and 11, matching the @odb/calculators partial-year ruling.

create table if not exists public.sde_period (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null references public.calc_version (id) on delete cascade,
  label text,
  weight numeric,
  months int check (months is null or (months between 1 and 11)),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.sde_period enable row level security;

create index ix_sde_period_calc_version on public.sde_period (calc_version_id);

revoke all on public.sde_period from authenticated, service_role;
grant select, insert, update, delete on public.sde_period to authenticated;
grant select, insert, update, delete on public.sde_period to service_role;

create trigger sde_period_timestamps
  before insert or update on public.sde_period
  for each row execute function public.set_timestamps();

create trigger sde_period_user_tracking
  before insert or update on public.sde_period
  for each row execute function public.set_user_tracking();

create policy sde_period_read on public.sde_period
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy sde_period_insert on public.sde_period
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_period_update on public.sde_period
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_period_delete on public.sde_period
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/91-sde-line.sql =====
-- One line item within an SDE period. line_code identifies a row from the fixed
-- SDE catalog; custom_label names a row the user added outside the catalog.

create table if not exists public.sde_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  period_id uuid not null references public.sde_period (id) on delete cascade,
  line_code text,
  custom_label text,
  amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.sde_line enable row level security;

create index ix_sde_line_period on public.sde_line (period_id);

revoke all on public.sde_line from authenticated, service_role;
grant select, insert, update, delete on public.sde_line to authenticated;
grant select, insert, update, delete on public.sde_line to service_role;

create trigger sde_line_timestamps
  before insert or update on public.sde_line
  for each row execute function public.set_timestamps();

create trigger sde_line_user_tracking
  before insert or update on public.sde_line
  for each row execute function public.set_user_tracking();

create policy sde_line_read on public.sde_line
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy sde_line_insert on public.sde_line
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_line_update on public.sde_line
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_line_delete on public.sde_line
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/92-deal-calc-input.sql =====
-- The input set for a Deal calc version, one row per version. inputs holds the
-- acquisition, P&L, SDE, and growth fields the Deal calculator consumes.
-- deal_box_id links the acquisition criteria this calc was framed against.
-- imported_from_version_id records the SDE calc version a Deal calc pulled its
-- earnings from, so later drift between the two stays visible. The unique
-- constraint on calc_version_id is the index for lookups by version.

create table if not exists public.deal_calc_input (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null unique references public.calc_version (id) on delete cascade,
  inputs jsonb not null default '{}'::jsonb,
  deal_box_id uuid references public.deal_box (id),
  imported_from_version_id uuid references public.calc_version (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_calc_input enable row level security;

revoke all on public.deal_calc_input from authenticated, service_role;
grant select, insert, update, delete on public.deal_calc_input to authenticated;
grant select, insert, update, delete on public.deal_calc_input to service_role;

create trigger deal_calc_input_timestamps
  before insert or update on public.deal_calc_input
  for each row execute function public.set_timestamps();

create trigger deal_calc_input_user_tracking
  before insert or update on public.deal_calc_input
  for each row execute function public.set_user_tracking();

create policy deal_calc_input_read on public.deal_calc_input
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_calc_input_insert on public.deal_calc_input
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_calc_input_update on public.deal_calc_input
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_calc_input_delete on public.deal_calc_input
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/93-funding-source.sql =====
-- DB persistence of the funding-source shape shared with @odb/calculators: one
-- row per source in a capital stack. The owner is always a calc version, so
-- calc_version_id is a required foreign key with real referential integrity and
-- cascade behavior; offers carry their funding in the offer terms jsonb rather
-- than as funding_source rows.

create table if not exists public.funding_source (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null references public.calc_version (id) on delete cascade,
  type text check (type in (
    'sba_7a', 'sba_504', 'conventional', 'seller_financing', 'cash_equity',
    'heloc', 'robs_401k', 'investor_equity', 'mezzanine', 'other'
  )),
  amount numeric,
  pct numeric,
  rate numeric,
  term_years numeric,
  guarantee_fee numeric,
  standby_months int,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.funding_source enable row level security;

create index ix_funding_source_calc_version on public.funding_source (calc_version_id);

revoke all on public.funding_source from authenticated, service_role;
grant select, insert, update, delete on public.funding_source to authenticated;
grant select, insert, update, delete on public.funding_source to service_role;

create trigger funding_source_timestamps
  before insert or update on public.funding_source
  for each row execute function public.set_timestamps();

create trigger funding_source_user_tracking
  before insert or update on public.funding_source
  for each row execute function public.set_user_tracking();

create policy funding_source_read on public.funding_source
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy funding_source_insert on public.funding_source
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy funding_source_update on public.funding_source
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy funding_source_delete on public.funding_source
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/94-deal-thesis.sql =====
-- The buyer's internal thesis for a deal, one row per deal. Broker- and
-- internal-facing narrative only; it never appears in the LOI. Field length
-- limits live in the app-layer Zod schema, not here. The unique constraint on
-- deal_id is the index for lookups by deal.

create table if not exists public.deal_thesis (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null unique references public.deal (id) on delete cascade,
  why_this_business text,
  main_concerns text,
  post_acquisition_plan text,
  owner_involvement text,
  additional_info text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_thesis enable row level security;

revoke all on public.deal_thesis from authenticated, service_role;
grant select, insert, update, delete on public.deal_thesis to authenticated;
grant select, insert, update, delete on public.deal_thesis to service_role;

create trigger deal_thesis_timestamps
  before insert or update on public.deal_thesis
  for each row execute function public.set_timestamps();

create trigger deal_thesis_user_tracking
  before insert or update on public.deal_thesis
  for each row execute function public.set_user_tracking();

create policy deal_thesis_read on public.deal_thesis
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_thesis_insert on public.deal_thesis
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_thesis_update on public.deal_thesis
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_thesis_delete on public.deal_thesis
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/95-attachment.sql =====
-- A file attached to a deal, task, calc version, or offer version. The owner is
-- polymorphic across those four kinds, so it is modeled as an owner_kind tag plus
-- a generic owner_id rather than four nullable foreign keys. offer_version is a
-- Lane 3 owner kind and is already allowed here so Lane 3 adds no migration to
-- this table. storage_path holds the object-store key, matching the data-room
-- storage convention (dr_document, upload_item). An attachment is created and
-- deleted, never edited, so the table carries created_at/created_by only and has
-- no update path.

create table if not exists public.attachment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  owner_kind text check (owner_kind in ('deal', 'task', 'calc_version', 'offer_version')),
  owner_id uuid not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users default auth.uid()
);

alter table public.attachment enable row level security;

create index ix_attachment_owner on public.attachment (owner_kind, owner_id);

revoke all on public.attachment from authenticated, service_role;
grant select, insert, delete on public.attachment to authenticated;
grant select, insert, delete on public.attachment to service_role;

create policy attachment_read on public.attachment
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy attachment_insert on public.attachment
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy attachment_delete on public.attachment
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/96-offer.sql =====
-- An offer on a deal: the head of the offer lifecycle saga. Status is folded
-- from the offer.* events in the deal_event log; current_version_id points at
-- the latest offer_version. Many offers per deal. Deal-scoped; managed with
-- deals.manage. Written only through append_deal_event; project_offer
-- (65-deal-event-projectors.sql) runs security definer as the table owner, so
-- authenticated and service_role keep read only. current_version_id is a plain
-- uuid pointer to offer_version (no FK), mirroring contract.current_version.

create table if not exists public.offer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  status text not null check (status in ('draft', 'submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired')),
  current_version_id uuid,
  submitted_at timestamptz,
  responded_at timestamptz
);

alter table public.offer enable row level security;

create index ix_offer_deal on public.offer (deal_id);
create index ix_offer_account on public.offer (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.offer from authenticated, service_role;
grant select on public.offer to authenticated;
grant select on public.offer to service_role;

create policy offer_read on public.offer
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy offer_insert on public.offer
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_update on public.offer
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_delete on public.offer
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/97-offer-version.sql =====
-- An immutable revision of an offer. number is unique within an offer. The
-- projector only ever inserts these rows (offer.version_added), never updates
-- them, so a submitted version is frozen. terms holds the versioned offer terms
-- validated app-side by offerTermsSchema (funding, contingencies, and the rest
-- live inside this jsonb, not in sibling tables). Deal-scoped through the parent
-- offer's deal; managed with deals.manage. calc_version_id is a plain uuid for
-- now; a later reconcile adds the foreign key to calc_version once that table
-- exists, the same deferral deal_financials.source_calc_version_id uses.

create table if not exists public.offer_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  offer_id uuid not null references public.offer (id) on delete cascade,
  number int not null,
  author_side text not null check (author_side in ('buyer', 'seller')),
  purchase_price numeric not null,
  real_estate_portion numeric,
  target_close_date date,
  offer_expires_at timestamptz,
  exclusivity_days int,
  diligence_days int,
  terms jsonb not null,
  calc_version_id uuid,
  approved_by uuid references auth.users,
  approved_at timestamptz,
  unique (offer_id, number)
);

alter table public.offer_version enable row level security;

create index ix_offer_version_offer on public.offer_version (offer_id);
create index ix_offer_version_account on public.offer_version (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner and only inserts. authenticated and service_role keep read
-- only.
revoke all on public.offer_version from authenticated, service_role;
grant select on public.offer_version to authenticated;
grant select on public.offer_version to service_role;

create policy offer_version_read on public.offer_version
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select o.deal_id from public.offer o where o.id = offer_id),
      'deals.manage'
    )
  );

create policy offer_version_insert on public.offer_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_version_update on public.offer_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_version_delete on public.offer_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/98-outreach-sequence.sql =====
-- Account-owned cold-outreach sequence template. Every account owns its own set,
-- seeded from the default sequences in @odb/outreach at account creation. Steps
-- live in outreach_step; an enrollment points at one sequence by id. is_default
-- marks a seeded sequence so the enroll path can pick one without a name match.

create table if not exists public.outreach_sequence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_sequence enable row level security;

create index ix_outreach_sequence_account on public.outreach_sequence (account_id);

revoke all on public.outreach_sequence from authenticated, service_role;
grant select, insert, update, delete on public.outreach_sequence to authenticated;
grant select, insert, update, delete on public.outreach_sequence to service_role;

create trigger outreach_sequence_timestamps
  before insert or update on public.outreach_sequence
  for each row execute function public.set_timestamps();

create trigger outreach_sequence_user_tracking
  before insert or update on public.outreach_sequence
  for each row execute function public.set_user_tracking();

create policy outreach_sequence_read on public.outreach_sequence
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_sequence_insert on public.outreach_sequence
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_sequence_update on public.outreach_sequence
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_sequence_delete on public.outreach_sequence
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- Ordered steps of a sequence. ordinal is the 1-based position the dispatcher
-- matches against outreach_enrollment.current_step; delay_days spaces a step from
-- the one before it. account_id is denormalised from the parent sequence so reads
-- stay account-scoped without a join, mirroring verification_finding.
create table if not exists public.outreach_step (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  sequence_id uuid not null references public.outreach_sequence (id) on delete cascade,
  ordinal int not null,
  delay_days int not null default 0,
  subject text not null,
  body text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (sequence_id, ordinal)
);

alter table public.outreach_step enable row level security;

create index ix_outreach_step_sequence on public.outreach_step (sequence_id);

revoke all on public.outreach_step from authenticated, service_role;
grant select, insert, update, delete on public.outreach_step to authenticated;
grant select, insert, update, delete on public.outreach_step to service_role;

create trigger outreach_step_timestamps
  before insert or update on public.outreach_step
  for each row execute function public.set_timestamps();

create trigger outreach_step_user_tracking
  before insert or update on public.outreach_step
  for each row execute function public.set_user_tracking();

create policy outreach_step_read on public.outreach_step
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_step_insert on public.outreach_step
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_step_update on public.outreach_step
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_step_delete on public.outreach_step
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- ===== schemas/99-outreach-runtime.sql =====
-- Cold-outreach runtime state the Temporal dispatcher (packages/workflows
-- outreachDispatch) reads and writes against a PINNED CONTRACT declared in
-- packages/workflows/src/outreach/dispatch.ts. The dispatcher reaches these
-- tables through the service-role admin client with an untyped handle; a Wave-3
-- reconcile regenerates the Database types and drops that cast. The columns here
-- match the pinned row shapes so the swap is mechanical. Two shapes are carried
-- deliberately from the contract: outreach_enrollment.sequence_id is a uuid key
-- into outreach_sequence here while the current dispatcher still resolves it as a
-- string key against DEFAULT_OUTREACH_SEQUENCES, and outreach_message.step_id is
-- the integer ordinal the dispatcher writes from enrollment.current_step, not a
-- foreign key into outreach_step. outreach_message carries no account_id: the
-- dispatcher resolves the account through the parent enrollment, so its RLS joins
-- back through outreach_enrollment the way offer_version joins through offer.

-- Per-account send governor. One row per account, read with maybeSingle by the
-- dispatcher to size the daily batch, so account_id is the primary key.
create table if not exists public.outreach_setting (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  daily_cap int not null,
  max_touches int not null default 1,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_setting enable row level security;

revoke all on public.outreach_setting from authenticated, service_role;
grant select, insert, update, delete on public.outreach_setting to authenticated;
grant select, insert, update, delete on public.outreach_setting to service_role;

create trigger outreach_setting_timestamps
  before insert or update on public.outreach_setting
  for each row execute function public.set_timestamps();

create trigger outreach_setting_user_tracking
  before insert or update on public.outreach_setting
  for each row execute function public.set_user_tracking();

create policy outreach_setting_read on public.outreach_setting
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_setting_insert on public.outreach_setting
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_setting_update on public.outreach_setting
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_setting_delete on public.outreach_setting
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- The account's sending mailbox, brokered through Nango. The dispatcher reads one
-- active connection per account with maybeSingle, so account_id is unique; a
-- connection is created and refreshed by the service role from the Nango callback
-- and manageable by the account owner. status gates sending (dispatcher skips any
-- value other than 'active').
create table if not exists public.mailbox_connection (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references auth.users,
  provider text not null check (provider in ('gmail', 'microsoft')),
  nango_connection_id text not null,
  provider_config_key text not null,
  email_address text not null,
  status text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id)
);

alter table public.mailbox_connection enable row level security;

revoke all on public.mailbox_connection from authenticated, service_role;
grant select, insert, update on public.mailbox_connection to authenticated;
grant select, insert, update on public.mailbox_connection to service_role;

create trigger mailbox_connection_timestamps
  before insert or update on public.mailbox_connection
  for each row execute function public.set_timestamps();

create trigger mailbox_connection_user_tracking
  before insert or update on public.mailbox_connection
  for each row execute function public.set_user_tracking();

create policy mailbox_connection_read on public.mailbox_connection
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy mailbox_connection_insert on public.mailbox_connection
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy mailbox_connection_update on public.mailbox_connection
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- One target's progress through a sequence. The dispatcher selects queued rows
-- whose next_send_at is due, sends the current step, then advances status and
-- sent_count. firm_id and contact_id are optional sources for the merge context;
-- target_email is the address actually sent to.
create table if not exists public.outreach_enrollment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  sequence_id uuid not null references public.outreach_sequence (id),
  firm_id uuid references public.firm (id) on delete set null,
  contact_id uuid references public.contact (id) on delete set null,
  target_email text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'replied', 'stopped', 'suppressed', 'failed')),
  current_step int not null default 1,
  next_send_at timestamptz not null default now(),
  sent_count int not null default 0,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_enrollment enable row level security;

create index ix_outreach_enrollment_due
  on public.outreach_enrollment (account_id, status, next_send_at);

revoke all on public.outreach_enrollment from authenticated, service_role;
grant select, insert, update, delete on public.outreach_enrollment to authenticated;
grant select, insert, update, delete on public.outreach_enrollment to service_role;

create trigger outreach_enrollment_timestamps
  before insert or update on public.outreach_enrollment
  for each row execute function public.set_timestamps();

create trigger outreach_enrollment_user_tracking
  before insert or update on public.outreach_enrollment
  for each row execute function public.set_user_tracking();

create policy outreach_enrollment_read on public.outreach_enrollment
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_enrollment_insert on public.outreach_enrollment
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_enrollment_update on public.outreach_enrollment
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_enrollment_delete on public.outreach_enrollment
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- One send attempt against an enrollment, appended by the dispatcher on success
-- and on failure. step_id is the integer ordinal taken from the enrollment's
-- current_step at send time. No account_id: the account is resolved through the
-- parent enrollment, and RLS joins back through it.
create table if not exists public.outreach_message (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.outreach_enrollment (id) on delete cascade,
  step_id int not null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  error text
);

alter table public.outreach_message enable row level security;

create index ix_outreach_message_enrollment on public.outreach_message (enrollment_id);
create index ix_outreach_message_to_email on public.outreach_message (to_email);

revoke all on public.outreach_message from authenticated, service_role;
grant select, insert, update on public.outreach_message to authenticated;
grant select, insert, update on public.outreach_message to service_role;

create policy outreach_message_read on public.outreach_message
  for select to authenticated
  using (
    public.has_role_on_account(
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id)
    )
  );

create policy outreach_message_insert on public.outreach_message
  for insert to authenticated
  with check (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  );

create policy outreach_message_update on public.outreach_message
  for update to authenticated
  using (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  )
  with check (
    public.has_permission(
      (select auth.uid()),
      (select e.account_id from public.outreach_enrollment e where e.id = outreach_message.enrollment_id),
      'deals.manage'
    )
  );

-- Addresses the account must never contact again. The dispatcher filters due
-- enrollments against this set; rows arrive from the owner (manual, opt_out) or
-- from the service role on a bounce or reply.
create table if not exists public.outreach_suppression (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('opt_out', 'bounce', 'manual', 'replied')),
  created_at timestamptz not null default now()
);

alter table public.outreach_suppression enable row level security;

create index ix_outreach_suppression_account_email
  on public.outreach_suppression (account_id, email);

revoke all on public.outreach_suppression from authenticated, service_role;
grant select, insert, update, delete on public.outreach_suppression to authenticated;
grant select, insert, update, delete on public.outreach_suppression to service_role;

create policy outreach_suppression_read on public.outreach_suppression
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_suppression_insert on public.outreach_suppression
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_suppression_update on public.outreach_suppression
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_suppression_delete on public.outreach_suppression
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
