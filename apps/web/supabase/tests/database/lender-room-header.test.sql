begin;
select no_plan();

-- Account LH owns deal d1 with saved terms sought (room A open, room C closed)
-- and deal d2 with none (room B).
select tests.create_user('lh_owner');
select tests.create_user('lh_lender_a');
select tests.create_user('lh_lender_b');

select tests.login_as_service_role();
select public.create_team_account('Harbor Acquisitions', tests.get_uid('lh_owner'), 'lh-acct');

select public.append_deal_event('1d000000-0000-0000-0000-0000000000d1', 'deal',
  '1d000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lh-acct'), 'owner_user_id', tests.get_uid('lh_owner'),
    'description', 'Secret description'), null, 'service');
select public.append_deal_event('1d000000-0000-0000-0000-0000000000d2', 'deal',
  '1d000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lh-acct'), 'owner_user_id', tests.get_uid('lh_owner'),
    'description', 'Termless deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('1d000000-0000-0000-0000-00000000f00a', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d1', null, 'Room A'),
  ('1d000000-0000-0000-0000-00000000f00b', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d2', null, 'Room B'),
  ('1d000000-0000-0000-0000-00000000f00c', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d1', null, 'Room C');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id, closed_at)
values
  ('1d000000-0000-0000-0000-0000000000a0', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d1', 'Cedar Valley Bank', '1d000000-0000-0000-0000-00000000f00a', null),
  ('1d000000-0000-0000-0000-0000000000b0', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d2', 'Cedar Valley Bank', '1d000000-0000-0000-0000-00000000f00b', null),
  ('1d000000-0000-0000-0000-0000000000c0', tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d1', 'Old Bank', '1d000000-0000-0000-0000-00000000f00c', now());

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values
  ('1d000000-0000-0000-0000-0000000000a0', tests.get_uid('lh_lender_a'), 'lh_lender_a@tuckin.test', tests.get_uid('lh_owner')),
  ('1d000000-0000-0000-0000-0000000000c0', tests.get_uid('lh_lender_a'), 'lh_lender_a@tuckin.test', tests.get_uid('lh_owner')),
  ('1d000000-0000-0000-0000-0000000000b0', tests.get_uid('lh_lender_b'), 'lh_lender_b@tuckin.test', tests.get_uid('lh_owner'));

insert into public.deal_terms_sought (account_id, deal_id, loan_amount, loan_type, term_years, seller_note_amount)
values (tests.account_id('lh-acct'), '1d000000-0000-0000-0000-0000000000d1', 2240000, 'sba_7a', 10, 300000);

-- ---- The loan ask in the room summary ----
select tests.login_as('lh_lender_a');

select results_eq(
  $$ select buyer_team, loan_amount, loan_type, term_years, seller_note_amount
     from public.lender_room_view('1d000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('Harbor Acquisitions', 2240000::numeric, 'sba_7a', 10::numeric, 300000::numeric) $$,
  'a lender sees the buyer team and the loan the team asks for'
);
select results_eq(
  $$ select buyer_team, loan_amount, loan_type, term_years, seller_note_amount
     from public.lender_room_view('1d000000-0000-0000-0000-0000000000c0') $$,
  $$ values ('Harbor Acquisitions', null::numeric, null::text, null::numeric, null::numeric) $$,
  'a closed room names the buyer team but not the loan ask'
);
select throws_ok(
  $$ select deal_description from public.lender_room_view('1d000000-0000-0000-0000-0000000000a0') $$,
  '42703', null, 'the room summary has no deal description at all'
);

select tests.login_as('lh_lender_b');

select results_eq(
  $$ select buyer_team, loan_amount, loan_type, term_years, seller_note_amount
     from public.lender_room_view('1d000000-0000-0000-0000-0000000000b0') $$,
  $$ values ('Harbor Acquisitions', null::numeric, null::text, null::numeric, null::numeric) $$,
  'a deal with no saved terms has no loan ask'
);

-- ---- A note and an earliest date with the timeline answer ----
select tests.login_as('lh_owner');

select lives_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source, note, earliest_close_date)
     values ('1d000000-0000-0000-0000-0000000000a0', 'no', tests.get_uid('lh_owner'), 'internal', 'Appraisal takes six weeks', '2027-05-15') $$,
  'a no answer carries a note and the earliest date the lender can close'
);
select throws_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source, earliest_close_date)
     values ('1d000000-0000-0000-0000-0000000000b0', 'yes', tests.get_uid('lh_owner'), 'internal', '2027-05-15') $$,
  '23514', null, 'only a no answer has an earliest close date'
);
select lives_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source, note)
     values ('1d000000-0000-0000-0000-0000000000b0', 'need_to_talk', tests.get_uid('lh_owner'), 'internal', 'Call me Tuesday') $$,
  'any answer carries a note'
);

select tests.login_as('lh_lender_a');

select results_eq(
  $$ select note, earliest_close_date from public.lender_room_timeline_answer where room_id = '1d000000-0000-0000-0000-0000000000a0' $$,
  $$ values ('Appraisal takes six weeks', '2027-05-15'::date) $$,
  'the lender reads back its note and date'
);

select * from finish();
rollback;
