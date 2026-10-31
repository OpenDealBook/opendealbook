begin;
select no_plan();

select tests.create_user('cp_a_owner');
select tests.create_user('cp_b_owner');
select tests.login_as_service_role();
select public.create_team_account('Pace A', tests.get_uid('cp_a_owner'), 'cp-team-a');
select public.create_team_account('Pace B', tests.get_uid('cp_b_owner'), 'cp-team-b');

select is(
  (select row(wait_ms, held)::text from public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds')),
  '(0,f)',
  'a team with no recent call goes at once'
);

select ok(
  (select wait_ms between 11000 and 12000 and not held
   from public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds')),
  'the next claim for the team waits for the slot 12 seconds later, with no hold'
);

select ok(
  (select wait_ms between 23000 and 24000
   from public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds')),
  'each claim queues behind the slots already claimed'
);

select is(
  (select wait_ms from public.claim_courtlistener_slot(tests.account_id('cp-team-b'), '12 seconds')),
  0::double precision,
  'another team keeps its own slots'
);

select public.claim_courtlistener_slot(tests.account_id('cp-team-b'), '11 minutes');

select ok(
  (select wait_ms between 671000 and 672000 and not held
   from public.claim_courtlistener_slot(tests.account_id('cp-team-b'), '12 seconds')),
  'a long queue is not a hold'
);

select public.hold_courtlistener_slots(tests.account_id('cp-team-a'), '1 hour');

select ok(
  (select wait_ms between 3599000 and 3600000 and held
   from public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds')),
  'a hold pushes the team''s next slot an hour out, and the claim says it is held'
);

select public.hold_courtlistener_slots(tests.account_id('cp-team-a'), '1 minute');

select ok(
  (select wait_ms between 3611000 and 3612000 and held
   from public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds')),
  'a shorter hold or a later claim never pulls the team''s slot earlier'
);

select public.hold_courtlistener_slots(tests.account_id('cp-team-b'), '1 second');
select pg_sleep(1.1);

select ok(
  (select not held from public.claim_courtlistener_slot(tests.account_id('cp-team-b'), '12 seconds')),
  'a claim after the hold has passed is not held'
);

select tests.login_as('cp_a_owner');

select throws_ok(
  $$ select public.claim_courtlistener_slot(tests.account_id('cp-team-a'), '12 seconds') $$,
  '42501', null,
  'a team member cannot claim a slot'
);
select throws_ok(
  $$ select public.hold_courtlistener_slots(tests.account_id('cp-team-a'), '1 hour') $$,
  '42501', null,
  'a team member cannot hold the team''s slots'
);
select throws_ok(
  $$ select * from public.courtlistener_pace $$,
  '42501', null,
  'a team member cannot read the pace table'
);

select * from finish();
rollback;
