begin;
select no_plan();

-- Two independent teams, each with its own owner.
select tests.create_user('alice');
select tests.create_user('bob');

select tests.login_as_service_role();
select public.create_team_account('Team Alpha', tests.get_uid('alice'), 'team-alpha');
select public.create_team_account('Team Beta', tests.get_uid('bob'), 'team-beta');

insert into public.notifications (account_id, body)
values (tests.account_id('team-beta'), 'beta only');

-- Alice belongs to Alpha only.
select tests.login_as('alice');

select isnt_empty(
  $$ select 1 from public.accounts where id = tests.account_id('team-alpha') $$,
  'a member can read their own account'
);

select is_empty(
  $$ select 1 from public.accounts where id = tests.account_id('team-beta') $$,
  'a member cannot read another account'
);

select is_empty(
  $$ select 1 from public.accounts_memberships where account_id = tests.account_id('team-beta') $$,
  'a member cannot read another account memberships'
);

select is_empty(
  $$ select 1 from public.notifications where account_id = tests.account_id('team-beta') $$,
  'a member cannot read another account notifications'
);

select is(
  public.has_role_on_account(tests.account_id('team-beta')),
  false,
  'has_role_on_account is false for a foreign account'
);

select * from finish();
rollback;
