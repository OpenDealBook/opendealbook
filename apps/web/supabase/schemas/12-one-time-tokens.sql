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
