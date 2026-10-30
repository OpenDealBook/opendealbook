begin;
select no_plan();

select tests.create_user('tz_owner');
select tests.create_user('tz_other');

select tests.login_as_service_role();
select public.create_team_account('Zoneco', tests.get_uid('tz_owner'), 'zoneco');
select public.create_team_account('Gmtco', tests.get_uid('tz_other'), 'gmtco');

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
  $$ update public.accounts set timezone = 'posix/America/New_York' where id = tests.get_uid('tz_owner') $$,
  '23514',
  null,
  'a posix zone the app cannot format is refused'
);

select throws_ok(
  $$ update public.accounts set timezone = 'posix/Asia/Tokyo' where id = tests.account_id('zoneco') $$,
  '23514',
  null,
  'a team account refuses a posix zone too'
);

select lives_ok(
  $$ update public.accounts set timezone = 'Europe/Paris' where id = tests.account_id('zoneco') $$,
  'a team account has its own time zone'
);

select tests.login_as('tz_other');
update public.accounts set timezone = 'Asia/Tokyo' where id = tests.get_uid('tz_owner');

select tests.login_as_service_role();
select is(
  (select timezone from public.accounts where id = tests.get_uid('tz_owner')),
  'America/New_York',
  'nobody else changes a person''s time zone'
);

reset role;
alter table public.accounts drop constraint accounts_timezone_known;
update public.accounts set timezone = 'US/Eastern' where id = tests.account_id('zoneco');
update public.accounts set timezone = 'Asia/Kolkata' where id = tests.get_uid('tz_owner');
update public.accounts set timezone = 'Etc/GMT+5' where id = tests.account_id('gmtco');

do $$
declare
  statement text;
begin
  for statement in
    select unnest(statements) from supabase_migrations.schema_migrations
    where version in ('20261030100150', '20261030100160')
    order by version
  loop
    execute statement;
  end loop;
end;
$$;

select is(
  (select timezone from public.accounts where id = tests.account_id('zoneco')),
  'America/New_York',
  'the legacy-zone migration maps a team''s US/Eastern to America/New_York'
);

select is(
  (select timezone from public.accounts where id = tests.get_uid('tz_owner')),
  'Asia/Calcutta',
  'the legacy-zone migration maps a person''s Asia/Kolkata to the app''s Asia/Calcutta'
);

select is(
  (select timezone from public.accounts where id = tests.account_id('gmtco')),
  null,
  'the reset migration clears a team''s Etc/GMT+5, which no app zone matches, to UTC'
);

select lives_ok(
  $$ alter table public.accounts add constraint accounts_timezone_known check (
    timezone is null or public.is_known_timezone(timezone)
  ) $$,
  'every mapped zone passes the app time zone check'
);

select * from finish();
rollback;
