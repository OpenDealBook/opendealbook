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
  'participants.manage'
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
  billing_provider public.billing_provider not null default 'stripe'
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
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.updated_by := auth.uid();
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
-- Account-scoped in-app notifications. Members read; only the dismissed flag is
-- user-writable.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
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

revoke all on public.notifications from authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (dismissed) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

create policy notifications_read on public.notifications
  for select to authenticated
  using (account_id = (select auth.uid()) or public.has_role_on_account(account_id));

create policy notifications_update on public.notifications
  for update to authenticated
  using (account_id = (select auth.uid()) or public.has_role_on_account(account_id));

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
  stage text not null default 'pre_nda',
  notes text,
  deal_box_version int,
  close_date date,
  broker_contact_id uuid references public.contact (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal enable row level security;

create index ix_deal_account_stage on public.deal (account_id, stage);
create index ix_deal_firm on public.deal (firm_id);
create index ix_deal_owner on public.deal (owner_user_id);

revoke all on public.deal from authenticated, service_role;
grant select, insert, update, delete on public.deal to authenticated;
grant select, insert, update, delete on public.deal to service_role;

create trigger deal_timestamps
  before insert or update on public.deal
  for each row execute function public.set_timestamps();

create trigger deal_user_tracking
  before insert or update on public.deal
  for each row execute function public.set_user_tracking();

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

revoke all on public.deal_participant from authenticated, service_role;
grant select, insert, update, delete on public.deal_participant to authenticated;
grant select, insert, update, delete on public.deal_participant to service_role;

create trigger deal_participant_timestamps
  before insert or update on public.deal_participant
  for each row execute function public.set_timestamps();

create trigger deal_participant_user_tracking
  before insert or update on public.deal_participant
  for each row execute function public.set_user_tracking();

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
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.checklist_item enable row level security;

create index ix_checklist_item_deal_status on public.checklist_item (deal_id, status);
create index ix_checklist_item_account on public.checklist_item (account_id);

revoke all on public.checklist_item from authenticated, service_role;
grant select, insert, update, delete on public.checklist_item to authenticated;
grant select, insert, update, delete on public.checklist_item to service_role;

create trigger checklist_item_timestamps
  before insert or update on public.checklist_item
  for each row execute function public.set_timestamps();

create trigger checklist_item_user_tracking
  before insert or update on public.checklist_item
  for each row execute function public.set_user_tracking();

create policy checklist_item_read on public.checklist_item
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
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

revoke all on public.approval from authenticated, service_role;
grant select, insert, update, delete on public.approval to authenticated;
grant select, insert, update, delete on public.approval to service_role;

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

-- ===== schemas/27-audit-event.sql =====
-- Append-only audit trail. Rows are never updated or deleted: no update/delete
-- grant and no update/delete policy exist, so those operations are refused.

create table if not exists public.audit_event (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  actor_user_id uuid not null default auth.uid() references auth.users,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_event enable row level security;

create index ix_audit_event_account on public.audit_event (account_id, created_at);
create index ix_audit_event_deal on public.audit_event (deal_id, created_at);

revoke all on public.audit_event from authenticated, service_role;
grant select, insert on public.audit_event to authenticated;
grant select, insert on public.audit_event to service_role;

create policy audit_event_read on public.audit_event
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );

create policy audit_event_insert on public.audit_event
  for insert to authenticated
  with check (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );

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
  ('admin', 'deals.create'),
  ('admin', 'deals.manage'),
  ('admin', 'checklists.manage'),
  ('admin', 'participants.manage'),
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
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy buyer_profile_update on public.buyer_profile
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy buyer_profile_delete on public.buyer_profile
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

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
