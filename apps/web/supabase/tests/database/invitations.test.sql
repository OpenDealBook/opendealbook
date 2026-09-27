begin;
select no_plan();

select tests.create_user('inv_owner');
select tests.create_user('inv_member');
select tests.create_user('invitee');

select tests.login_as_service_role();
select public.create_team_account('Invite Co', tests.get_uid('inv_owner'), 'invite-co');

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('invite-co'), tests.get_uid('inv_member'), 'member');

select public.add_invitations_to_account(
  'invite-co',
  array[row('invitee@tuckin.test', 'member')]::public.invitation[],
  tests.get_uid('inv_owner')
);

-- Members of the account can see pending invitations.
select tests.login_as('inv_owner');
select isnt_empty(
  $$ select 1 from public.invitations where account_id = tests.account_id('invite-co') $$,
  'a member can read invitations for their account'
);

-- The invite_token credential is not exposed to authenticated users.
select tests.login_as('inv_owner');
select throws_ok(
  $$ select invite_token from public.invitations where account_id = tests.account_id('invite-co') $$,
  '42501',
  null,
  'invite_token is not selectable by authenticated users'
);

-- A member without invites.manage cannot delete an invitation.
select tests.login_as('inv_member');
select lives_ok(
  $$ delete from public.invitations where account_id = tests.account_id('invite-co') $$,
  'delete runs but is filtered by RLS'
);

select tests.login_as('inv_owner');
select isnt_empty(
  $$ select 1 from public.invitations where account_id = tests.account_id('invite-co') $$,
  'the invitation survives a member delete attempt'
);

-- Accepting the invitation creates the membership and clears the invite.
select tests.login_as_service_role();
select public.accept_invitation(
  (select invite_token from public.invitations where account_id = tests.account_id('invite-co') and email = 'invitee@tuckin.test'),
  tests.get_uid('invitee')
);

select isnt_empty(
  $$ select 1 from public.accounts_memberships
     where account_id = tests.account_id('invite-co') and user_id = tests.get_uid('invitee') $$,
  'accepting an invitation creates the membership'
);

select is_empty(
  $$ select 1 from public.invitations where email = 'invitee@tuckin.test' and account_id = tests.account_id('invite-co') $$,
  'the invitation is consumed on accept'
);

-- Personal accounts cannot carry invitations.
select throws_ok(
  $$ insert into public.invitations (email, account_id, invited_by, role)
     values ('x@tuckin.test', tests.get_uid('inv_owner'), tests.get_uid('inv_owner'), 'member') $$,
  'personal accounts cannot have invitations'
);

select * from finish();
rollback;
