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
