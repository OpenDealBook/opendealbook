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
