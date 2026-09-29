begin;
select plan(6);

select tests.create_user('log_admin');
select tests.create_user('log_normal');

-- Promote log_admin to a full super admin: the role in app_metadata plus a
-- verified TOTP factor, which is what is_super_admin() requires.
update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'super-admin')
  where id = tests.get_uid('log_admin');

insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.get_uid('log_admin'), 'totp', 'verified', now(), now());

select is(
  public.is_user_super_admin(tests.get_uid('log_admin')),
  true,
  'is_user_super_admin is true for a user holding the super-admin role'
);

select is(
  public.is_user_super_admin(tests.get_uid('log_normal')),
  false,
  'is_user_super_admin is false for an ordinary user'
);

-- Only the service role may append a row.
select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.admin_action_log (actor_user_id, action, target_type, target_id, detail)
     values (tests.get_uid('log_admin'), 'account.delete', 'account', 'acc-1', '{}'::jsonb) $$,
  'service_role can append an admin action log row'
);

-- A verified super admin reads the log.
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', tests.get_uid('log_admin'),
    'role', 'authenticated',
    'aal', 'aal2',
    'app_metadata', json_build_object('role', 'super-admin')
  )::text,
  true
);
select is(
  (select count(*)::int from public.admin_action_log),
  1,
  'a verified super admin reads admin action log rows'
);

-- An ordinary authenticated user is refused by the read policy.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.get_uid('log_normal'), 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
select is(
  (select count(*)::int from public.admin_action_log),
  0,
  'an ordinary authenticated user sees no admin action log rows'
);

-- The log is append-only from the application: authenticated has no insert.
select throws_ok(
  $$ insert into public.admin_action_log (actor_user_id, action, target_type, target_id)
     values (tests.get_uid('log_normal'), 'x', 'y', 'z') $$,
  '42501',
  'permission denied for table admin_action_log',
  'authenticated cannot insert into the admin action log'
);

select * from finish();
rollback;
