begin;
select no_plan();

select tests.create_user('tz_owner');
select tests.create_user('tz_other');

select tests.login_as_service_role();
select public.create_team_account('Zoneco', tests.get_uid('tz_owner'), 'zoneco');

select is(
  (select timezone from public.accounts where id = tests.get_uid('tz_owner')),
  null,
  'a new person has no time zone'
);

select tests.login_as('tz_owner');

select lives_ok(
  $$ update public.accounts set timezone = 'America/New_York' where id = tests.get_uid('tz_owner') $$,
  'a person sets their own time zone'
);

select tests.login_as_service_role();
select is(
  (select timezone from public.accounts where id = tests.get_uid('tz_owner')),
  'America/New_York',
  'the time zone is stored on the personal account'
);

select tests.login_as('tz_owner');

select throws_ok(
  $$ update public.accounts set timezone = 'Mars/Olympus_Mons' where id = tests.get_uid('tz_owner') $$,
  '23514',
  null,
  'an unknown time zone is refused'
);

select throws_ok(
  $$ update public.accounts set timezone = 'Europe/Paris' where id = tests.account_id('zoneco') $$,
  '23514',
  null,
  'a team account has no time zone'
);

select tests.login_as('tz_other');
update public.accounts set timezone = 'Asia/Tokyo' where id = tests.get_uid('tz_owner');

select tests.login_as_service_role();
select is(
  (select timezone from public.accounts where id = tests.get_uid('tz_owner')),
  'America/New_York',
  'nobody else changes a person''s time zone'
);

select * from finish();
rollback;
