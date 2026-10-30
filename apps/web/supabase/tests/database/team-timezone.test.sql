begin;
select no_plan();

select tests.create_user('ttz_owner');
select tests.create_user('ttz_plain');
select tests.create_user('ttz_member');

select tests.login_as_service_role();
update public.accounts set timezone = 'America/Chicago' where id = tests.get_uid('ttz_owner');
select public.create_team_account('Chicago Team', tests.get_uid('ttz_owner'), 'ttz-chicago');
select public.create_team_account('Plain Team', tests.get_uid('ttz_plain'), 'ttz-plain');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('ttz-chicago'), tests.get_uid('ttz_member'), 'member');
insert into public.accounts (name, slug, primary_owner_user_id, is_personal_account, timezone)
values ('Direct Team', 'ttz-direct', tests.get_uid('ttz_plain'), false, null);

select is(
  (select timezone from public.accounts where id = tests.account_id('ttz-chicago')),
  'America/Chicago',
  'a new team starts in its creator''s time zone'
);

select is(
  (select timezone from public.accounts where id = tests.account_id('ttz-plain')),
  'UTC',
  'a new team whose creator has no time zone starts in UTC'
);

select is(
  (select count(*)::int from public.accounts
   where not is_personal_account and timezone is null
     and slug in ('ttz-chicago', 'ttz-plain', 'ttz-direct')),
  0,
  'every team has a time zone'
);

select tests.login_as('ttz_owner');

select lives_ok(
  $$ update public.accounts set timezone = 'Europe/Paris' where id = tests.account_id('ttz-chicago') $$,
  'a member with settings.manage sets the team time zone'
);

select throws_ok(
  $$ update public.accounts set timezone = 'Mars/Olympus_Mons' where id = tests.account_id('ttz-chicago') $$,
  '23514',
  null,
  'an unknown team time zone is refused'
);

select tests.login_as('ttz_member');
update public.accounts set timezone = 'Asia/Tokyo' where id = tests.account_id('ttz-chicago');

select tests.login_as_service_role();
select is(
  (select timezone from public.accounts where id = tests.account_id('ttz-chicago')),
  'Europe/Paris',
  'a member without settings.manage does not change the team time zone'
);

select * from finish();
rollback;
