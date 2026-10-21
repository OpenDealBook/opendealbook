begin;
select no_plan();

select tests.create_user('ta_owner');
select tests.create_user('ta_admin');
select tests.create_user('ta_member');
select tests.create_user('ta_outsider');
select tests.create_user('ta_locked_owner');
select tests.create_user('ta_locked_admin');

select tests.login_as_service_role();
select public.create_team_account('Authority Co', tests.get_uid('ta_owner'), 'authority-co');
select public.create_team_account('Locked Authority', tests.get_uid('ta_locked_owner'), 'locked-authority');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('authority-co'), tests.get_uid('ta_admin'), 'admin'),
  (tests.account_id('authority-co'), tests.get_uid('ta_member'), 'member'),
  (tests.account_id('locked-authority'), tests.get_uid('ta_locked_admin'), 'admin');

update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('locked-authority');

select tests.login_as('ta_outsider');

select throws_ok(
  $$ select public.add_invitations_to_account('authority-co',
       array[row('friend@tuckin.test', 'member')]::public.invitation[]) $$,
  '42501', 'not allowed to invite to this team', 'an outsider cannot invite into a team'
);
select throws_ok(
  $$ select public.transfer_team_account_ownership(tests.account_id('authority-co'), tests.get_uid('ta_member')) $$,
  '42501', 'only the owner can transfer this team', 'an outsider cannot transfer a team'
);

select tests.login_as('ta_member');

select throws_ok(
  $$ select public.add_invitations_to_account('authority-co',
       array[row('friend@tuckin.test', 'member')]::public.invitation[]) $$,
  '42501', 'not allowed to invite to this team', 'a member without invites.manage cannot invite'
);

select tests.login_as('ta_admin');

select throws_ok(
  $$ select public.add_invitations_to_account('authority-co',
       array[row('boss@tuckin.test', 'owner')]::public.invitation[]) $$,
  '42501', 'not allowed to invite to this team', 'an admin cannot invite above their own role'
);
select lives_ok(
  $$ select public.add_invitations_to_account('authority-co',
       array[row('peer@tuckin.test', 'admin'), row('helper@tuckin.test', 'member')]::public.invitation[]) $$,
  'an admin invites at or below their own role'
);
select set_eq(
  $$ select email, invited_by from public.invitations where account_id = tests.account_id('authority-co') $$,
  $$ values ('peer@tuckin.test'::varchar, tests.get_uid('ta_admin')), ('helper@tuckin.test', tests.get_uid('ta_admin')) $$,
  'invitations record the caller as the inviter'
);
select throws_ok(
  $$ select public.transfer_team_account_ownership(tests.account_id('authority-co'), tests.get_uid('ta_member')) $$,
  '42501', 'only the owner can transfer this team', 'an admin cannot transfer the team'
);

select tests.login_as('ta_owner');

update public.accounts_memberships set account_role = 'analyst'
where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member');
update public.accounts_memberships set account_role = 'member'
where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_owner');

select tests.login_as_service_role();

select is(
  (select account_role::text from public.accounts_memberships
   where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member')),
  'analyst',
  'the owner changes a member''s role'
);

select tests.login_as('ta_admin');

update public.accounts_memberships set account_role = 'viewer'
where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member');

select tests.login_as_service_role();

select is(
  (select account_role::text from public.accounts_memberships
   where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member')),
  'viewer',
  'an admin changes the role of a member below admin'
);

select tests.login_as('ta_admin');

select throws_ok(
  $$ update public.accounts_memberships set account_role = 'admin'
     where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member') $$,
  '42501', null, 'an admin cannot promote a member to admin'
);
update public.accounts_memberships set account_role = 'member'
where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_owner');

select tests.login_as_service_role();

select is(
  (select account_role::text from public.accounts_memberships
   where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_member')),
  'viewer',
  'the member keeps the role the admin could not raise'
);
select is(
  (select account_role::text from public.accounts_memberships
   where account_id = tests.account_id('authority-co') and user_id = tests.get_uid('ta_owner')),
  'owner',
  'the owner cannot change their own role'
);

select tests.login_as('ta_owner');

select lives_ok(
  $$ select public.transfer_team_account_ownership(tests.account_id('authority-co'), tests.get_uid('ta_admin')) $$,
  'the owner transfers the team'
);

select tests.login_as_service_role();

select is(
  (select primary_owner_user_id from public.accounts where id = tests.account_id('authority-co')),
  tests.get_uid('ta_admin'),
  'the new owner holds the team'
);

select tests.login_as('ta_locked_owner');

select throws_ok(
  $$ select public.transfer_team_account_ownership(tests.account_id('locked-authority'), tests.get_uid('ta_locked_admin')) $$,
  '42501', 'team is read-only', 'a locked team cannot change owner'
);
select throws_ok(
  $$ select public.add_invitations_to_account('locked-authority',
       array[row('late@tuckin.test', 'member')]::public.invitation[]) $$,
  '42501', 'team is read-only', 'a locked team cannot invite'
);

select * from finish();
rollback;
