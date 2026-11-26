begin;
select no_plan();

-- Team "SAC Team" works deal d1 with a seller room. Question e1 has an
-- internal note a2 and then a seller answer a1; question e2 has a seller
-- answer b1; question e3 has a seller answer a6 and an internal note a7 sent
-- at the same moment, a7 sorting after it by id.
-- The data room holds lease.pdf in the uploads folder, lender-terms.pdf in a
-- lender room's own folder and counsel-memo.pdf in seller's counsel's folder,
-- all from hours ago. sac_viewer is on the team without deals.work,
-- sac_seller is in the seller room, sac_lender is in a lender room on the
-- deal, sac_counsel and sac_seller_law are buyer's and seller's counsel, and
-- sac_foreign is on another team, which has its own seller question.
select tests.create_user('sac_owner');
select tests.create_user('sac_member');
select tests.create_user('sac_viewer');
select tests.create_user('sac_seller');
select tests.create_user('sac_lender');
select tests.create_user('sac_foreign');
select tests.create_user('sac_counsel');
select tests.create_user('sac_seller_law');

select tests.login_as_service_role();
select public.create_team_account('SAC Team', tests.get_uid('sac_owner'), 'sac-team');
select public.create_team_account('SAC Foreign', tests.get_uid('sac_foreign'), 'sac-foreign');

select public.append_deal_event('5ac00000-0000-0000-0000-0000000000d1', 'deal',
  '5ac00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sac-team'), 'firm_id', tests.create_firm(tests.account_id('sac-team')),
    'owner_user_id', tests.get_uid('sac_owner'), 'description', 'Answer check deal'), null, 'service');

select public.append_deal_event('5ac00000-0000-0000-0000-0000000000d2', 'deal',
  '5ac00000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sac-foreign'), 'firm_id', tests.create_firm(tests.account_id('sac-foreign')),
    'owner_user_id', tests.get_uid('sac_foreign'), 'description', 'Foreign answer deal'), null, 'service');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('sac-team'), tests.get_uid('sac_member'), 'member'),
  (tests.account_id('sac-team'), tests.get_uid('sac_viewer'), 'viewer');

insert into public.dr_folder (id, account_id, deal_id, name)
values
  ('5ac00000-0000-0000-0000-00000000f001', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1', 'Uploads'),
  ('5ac00000-0000-0000-0000-00000000f002', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1', 'Lender A'),
  ('5ac00000-0000-0000-0000-00000000f003', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1', 'Seller''s counsel'),
  ('5ac00000-0000-0000-0000-00000000f0ff', tests.account_id('sac-foreign'), '5ac00000-0000-0000-0000-0000000000d2', 'Foreign uploads');

insert into public.seller_counsel_folder (deal_id, account_id, folder_id)
values ('5ac00000-0000-0000-0000-0000000000d1', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-00000000f003');

alter table public.dr_document disable trigger dr_document_timestamps;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, created_at)
values
  ('5ac00000-0000-0000-0000-00000000c005', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
    '5ac00000-0000-0000-0000-00000000f001', 'lease.pdf', 'sac/lease.pdf', now() - interval '3 hours'),
  ('5ac00000-0000-0000-0000-00000000c003', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
    '5ac00000-0000-0000-0000-00000000f002', 'lender-terms.pdf', 'sac/lender-terms.pdf', now() - interval '3 hours'),
  ('5ac00000-0000-0000-0000-00000000c004', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
    '5ac00000-0000-0000-0000-00000000f003', 'counsel-memo.pdf', 'sac/counsel-memo.pdf', now() - interval '3 hours');
alter table public.dr_document enable trigger dr_document_timestamps;

insert into public.seller_room (id, account_id, deal_id, uploads_folder_id)
values ('5ac00000-0000-0000-0000-0000000000a0', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
  '5ac00000-0000-0000-0000-00000000f001');

insert into public.seller_room (id, account_id, deal_id, uploads_folder_id)
values ('5ac00000-0000-0000-0000-0000000000f0', tests.account_id('sac-foreign'), '5ac00000-0000-0000-0000-0000000000d2',
  '5ac00000-0000-0000-0000-00000000f0ff');

insert into public.seller_room_member (room_id, user_id, email, name)
values ('5ac00000-0000-0000-0000-0000000000a0', tests.get_uid('sac_seller'), 'sac_seller@opendealbook.test', 'Sam Seller');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('5ac00000-0000-0000-0000-0000000000b0', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
  'Harbor Lending', '5ac00000-0000-0000-0000-00000000f002');

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('5ac00000-0000-0000-0000-0000000000b0', tests.get_uid('sac_lender'), 'sac_lender@opendealbook.test', tests.get_uid('sac_owner'));

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('sac_counsel'), 'sac_counsel@opendealbook.test', 'Cora Counsel'),
  (tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('sac_seller_law'), 'sac_seller_law@opendealbook.test', 'Sid Sellerlaw');

insert into public.seller_room_question (id, room_id, account_id, title)
values
  ('5ac00000-0000-0000-0000-0000000000e1', '5ac00000-0000-0000-0000-0000000000a0', tests.account_id('sac-team'),
    'Is the lease assignable?'),
  ('5ac00000-0000-0000-0000-0000000000e2', '5ac00000-0000-0000-0000-0000000000a0', tests.account_id('sac-team'),
    'Any open litigation?'),
  ('5ac00000-0000-0000-0000-0000000000e3', '5ac00000-0000-0000-0000-0000000000a0', tests.account_id('sac-team'),
    'Any customer concentration?'),
  ('5ac00000-0000-0000-0000-0000000000ef', '5ac00000-0000-0000-0000-0000000000f0', tests.account_id('sac-foreign'),
    'Foreign question?');

insert into public.seller_room_question_message (id, question_id, author_user_id, side, body, created_at)
values
  ('5ac00000-0000-0000-0000-0000000000a1', '5ac00000-0000-0000-0000-0000000000e1', tests.get_uid('sac_seller'), 'seller',
    'Yes, with landlord consent.', now() - interval '2 hours'),
  ('5ac00000-0000-0000-0000-0000000000a2', '5ac00000-0000-0000-0000-0000000000e1', tests.get_uid('sac_owner'), 'internal',
    'Asking the seller.', now() - interval '3 hours'),
  ('5ac00000-0000-0000-0000-0000000000b1', '5ac00000-0000-0000-0000-0000000000e2', tests.get_uid('sac_seller'), 'seller',
    'None.', now() - interval '2 hours'),
  ('5ac00000-0000-0000-0000-0000000000a6', '5ac00000-0000-0000-0000-0000000000e3', tests.get_uid('sac_seller'), 'seller',
    'No customer is over 10%.', now() - interval '2 hours'),
  ('5ac00000-0000-0000-0000-0000000000a7', '5ac00000-0000-0000-0000-0000000000e3', tests.get_uid('sac_owner'), 'internal',
    'Verify against the AR aging.', now() - interval '2 hours'),
  ('5ac00000-0000-0000-0000-0000000000f1', '5ac00000-0000-0000-0000-0000000000ef', tests.get_uid('sac_foreign'), 'seller',
    'Foreign answer.', now() - interval '2 hours');

-- ---- Starting a check ----
select tests.login_as('sac_owner');

select lives_ok(
  $$ insert into public.seller_answer_check (id, message_id)
     values ('5ac00000-0000-0000-0000-0000000000c1', '5ac00000-0000-0000-0000-0000000000a1') $$,
  'someone who works the deal checks a seller answer'
);

select results_eq(
  $$ select question_id, room_id, account_id, deal_id, requested_by, status::text, overall::text, findings, follow_up, credits_used, steps, finished_at
     from public.seller_answer_check where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  $$ values ('5ac00000-0000-0000-0000-0000000000e1'::uuid, '5ac00000-0000-0000-0000-0000000000a0'::uuid, tests.account_id('sac-team'),
       '5ac00000-0000-0000-0000-0000000000d1'::uuid, tests.get_uid('sac_owner'), 'running', null::text, '[]'::jsonb, null::text,
       0::numeric, '[]'::jsonb, null::timestamptz) $$,
  'a new check takes its question, room, team and deal from the message, and is the requester''s, running and empty'
);

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a2') $$,
  '23514', null,
  'only a seller''s message is checked'
);

select throws_ok(
  $$ insert into public.seller_answer_check (message_id, question_id)
     values ('5ac00000-0000-0000-0000-0000000000a1', '5ac00000-0000-0000-0000-0000000000e1') $$,
  '42501', null,
  'a check cannot name its own question'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'checked', overall = 'consistent', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '42501', null,
  'the requester''s own client cannot finish a check'
);

select tests.login_as('sac_member');

select results_eq(
  $$ select id from public.seller_answer_check $$,
  array['5ac00000-0000-0000-0000-0000000000c1']::uuid[],
  'a teammate who works the deal reads the team''s checks'
);

select tests.login_as('sac_viewer');

select is_empty($$ select 1 from public.seller_answer_check $$, 'a teammate without deals.work reads no check');
select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'a teammate without deals.work cannot check an answer'
);

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a2') $$,
  '42501', null,
  'a teammate without deals.work is refused before anything is said about the message'
);

select tests.login_as('sac_seller');

select is_empty($$ select 1 from public.seller_answer_check $$, 'the seller never reads a check');
select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'the seller cannot check an answer'
);

select tests.login_as('sac_lender');

select is_empty($$ select 1 from public.seller_answer_check $$, 'a lender never reads a check');

select tests.login_as('sac_owner');

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000f1') $$,
  '42501', 'only someone who works the deal checks its answers',
  'another team''s message is refused'
);

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000ff') $$,
  '42501', 'only someone who works the deal checks its answers',
  'a message that does not exist is refused the same way'
);

select tests.login_as('sac_foreign');

select is_empty($$ select 1 from public.seller_answer_check $$, 'another team reads no check');
select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'another team cannot check an answer'
);

-- ---- Finishing a check ----
select tests.login_as_service_role();

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'the server does not start checks'
);

select throws_ok(
  $$ update public.seller_answer_check set message_id = '5ac00000-0000-0000-0000-0000000000b1'
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '42501', null,
  'the server writes only a check''s result'
);

select throws_ok(
  $$ update public.seller_answer_check set findings = '{"claim": "x"}'
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a check''s findings are a list'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'checked', overall = 'consistent'
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a finished check records when it finished'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'checked', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a checked answer has an overall result'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'failed', failure_reason = 'failed', overall = 'contradicted', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a check that did not finish has no overall result'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'failed', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a failed check says why it failed'
);

select throws_ok(
  $$ update public.seller_answer_check set status = 'checked', overall = 'no_claims', failure_reason = 'too_long', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'only a failed check has a failure reason'
);

select lives_ok(
  $$ update public.seller_answer_check set status = 'failed', failure_reason = 'no_submit', finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  'the server fails a check with its reason'
);

select results_eq(
  $$ select status::text, failure_reason::text from public.seller_answer_check where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  $$ values ('failed', 'no_submit') $$,
  'a failed check keeps its reason'
);

select lives_ok(
  $$ update public.seller_answer_check set status = 'checked', overall = 'no_claims', failure_reason = null, finished_at = now()
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  'an answer with nothing to check is checked with no claims'
);

update public.seller_answer_check
set status = 'checked', overall = 'consistent', model = 'claude-test', credits_used = 1.5,
  findings = '[{"claim": "The lease is assignable", "verdict": "supported", "citations": [
         {"documentId": "5ac00000-0000-0000-0000-00000000c005", "documentName": "lease.pdf", "version": 1, "pageFrom": 1, "pageTo": 1, "excerpt": "Assignable with consent.", "fromOcr": false},
         {"documentId": "5ac00000-0000-0000-0000-00000000c003", "documentName": "lender-terms.pdf", "version": 1, "pageFrom": 2, "pageTo": 2, "excerpt": "Lender only terms.", "fromOcr": false},
         {"documentId": "5ac00000-0000-0000-0000-00000000c004", "documentName": "counsel-memo.pdf", "version": 1, "pageFrom": 1, "pageTo": 1, "excerpt": "Seller counsel view.", "fromOcr": false}]}]',
  follow_up = 'Please upload the lease consent clause.', finished_at = now()
where id = '5ac00000-0000-0000-0000-0000000000c1';

select tests.login_as('sac_owner');

select results_eq(
  $$ select status::text, overall::text, findings, follow_up, credits_used
     from public.seller_answer_check where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  $$ values ('checked', 'consistent', '[{"claim": "The lease is assignable", "verdict": "supported", "citations": [
         {"documentId": "5ac00000-0000-0000-0000-00000000c005", "documentName": "lease.pdf", "version": 1, "pageFrom": 1, "pageTo": 1, "excerpt": "Assignable with consent.", "fromOcr": false},
         {"documentId": "5ac00000-0000-0000-0000-00000000c003", "documentName": "lender-terms.pdf", "version": 1, "pageFrom": 2, "pageTo": 2, "excerpt": "Lender only terms.", "fromOcr": false},
         {"documentId": "5ac00000-0000-0000-0000-00000000c004", "documentName": "counsel-memo.pdf", "version": 1, "pageFrom": 1, "pageTo": 1, "excerpt": "Seller counsel view.", "fromOcr": false}]}]'::jsonb,
       'Please upload the lease consent clause.', 1.5::numeric) $$,
  'the server finishes a check with its overall result, findings and follow-up'
);

select lives_ok(
  $$ insert into public.seller_answer_check (id, message_id)
     values ('5ac00000-0000-0000-0000-0000000000c3', '5ac00000-0000-0000-0000-0000000000a1') $$,
  'an answer can be checked again once its check has finished'
);

-- ---- Staleness ----
select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  array[false],
  'a check is current while the seller has not answered again and no document has arrived'
);

reset role;

insert into public.seller_room_question_message (id, question_id, author_user_id, side, body, created_at)
values ('5ac00000-0000-0000-0000-0000000000a3', '5ac00000-0000-0000-0000-0000000000e1', tests.get_uid('sac_owner'), 'internal',
  'Following up.', now() - interval '1 minute');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  array[false],
  'a team message does not make a check stale'
);

reset role;

insert into public.seller_room_question_message (id, question_id, author_user_id, side, body, created_at)
values ('5ac00000-0000-0000-0000-0000000000a4', '5ac00000-0000-0000-0000-0000000000e1', tests.get_uid('sac_seller'), 'seller',
  'Consent was given last year.', now() - interval '30 seconds');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  array[true],
  'a check goes stale when the seller answers again'
);

select lives_ok(
  $$ insert into public.seller_answer_check (id, message_id)
     values ('5ac00000-0000-0000-0000-0000000000c2', '5ac00000-0000-0000-0000-0000000000a4') $$,
  'the new answer is checked'
);

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a4') $$,
  '23505', null,
  'a person runs one check at a time for an answer'
);

select tests.login_as('sac_member');

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a4') $$,
  '23505', null,
  'a teammate cannot check an answer while another teammate''s check of it is running'
);

select tests.login_as('sac_owner');

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  'ODB03', 'only the latest message in a thread is checked',
  'an answer the thread has moved past is not checked'
);

select throws_ok(
  $$ select public.start_seller_answer_check('5ac00000-0000-0000-0000-0000000000a1') $$,
  'ODB03', 'only the latest message in a thread is checked',
  'starting a check by an answer the thread has moved past is refused'
);

select throws_ok(
  $$ select public.start_seller_answer_check('5ac00000-0000-0000-0000-0000000000a6') $$,
  'ODB03', 'only the latest message in a thread is checked',
  'a team note sent at the same moment and sorting after the answer by id makes it not the latest'
);

select tests.login_as('sac_foreign');

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'another team is refused for permission before learning an answer is not the latest'
);

select tests.login_as('sac_viewer');

select throws_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000a1') $$,
  '42501', null,
  'a teammate without deals.work is refused for permission before learning an answer is not the latest'
);

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[false],
  'a check of the latest answer is current'
);

reset role;

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values ('5ac00000-0000-0000-0000-00000000c002', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
  '5ac00000-0000-0000-0000-00000000f002', 'consent.pdf', 'sac/consent.pdf');

update public.seller_answer_check set created_at = now() - interval '1 second'
where id = '5ac00000-0000-0000-0000-0000000000c2';

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[true],
  'a check goes stale when a document arrives on the deal after it started'
);

select tests.login_as_service_role();

select public.append_deal_event('5ac00000-0000-0000-0000-0000000000d1', 'dr_document',
  '5ac00000-0000-0000-0000-00000000c002', 'dr_document.removed', '{}'::jsonb, null, 'service');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[false],
  'a document removed since does not make a check stale'
);

select tests.login_as_service_role();

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[false],
  'the server, which reads removed documents, also finds the check current'
);

reset role;

insert into public.document_segment
  (id, account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
values ('5ac00000-0000-0000-0000-0000000005e1', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
  '5ac00000-0000-0000-0000-00000000c002', 1, 0, 'page', 1, 1, 'Consent text.', false, 'sc');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[false],
  'text landing for a removed document does not make a check stale'
);

reset role;

insert into public.document_segment
  (id, account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
values ('5ac00000-0000-0000-0000-0000000005e2', tests.account_id('sac-team'), '5ac00000-0000-0000-0000-0000000000d1',
  '5ac00000-0000-0000-0000-00000000c005', 1, 0, 'page', 1, 1, 'Lease text.', false, 'sl');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[true],
  'a check goes stale when an older document''s text lands after it started'
);

reset role;

delete from public.document_segment where id = '5ac00000-0000-0000-0000-0000000005e2';

insert into public.seller_room_question_file (question_id, dr_document_id, side)
values ('5ac00000-0000-0000-0000-0000000000e2', '5ac00000-0000-0000-0000-00000000c005', 'seller');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[false],
  'a file attached to another question does not make a check stale'
);

reset role;

insert into public.seller_room_question_file (question_id, dr_document_id, side)
values ('5ac00000-0000-0000-0000-0000000000e1', '5ac00000-0000-0000-0000-00000000c005', 'seller');

select tests.login_as('sac_owner');

select results_eq(
  $$ select public.seller_answer_check_is_stale(c) from public.seller_answer_check c
     where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  array[true],
  'a check goes stale when a file is attached to its question after it started'
);

-- A check still running 10 minutes on belongs to a crashed request and fails
-- when anyone starts another check of the same answer.
select tests.login_as('sac_member');

insert into public.seller_answer_check (id, message_id)
values ('5ac00000-0000-0000-0000-0000000000c9', '5ac00000-0000-0000-0000-0000000000b1');

reset role;

update public.seller_answer_check set created_at = now() - interval '11 minutes'
where id in ('5ac00000-0000-0000-0000-0000000000c2', '5ac00000-0000-0000-0000-0000000000c9');

select tests.login_as('sac_owner');

select lives_ok(
  $$ insert into public.seller_answer_check (message_id) values ('5ac00000-0000-0000-0000-0000000000b1') $$,
  'a teammate checks an answer whose only running check is another teammate''s stale one'
);

select results_eq(
  $$ select id, status::text, failure_reason::text, finished_at is not null from public.seller_answer_check
     where id in ('5ac00000-0000-0000-0000-0000000000c2', '5ac00000-0000-0000-0000-0000000000c9') order by id $$,
  $$ values ('5ac00000-0000-0000-0000-0000000000c2'::uuid, 'running', null, false),
            ('5ac00000-0000-0000-0000-0000000000c9'::uuid, 'failed', 'interrupted', true) $$,
  'checking an answer fails anyone''s stale check of it and leaves stale checks of other answers running'
);

reset role;

create temporary table started (id uuid) on commit drop;
grant select, insert on started to authenticated;

select tests.login_as('sac_member');

insert into started select public.start_seller_answer_check('5ac00000-0000-0000-0000-0000000000a4');

select results_eq(
  $$ select status::text, failure_reason::text from public.seller_answer_check where id = '5ac00000-0000-0000-0000-0000000000c2' $$,
  $$ values ('failed', 'interrupted') $$,
  'starting a check fails the stale check of the same answer that someone else started'
);

select results_eq(
  $$ select c.message_id, c.question_id, c.requested_by, c.status::text
     from started
     join public.seller_answer_check c on c.id = started.id $$,
  $$ values ('5ac00000-0000-0000-0000-0000000000a4'::uuid, '5ac00000-0000-0000-0000-0000000000e1'::uuid,
       tests.get_uid('sac_member'), 'running') $$,
  'starting a check by its message returns the new running check'
);

select tests.login_as('sac_seller');

select throws_ok(
  $$ select public.start_seller_answer_check('5ac00000-0000-0000-0000-0000000000a4') $$,
  '42501', null,
  'the seller cannot start a check by its message'
);

select function_privs_are(
  'public', 'start_seller_answer_check', array['uuid'], 'service_role', array[]::text[],
  'the server cannot start a check, which would have no requester'
);

-- Buyer's counsel read results only, through one function.
select tests.login_as('sac_counsel');

select results_eq(
  $$ select id, question_id, message_id, status::text, overall::text, findings, follow_up, created_at, finished_at, stale
     from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1')
     where id = '5ac00000-0000-0000-0000-0000000000c1' $$,
  $$ values ('5ac00000-0000-0000-0000-0000000000c1'::uuid, '5ac00000-0000-0000-0000-0000000000e1'::uuid,
       '5ac00000-0000-0000-0000-0000000000a1'::uuid, 'checked', 'consistent',
       '[{"claim": "The lease is assignable", "verdict": "supported", "citations": [
         {"documentId": "5ac00000-0000-0000-0000-00000000c005", "documentName": "lease.pdf", "version": 1, "pageFrom": 1, "pageTo": 1, "excerpt": "Assignable with consent.", "fromOcr": false}]}]'::jsonb,
       'Please upload the lease consent clause.', now(), now(), true) $$,
  'buyer''s counsel read a check''s result and whether it is stale, citing only documents they can open, verdicts unchanged'
);

select results_eq(
  $$ select p.proargnames[2:] collate "default" from pg_proc p where p.oid = 'public.buyer_counsel_seller_answer_checks(uuid)'::regprocedure $$,
  $$ values (array['id', 'question_id', 'message_id', 'status', 'failure_reason', 'overall', 'findings', 'follow_up',
       'created_at', 'finished_at', 'stale']) $$,
  'buyer''s counsel never get a check''s steps, model, credits or requester'
);

select results_eq(
  $$ select id, status::text, failure_reason::text
     from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1')
     where id in ('5ac00000-0000-0000-0000-0000000000c1', '5ac00000-0000-0000-0000-0000000000c2') order by id $$,
  $$ values ('5ac00000-0000-0000-0000-0000000000c1'::uuid, 'checked', null),
            ('5ac00000-0000-0000-0000-0000000000c2'::uuid, 'failed', 'interrupted') $$,
  'buyer''s counsel read why a check failed'
);

select is_empty($$ select 1 from public.seller_answer_check $$, 'buyer''s counsel do not read the checks table');

select tests.login_as('sac_seller_law');

select is_empty(
  $$ select 1 from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1') $$,
  'seller''s counsel read no check'
);

select tests.login_as('sac_seller');

select is_empty(
  $$ select 1 from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1') $$,
  'the seller reads no check through counsel''s function'
);

select tests.login_as('sac_lender');

select is_empty(
  $$ select 1 from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1') $$,
  'a lender reads no check through counsel''s function'
);

select tests.login_as('sac_foreign');

select is_empty(
  $$ select 1 from public.buyer_counsel_seller_answer_checks('5ac00000-0000-0000-0000-0000000000d1') $$,
  'another team reads no check through counsel''s function'
);

-- AI calls meter against the check that made them.
select tests.login_as_service_role();

select public.reserve_ai_call(tests.account_id('sac-team'), 'claude-answer-check', 0,
  p_deal_id => '5ac00000-0000-0000-0000-0000000000d1',
  p_created_by => tests.get_uid('sac_owner'),
  p_seller_answer_check_id => '5ac00000-0000-0000-0000-0000000000c1');

reset role;

select results_eq(
  $$ select created_by, question_id, lender_ask_ai_draft_id, seller_answer_check_id from public.ai_call_log where model = 'claude-answer-check' $$,
  $$ values (tests.get_uid('sac_owner'), null::uuid, null::uuid, '5ac00000-0000-0000-0000-0000000000c1'::uuid) $$,
  'reserving an AI call records the check it was made for'
);

delete from public.seller_room_question where id = '5ac00000-0000-0000-0000-0000000000e1';

select is_empty(
  $$ select 1 from public.seller_answer_check where question_id = '5ac00000-0000-0000-0000-0000000000e1' $$,
  'deleting a question deletes its checks'
);

select results_eq(
  $$ select seller_answer_check_id from public.ai_call_log where model = 'claude-answer-check' $$,
  array[null::uuid],
  'deleting a check keeps its AI calls in the log'
);

select * from finish();
rollback;
