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
grant insert (account_id, name, key_hash, key_prefix, scopes, created_by) on public.api_key to authenticated;
grant select, insert, update, delete on public.api_key to service_role;

create policy api_key_read on public.api_key
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'));

create policy api_key_insert on public.api_key
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission((select auth.uid()), account_id, 'api_keys.manage')
  );

create policy api_key_update on public.api_key
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'api_keys.manage'));

-- Revocation is final for users; only a server job may lift it.
create or replace function tuckin.refuse_api_key_unrevoke()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if old.revoked_at is not null and new.revoked_at is null and auth.uid() is not null then
    raise exception 'a revoked API key stays revoked' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger refuse_api_key_unrevoke
  before update on public.api_key
  for each row execute function tuckin.refuse_api_key_unrevoke();

-- Losing api_keys.manage revokes the creator's keys for good, so a later
-- re-grant does not revive them. The sweep runs after any change that can take
-- the permission away, whichever path made it.
create or replace function tuckin.revoke_api_keys_without_holder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.api_key k
    set revoked_at = now()
    where k.revoked_at is null
      and not public.has_permission(k.created_by, k.account_id, 'api_keys.manage');
  return null;
end;
$$;

create trigger revoke_api_keys_without_holder
  after update of account_role or delete on public.accounts_memberships
  for each statement execute function tuckin.revoke_api_keys_without_holder();

create trigger revoke_api_keys_without_holder
  after update or delete on public.role_permissions
  for each statement execute function tuckin.revoke_api_keys_without_holder();

create trigger revoke_api_keys_without_holder
  after update of primary_owner_user_id on public.accounts
  for each statement execute function tuckin.revoke_api_keys_without_holder();

-- Match a presented raw key against its stored hash, stamp last_used_at, and
-- return the owning account. Runs as definer so the caller never needs read
-- access to key_hash. The creator check backs up the revocation sweep above:
-- a key never verifies once its creator lacks api_keys.manage, even if a sweep
-- has not run.
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
      and public.has_permission(created_by, account_id, 'api_keys.manage')
    returning account_id into matched_account;
  return matched_account;
end;
$$;

grant execute on function public.verify_api_key(text, text) to service_role;
