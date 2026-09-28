begin;
select no_plan();

-- One team with an owner and a second member, plus two external deal
-- participants who belong to no account.
select tests.create_user('notif_owner');
select tests.create_user('notif_member');
select tests.create_user('notif_part_a');
select tests.create_user('notif_part_b');

select tests.login_as_service_role();
select public.create_team_account('Notif Team', tests.get_uid('notif_owner'), 'notif-team');

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('notif_member'), tests.account_id('notif-team'), 'member');

-- ---- Targeted notification: visible only to its recipient ----
insert into public.notifications (account_id, recipient_user_id, body)
values (tests.account_id('notif-team'), tests.get_uid('notif_member'), 'targeted to member');

select tests.login_as('notif_member');
select isnt_empty(
  $$ select 1 from public.notifications where body = 'targeted to member' $$,
  'the recipient sees a notification targeted to them'
);

select tests.login_as('notif_owner');
select is_empty(
  $$ select 1 from public.notifications where body = 'targeted to member' $$,
  'another account member does not see a notification targeted to someone else'
);

-- ---- Broadcast notification: visible to every account member ----
select tests.login_as_service_role();
insert into public.notifications (account_id, recipient_user_id, body)
values (tests.account_id('notif-team'), null, 'broadcast to team');

select tests.login_as('notif_member');
select isnt_empty(
  $$ select 1 from public.notifications where body = 'broadcast to team' $$,
  'a member sees a broadcast on their account'
);

select tests.login_as('notif_owner');
select isnt_empty(
  $$ select 1 from public.notifications where body = 'broadcast to team' $$,
  'the owner sees a broadcast on their account'
);

-- ---- Deal stage move: one targeted row per participant, excluding the actor ----
select tests.login_as_service_role();
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000d1', 'deal',
  'dddddddd-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('notif-team'), 'owner_user_id', tests.get_uid('notif_owner'),
    'description', 'A deal', 'stage', 'sourced'), null, 'service');

select public.append_deal_event('dddddddd-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('notif_owner'), 'party', 'seller'), null, 'service');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('notif_part_a'), 'party', 'buyer'), null, 'service');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('notif_part_b'), 'party', 'broker'), null, 'service');

-- The owner (a participant) moves the stage; the trigger excludes the actor.
select tests.login_as('notif_owner');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000d1', 'deal',
  'dddddddd-0000-0000-0000-0000000000d1', 'deal.stage_changed', '{"stage":"diligence"}'::jsonb);

select tests.login_as_service_role();
select bag_eq(
  $$ select recipient_user_id from public.notifications where body = 'Deal moved to diligence' $$,
  $$ values (tests.get_uid('notif_part_a')), (tests.get_uid('notif_part_b')) $$,
  'a stage move inserts one row per participant, targeted to each and excluding the actor'
);
select is_empty(
  $$ select 1 from public.notifications where body = 'Deal moved to diligence' and account_id <> tests.account_id('notif-team') $$,
  'stage-move rows carry the deal account_id'
);

-- Targeting reaches an external participant who is not an account member.
select tests.login_as('notif_part_a');
select isnt_empty(
  $$ select 1 from public.notifications where body = 'Deal moved to diligence' $$,
  'an external participant sees their stage-move notification without account membership'
);

select tests.login_as('notif_owner');
select is_empty(
  $$ select 1 from public.notifications where body = 'Deal moved to diligence' $$,
  'the actor is not notified of their own stage move'
);

select * from finish();
rollback;
