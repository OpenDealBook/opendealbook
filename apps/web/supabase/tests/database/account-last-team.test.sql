begin;
select no_plan();

select tests.create_user('lt_owner');
select tests.create_user('lt_other');

select tests.login_as_service_role();
select public.create_team_account('LT Co', tests.get_uid('lt_owner'), 'lt-co');
select public.create_team_account('LT Gone', tests.get_uid('lt_owner'), 'lt-gone');
select public.create_team_account('LT Else', tests.get_uid('lt_other'), 'lt-else');

select tests.login_as('lt_owner');

select is(
  (select last_team_account_id from public.accounts where id = tests.get_uid('lt_owner')),
  null,
  'a new person has no last-used team'
);

select lives_ok(
  $$ update public.accounts set last_team_account_id = tests.account_id('lt-co') where id = tests.get_uid('lt_owner') $$,
  'a person saves the team they last used'
);

select is(
  (select last_team_account_id from public.accounts where id = tests.get_uid('lt_owner')),
  tests.account_id('lt-co'),
  'the last-used team is stored on the person''s profile'
);

select throws_ok(
  $$ update public.accounts set last_team_account_id = tests.account_id('lt-else') where id = tests.get_uid('lt_owner') $$,
  '23514', null,
  'a person cannot save a team they are not a member of'
);

select throws_ok(
  $$ update public.accounts set last_team_account_id = tests.get_uid('lt_other') where id = tests.get_uid('lt_owner') $$,
  '23514', null,
  'the last-used team is a team, not a personal account'
);

select throws_ok(
  $$ update public.accounts set last_team_account_id = tests.account_id('lt-co') where id = tests.account_id('lt-co') $$,
  '23514', null,
  'only a personal account has a last-used team'
);

select tests.login_as('lt_other');

select is_empty(
  $$ update public.accounts set last_team_account_id = null where id = tests.get_uid('lt_owner') returning id $$,
  'a person cannot change someone else''s last-used team'
);

select tests.login_as('lt_owner');

update public.accounts set last_team_account_id = tests.account_id('lt-gone') where id = tests.get_uid('lt_owner');

reset role;

delete from public.accounts where id = tests.account_id('lt-gone');

select is(
  (select last_team_account_id from public.accounts where id = tests.get_uid('lt_owner')),
  null,
  'deleting the last-used team clears it'
);

select * from finish();
rollback;
