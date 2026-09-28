begin;
select no_plan();

-- Schema shape.
select has_table('public', 'notification_preference', 'notification_preference table exists');
select has_column('public', 'notification_preference', 'recipient_user_id', 'notification_preference carries recipient_user_id');
select has_column('public', 'notification_preference', 'channel', 'notification_preference carries channel');
select has_column('public', 'notification_preference', 'event_type', 'notification_preference carries event_type');
select has_column('public', 'notification_preference', 'enabled', 'notification_preference carries enabled');
select has_column('public', 'notification_preference', 'deal_id', 'notification_preference carries a nullable deal_id override');

-- An owner (admin), a plain member, and an external participant.
select tests.create_user('np_owner');
select tests.create_user('np_member');
select tests.create_user('np_ext');

select tests.login_as_service_role();
select public.create_team_account('NP Team', tests.get_uid('np_owner'), 'np-team');

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('np_member'), tests.account_id('np-team'), 'member');

-- ---- A user manages only their own preferences ----
select tests.login_as('np_member');
select lives_ok(
  $$ insert into public.notification_preference (account_id, recipient_user_id, channel, event_type, enabled)
     values (tests.account_id('np-team'), tests.get_uid('np_member'), 'email', 'stage_move', false) $$,
  'a user sets a preference for themselves'
);
select throws_ok(
  $$ insert into public.notification_preference (account_id, recipient_user_id, channel, event_type, enabled)
     values (tests.account_id('np-team'), tests.get_uid('np_owner'), 'email', 'stage_move', false) $$,
  '42501',
  null,
  'a user cannot write a preference for another user'
);
select isnt_empty(
  $$ select 1 from public.notification_preference where recipient_user_id = tests.get_uid('np_member') $$,
  'the owning user reads their own preference'
);

-- ---- The plain member does not see another user's preference ----
select tests.login_as_service_role();
insert into public.notification_preference (account_id, recipient_user_id, channel, event_type, enabled)
values (tests.account_id('np-team'), tests.get_uid('np_owner'), 'in_app', 'new_document', false);

select tests.login_as('np_member');
select is_empty(
  $$ select 1 from public.notification_preference where recipient_user_id = tests.get_uid('np_owner') $$,
  'a plain member does not see another user preference'
);

-- ---- An account admin may read within the account ----
select tests.login_as('np_owner');
select isnt_empty(
  $$ select 1 from public.notification_preference where recipient_user_id = tests.get_uid('np_member') $$,
  'an account admin reads a member preference within the account'
);

select * from finish();
rollback;
