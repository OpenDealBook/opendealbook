begin;
select no_plan();

select tests.create_user('rf_admin');
select tests.create_user('rf_normal');

update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'super-admin')
  where id = tests.get_uid('rf_admin');

insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.get_uid('rf_admin'), 'totp', 'verified', now(), now());

select tests.login_as_service_role();

select lives_ok(
  $$ insert into public.relay_failed_event (relay_name, global_seq, error, attempts)
     values ('workflow-events', 41, 'runner unreachable', 5) $$,
  'a relay sets aside an event it failed'
);

select throws_ok(
  $$ insert into public.relay_failed_event (relay_name, global_seq, error, attempts)
     values ('workflow-events', 41, 'again', 5) $$,
  '23505', null,
  'an event is set aside once per relay'
);

select lives_ok(
  $$ insert into public.relay_failed_event (relay_name, global_seq, error, attempts)
     values ('deal-notifications', 41, 'mailer down', 5) $$,
  'another relay sets aside the same event separately'
);

select lives_ok(
  $$ update public.relay_failed_event set retried_at = now(), resolved_at = now()
     where relay_name = 'workflow-events' and global_seq = 41 $$,
  'the service records a retry and its resolution'
);

select is(
  (select row(retried_at is null, resolved_at is null)::text from public.relay_failed_event
   where relay_name = 'deal-notifications'),
  '(t,t)',
  'a set-aside event starts unretried and unresolved'
);

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', tests.get_uid('rf_admin'),
    'role', 'authenticated',
    'aal', 'aal2',
    'app_metadata', json_build_object('role', 'super-admin')
  )::text,
  true
);

select is(
  (select count(*)::int from public.relay_failed_event where relay_name in ('workflow-events', 'deal-notifications') and global_seq = 41),
  2,
  'a verified super admin reads set-aside events'
);

select throws_ok(
  $$ update public.relay_failed_event set resolved_at = now() $$,
  '42501', null,
  'a super admin retries through the service, not by writing rows'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.get_uid('rf_normal'), 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);

select is((select count(*)::int from public.relay_failed_event), 0, 'an ordinary user sees no set-aside events');

select throws_ok(
  $$ insert into public.relay_failed_event (relay_name, global_seq, error, attempts) values ('x', 1, 'y', 5) $$,
  '42501', null,
  'an ordinary user cannot set aside events'
);

select * from finish();
rollback;
