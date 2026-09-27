begin;
select no_plan();

-- Two independent teams, a plain member of team A, plus an outsider who
-- belongs to neither.
select tests.create_user('bp_a_owner');
select tests.create_user('bp_b_owner');
select tests.create_user('bp_a_member');
select tests.create_user('bp_outsider');

select tests.login_as_service_role();
select public.create_team_account('BP Acct A', tests.get_uid('bp_a_owner'), 'bp-acct-a');
select public.create_team_account('BP Acct B', tests.get_uid('bp_b_owner'), 'bp-acct-b');

-- The member role carries settings.manage but not buyer_profile.manage.
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('bp-acct-a'), tests.get_uid('bp_a_member'), 'member');

-- Two versions for account A and one for account B.
insert into public.buyer_profile (account_id, version, display_name)
values
  (tests.account_id('bp-acct-a'), 1, 'A v1'),
  (tests.account_id('bp-acct-a'), 2, 'A v2'),
  (tests.account_id('bp-acct-b'), 1, 'B v1');

-- ---- Account isolation ----
select tests.login_as('bp_a_owner');

select isnt_empty(
  $$ select 1 from public.buyer_profile where account_id = tests.account_id('bp-acct-a') $$,
  'a member sees their own account buyer_profile'
);
select is_empty(
  $$ select 1 from public.buyer_profile where account_id = tests.account_id('bp-acct-b') $$,
  'a member cannot see another account buyer_profile'
);

-- ---- Versioning: two versions coexist, current = max ----
select is(
  (select count(*)::int from public.buyer_profile where account_id = tests.account_id('bp-acct-a')),
  2,
  'both versions of the buyer_profile coexist as rows'
);
select is(
  (public.current_buyer_profile(tests.account_id('bp-acct-a'))).version,
  2,
  'current_buyer_profile returns the max version row'
);
select is(
  (public.current_buyer_profile(tests.account_id('bp-acct-a'))).display_name,
  'A v2',
  'current_buyer_profile returns the latest version payload'
);

-- ---- Insert gating by buyer_profile.manage ----
select lives_ok(
  $$ insert into public.buyer_profile (account_id, version, display_name)
     values (tests.account_id('bp-acct-a'), 3, 'A v3') $$,
  'an owner with buyer_profile.manage can insert a new version'
);

select tests.login_as('bp_a_member');
select throws_ok(
  $$ insert into public.buyer_profile (account_id, version, display_name)
     values (tests.account_id('bp-acct-a'), 4, 'member try') $$,
  '42501',
  null,
  'a member with only settings.manage can no longer insert a buyer_profile'
);

select tests.login_as('bp_outsider');
select throws_ok(
  $$ insert into public.buyer_profile (account_id, version, display_name)
     values (tests.account_id('bp-acct-a'), 4, 'sneaky') $$,
  '42501',
  null,
  'an outsider cannot insert a buyer_profile'
);

select * from finish();
rollback;
