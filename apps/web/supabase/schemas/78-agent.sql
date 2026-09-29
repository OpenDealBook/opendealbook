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
