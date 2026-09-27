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
  metadata jsonb default '{}'::jsonb
) returns text
  language plpgsql security definer
  set search_path = '' as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.nonces (token_hash, purpose, user_id, account_id, metadata, expires_at)
  values (
    tuckin.hash_token(token),
    create_nonce.purpose,
    create_nonce.user_id,
    create_nonce.account_id,
    create_nonce.metadata,
    now() + make_interval(secs => expires_in_seconds)
  );
  return token;
end;
$$;

grant execute on function public.create_nonce(text, uuid, uuid, integer, jsonb) to service_role;

-- Redeem a nonce, marking it used. Returns the nonce id on success.
create or replace function public.verify_nonce(token text, purpose text)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  nonce_id uuid;
begin
  update public.nonces
    set used_at = now()
    where token_hash = tuckin.hash_token(token)
      and nonces.purpose = verify_nonce.purpose
      and used_at is null
      and expires_at > now()
  returning id into nonce_id;

  if nonce_id is null then
    raise exception 'invalid, expired, or already used token';
  end if;

  return nonce_id;
end;
$$;

grant execute on function public.verify_nonce(text, text) to service_role;
