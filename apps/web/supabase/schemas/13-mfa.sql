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
