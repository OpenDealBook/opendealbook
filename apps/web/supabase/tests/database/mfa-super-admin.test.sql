begin;
select no_plan();

select tests.create_user('recovery_user');
select tests.create_user('super_candidate');

-- Recovery codes: mint at aal2, redeem at aal1, and confirm single use.
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.get_uid('recovery_user'), 'role', 'authenticated', 'aal', 'aal2')::text,
  true
);

select lives_ok(
  $$ select public.replace_mfa_recovery_codes(array['ABCD-1234-EFGH', 'WXYZ-5678-IJKL']) $$,
  'a user at aal2 can mint recovery codes'
);

-- Drop to aal1, the assurance level during the recovery flow itself.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.get_uid('recovery_user'), 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);

select is(
  public.consume_mfa_recovery_code('abcd-1234-efgh'),
  tests.get_uid('recovery_user'),
  'consuming a valid code returns the owning user id and normalizes formatting'
);

select is(
  public.consume_mfa_recovery_code('abcd-1234-efgh'),
  null::uuid,
  'consuming the same code a second time returns null'
);

-- Super admin gate: the role alone is not enough without aal2.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', tests.get_uid('super_candidate'),
    'role', 'authenticated',
    'aal', 'aal1',
    'app_metadata', json_build_object('role', 'super-admin')
  )::text,
  true
);

select is(public.has_super_admin_role(), true, 'has_super_admin_role reads the role from app_metadata at any aal');
select is(public.is_aal2(), false, 'is_aal2 is false for an aal1 session');
select is(public.is_super_admin(), false, 'is_super_admin is false without aal2 even when the role is present');

select * from finish();
rollback;
