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
