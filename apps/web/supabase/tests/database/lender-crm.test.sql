begin;
select no_plan();

-- Account 1 owns deals d1 (rooms A and C, a closing milestone and a close
-- deadline) and d3 (room B, no deadline). Account 2 owns deal d2.
select tests.create_user('lc_owner');
select tests.create_user('lc_owner_2');
select tests.create_user('lc_lender_a');
select tests.create_user('lc_lender_b');

select tests.login_as_service_role();
select public.create_team_account('LC Acct', tests.get_uid('lc_owner'), 'lc-acct');
select public.create_team_account('LC Acct 2', tests.get_uid('lc_owner_2'), 'lc-acct-2');

select public.append_deal_event('1c000000-0000-0000-0000-0000000000d1', 'deal',
  '1c000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lc-acct'), 'firm_id', tests.create_firm(tests.account_id('lc-acct')), 'owner_user_id', tests.get_uid('lc_owner'),
    'description', 'CRM deal'), null, 'service');
select public.append_deal_event('1c000000-0000-0000-0000-0000000000d2', 'deal',
  '1c000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lc-acct-2'), 'firm_id', tests.create_firm(tests.account_id('lc-acct-2')), 'owner_user_id', tests.get_uid('lc_owner_2'),
    'description', 'Other CRM deal'), null, 'service');
select public.append_deal_event('1c000000-0000-0000-0000-0000000000d3', 'deal',
  '1c000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lc-acct'), 'firm_id', tests.create_firm(tests.account_id('lc-acct')), 'owner_user_id', tests.get_uid('lc_owner'),
    'description', 'No deadline deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('1c000000-0000-0000-0000-00000000f00a', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1', null, 'Room A'),
  ('1c000000-0000-0000-0000-00000000f00b', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d3', null, 'Room B'),
  ('1c000000-0000-0000-0000-00000000f00c', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1', null, 'Room C'),
  ('1c000000-0000-0000-0000-00000000f00d', tests.account_id('lc-acct-2'), '1c000000-0000-0000-0000-0000000000d2', null, 'Room D');

insert into public.firm (id, account_id, name)
values ('1c000000-0000-0000-0000-0000000000f1', tests.account_id('lc-acct'), 'Target Co');
update public.deal set firm_id = '1c000000-0000-0000-0000-0000000000f1'
where id = '1c000000-0000-0000-0000-0000000000d1';

insert into public.lender_brand (domain, name) values ('bank-a.test', 'Bank A'), ('bank-b.test', 'Bank B');

insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id, status)
values
  ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1', 'bank-a.test', 'Bank A', '1c000000-0000-0000-0000-00000000f00a', 'term_sheet'),
  ('1c000000-0000-0000-0000-0000000000b0', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d3', 'bank-a.test', 'Bank A again', '1c000000-0000-0000-0000-00000000f00b', 'declined'),
  ('1c000000-0000-0000-0000-0000000000c0', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1', 'bank-b.test', 'Bank B', '1c000000-0000-0000-0000-00000000f00c', 'invited'),
  ('1c000000-0000-0000-0000-0000000000d0', tests.account_id('lc-acct-2'), '1c000000-0000-0000-0000-0000000000d2', 'bank-a.test', 'Bank A elsewhere', '1c000000-0000-0000-0000-00000000f00d', 'invited');

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values
  ('1c000000-0000-0000-0000-0000000000a0', tests.get_uid('lc_lender_a'), 'lc_lender_a@opendealbook.test', tests.get_uid('lc_owner')),
  ('1c000000-0000-0000-0000-0000000000b0', tests.get_uid('lc_lender_b'), 'lc_lender_b@opendealbook.test', tests.get_uid('lc_owner'));

insert into public.lender_ask (room_id, account_id, kind, title)
values
  ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'ask', 'One'),
  ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'ask', 'Two'),
  ('1c000000-0000-0000-0000-0000000000b0', tests.account_id('lc-acct'), 'ask', 'Three');

insert into public.lender_ask (room_id, account_id, kind, title, return_route, status)
values
  ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'form', 'Application', 'upload', 'closed');
update public.lender_ask set status = 'closed' where title = 'Two';

select tests.login_as('lc_owner');

select lives_ok(
  $$ select public.append_deal_event('1c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '1c000000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
       '{"kind": "closing", "target_on": "2026-11-30"}'::jsonb) $$,
  'the team sets a closing target'
);
select lives_ok(
  $$ select public.append_deal_event('1c000000-0000-0000-0000-0000000000d1', 'deal',
       '1c000000-0000-0000-0000-0000000000d1', 'deal.close_deadline_set',
       '{"must_close_by": "2026-12-15", "must_close_reason": "Lease expires"}'::jsonb) $$,
  'the team sets a hard close deadline through the deal log'
);

-- ---- Lenders ----
select lives_ok(
  $$ insert into public.lender (id, account_id, name, website, domain, rate_type, sba_preferred, industries, states, tags)
     values ('1c000000-0000-0000-0000-00000000e001', tests.account_id('lc-acct'), 'Bank A', 'https://www.bank-a.test', 'bank-a.test',
       'fixed', true, '{hvac}', '{TX}', '{sba}') $$,
  'the team saves a lender'
);
select lives_ok(
  $$ insert into public.lender (id, account_id, name, website, domain)
     values ('1c000000-0000-0000-0000-00000000e002', tests.account_id('lc-acct'), 'Bank B', 'bank-b.test', 'bank-b.test') $$,
  'a second lender on another domain is saved'
);
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct'), 'Bank A dup', 'bank-a.test', 'bank-a.test') $$,
  '23505', null, 'a team keeps one lender per domain'
);
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct'), 'Unnormalized', 'www.bank-c.test', 'www.bank-c.test') $$,
  '23514', null, 'the domain is stored without a leading www.'
);
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct'), 'Upper', 'Bank-C.test', 'Bank-C.test') $$,
  '23514', null, 'the domain is stored lowercase'
);
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct'), 'No site', null, 'bank-d.test') $$,
  '23502', null, 'a lender needs a website'
);
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain, rate_type)
     values (tests.account_id('lc-acct'), 'Bad rate', 'bank-e.test', 'bank-e.test', 'floating') $$,
  '22P02', null, 'rate type is fixed, variable or either'
);

-- ---- Contacts ----
select lives_ok(
  $$ insert into public.lender_contact (id, account_id, lender_id, name, email, phone, is_primary)
     values ('1c000000-0000-0000-0000-00000000c001', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e001', 'Pat', 'pat@bank-a.test', '555-0100', true) $$,
  'a lender gets a primary contact'
);
select lives_ok(
  $$ insert into public.lender_contact (account_id, lender_id, name, is_primary)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e001', 'Sam', false),
            (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e001', 'Lee', false) $$,
  'a lender holds many non-primary contacts'
);
select throws_ok(
  $$ insert into public.lender_contact (account_id, lender_id, name, is_primary)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e001', 'Second primary', true) $$,
  '23505', null, 'a lender has at most one primary contact'
);
select lives_ok(
  $$ insert into public.lender_contact (account_id, lender_id, name, is_primary)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e002', 'Other primary', true) $$,
  'another lender has its own primary'
);
select lives_ok(
  $$ update public.lender_contact set is_primary = false where id = '1c000000-0000-0000-0000-00000000c001' $$,
  'a lender can be left with no primary'
);
select tests.login_as_service_role();
select throws_ok(
  $$ insert into public.lender_contact (account_id, lender_id, name)
     values (tests.account_id('lc-acct-2'), '1c000000-0000-0000-0000-00000000e001', 'Misfiled') $$,
  '23503', null, 'a contact belongs to its lender''s account and no other'
);
select tests.login_as('lc_owner');

-- ---- Isolation ----
select is(
  (select count(*) from public.lender), 2::bigint,
  'the team reads its lenders'
);
select is(
  (select count(*) from public.lender_contact), 4::bigint,
  'the team reads its lenders'' contacts'
);

select tests.login_as('lc_owner_2');

select is_empty($$ select 1 from public.lender $$, 'another team reads none of those lenders');
select is_empty($$ select 1 from public.lender_contact $$, 'another team reads none of those contacts');
select throws_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct'), 'Planted', 'planted.test', 'planted.test') $$,
  '42501', null, 'another team cannot save a lender into this team'
);
select lives_ok(
  $$ insert into public.lender (account_id, name, website, domain)
     values (tests.account_id('lc-acct-2'), 'Bank A', 'bank-a.test', 'bank-a.test') $$,
  'another team may save the same domain'
);
select is_empty(
  $$ select 1 from public.lender_history('1c000000-0000-0000-0000-00000000e001') $$,
  'another team reads no history of this team''s lender'
);

-- ---- History ----
select tests.login_as('lc_owner');

select results_eq(
  $$ select room_id, deal_id, status, asks_count from public.lender_history('1c000000-0000-0000-0000-00000000e001') order by room_id $$,
  $$ values
       ('1c000000-0000-0000-0000-0000000000a0'::uuid, '1c000000-0000-0000-0000-0000000000d1'::uuid, 'term_sheet'::public.lender_room_status, 2::bigint),
       ('1c000000-0000-0000-0000-0000000000b0'::uuid, '1c000000-0000-0000-0000-0000000000d3'::uuid, 'declined'::public.lender_room_status, 1::bigint) $$,
  'history lists this team''s rooms on the lender''s domain with status and asks, forms not counted'
);
select is(
  (select deal_name from public.lender_history('1c000000-0000-0000-0000-00000000e001') where room_id = '1c000000-0000-0000-0000-0000000000a0'),
  'Target Co', 'history names the deal'
);
select is(
  (select deal_name from public.lender_history('1c000000-0000-0000-0000-00000000e001') where room_id = '1c000000-0000-0000-0000-0000000000b0'),
  'Fixture business', 'history names every deal by its business'
);
select isnt(
  (select room_created_at from public.lender_history('1c000000-0000-0000-0000-00000000e001') where room_id = '1c000000-0000-0000-0000-0000000000a0'),
  null, 'history carries the room created date'
);

select lives_ok(
  $$ delete from public.lender where id = '1c000000-0000-0000-0000-00000000e001' $$,
  'the team deletes a lender'
);
select is(
  (select count(*) from public.lender_room where brand_domain = 'bank-a.test' and account_id = tests.account_id('lc-acct')),
  2::bigint, 'deleting a lender leaves its rooms'
);

-- ---- Making a contact primary ----
select lives_ok(
  $$ select public.set_lender_contact_primary('1c000000-0000-0000-0000-00000000c001') $$,
  'the team makes a contact primary'
);
select lives_ok(
  $$ insert into public.lender (id, account_id, name, website, domain)
     values ('1c000000-0000-0000-0000-00000000e003', tests.account_id('lc-acct'), 'Bank P', 'bank-p.test', 'bank-p.test') $$,
  'a lender for primaries is saved'
);
insert into public.lender_contact (id, account_id, lender_id, name, is_primary)
values
  ('1c000000-0000-0000-0000-00000000c0a1', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e003', 'P1', true),
  ('1c000000-0000-0000-0000-00000000c0a2', tests.account_id('lc-acct'), '1c000000-0000-0000-0000-00000000e003', 'P2', false);
select lives_ok(
  $$ select public.set_lender_contact_primary('1c000000-0000-0000-0000-00000000c0a2') $$,
  'the primary moves to another contact'
);
select results_eq(
  $$ select id from public.lender_contact where lender_id = '1c000000-0000-0000-0000-00000000e003' and is_primary $$,
  $$ values ('1c000000-0000-0000-0000-00000000c0a2'::uuid) $$,
  'that contact is the lender''s only primary'
);

-- ---- Outreach template ----
select lives_ok(
  $$ insert into public.lender_outreach_template (account_id, subject, body)
     values (tests.account_id('lc-acct'), 'Hello', 'Body') $$,
  'the team saves its outreach template'
);
select throws_ok(
  $$ insert into public.lender_outreach_template (account_id, subject, body)
     values (tests.account_id('lc-acct'), 'Again', 'Body') $$,
  '23505', null, 'a team has one outreach template'
);

-- ---- Terms sought ----
select lives_ok(
  $$ insert into public.deal_terms_sought (account_id, deal_id, loan_amount, loan_type, term_years, rate_type, seller_note_amount, notes)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1', 900000, 'sba_7a', 10, 'either', 100000, 'n') $$,
  'the team records the terms it seeks'
);
select throws_ok(
  $$ insert into public.deal_terms_sought (account_id, deal_id) values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d1') $$,
  '23505', null, 'a deal has one set of terms sought'
);
select throws_ok(
  $$ insert into public.deal_terms_sought (account_id, deal_id, loan_type)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d3', 'crypto') $$,
  '23514', null, 'the loan type is a funding source type'
);
select throws_ok(
  $$ insert into public.deal_terms_sought (account_id, deal_id)
     values (tests.account_id('lc-acct'), '1c000000-0000-0000-0000-0000000000d2') $$,
  '42501', null, 'terms sought cannot name another team''s deal'
);
select lives_ok(
  $$ update public.deal_terms_sought set loan_amount = 950000 where deal_id = '1c000000-0000-0000-0000-0000000000d1' $$,
  'terms sought are editable'
);

-- ---- Close deadline ----
select results_eq(
  $$ select must_close_by, must_close_reason from public.deal_close_deadline where deal_id = '1c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('2026-12-15'::date, 'Lease expires'::text) $$,
  'the deadline event projects the date and reason'
);
select lives_ok(
  $$ select public.append_deal_event('1c000000-0000-0000-0000-0000000000d1', 'deal',
       '1c000000-0000-0000-0000-0000000000d1', 'deal.close_deadline_set',
       '{"must_close_by": "2026-12-20", "must_close_reason": "Lease extended"}'::jsonb) $$,
  'the team moves the deadline'
);
select results_eq(
  $$ select must_close_by, must_close_reason from public.deal_close_deadline where deal_id = '1c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('2026-12-20'::date, 'Lease extended'::text) $$,
  'the latest deadline event wins'
);
select throws_ok(
  $$ insert into public.deal_close_deadline (deal_id, account_id, must_close_by)
     values ('1c000000-0000-0000-0000-0000000000d3', tests.account_id('lc-acct'), '2027-01-01') $$,
  '42501', null, 'the deadline is written through the deal log alone'
);

select throws_ok(
  $$ select public.append_deal_event('1c000000-0000-0000-0000-0000000000d3', 'deal',
       '1c000000-0000-0000-0000-0000000000d3', 'deal.close_deadline_set',
       '{"must_close_reason": "No date"}'::jsonb) $$,
  '23514', null, 'a deadline reason needs a date'
);
select lives_ok(
  $$ select public.append_deal_event('1c000000-0000-0000-0000-0000000000d3', 'deal',
       '1c000000-0000-0000-0000-0000000000d3', 'deal.close_deadline_set',
       '{"must_close_by": null, "must_close_reason": null}'::jsonb) $$,
  'a deadline can be cleared'
);

reset role;
select throws_ok(
  $$ update public.deal_close_deadline set must_close_by = null, must_close_reason = 'x'
     where deal_id = '1c000000-0000-0000-0000-0000000000d3' $$,
  '23514', null, 'the table refuses a reason without a date'
);
select tests.login_as_service_role();
select lives_ok(
  $$ select public.replay_deal('1c000000-0000-0000-0000-0000000000d1') $$,
  'the deal is rebuilt from its log'
);
select results_eq(
  $$ select must_close_by, must_close_reason from public.deal_close_deadline where deal_id = '1c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('2026-12-20'::date, 'Lease extended'::text) $$,
  'replay keeps the deadline'
);

-- ---- What a lender reads of the deal ----
select tests.login_as('lc_lender_a');

select results_eq(
  $$ select target_close_date, must_close_by, must_close_reason from public.lender_room_view('1c000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('2026-11-30'::date, '2026-12-20'::date, 'Lease extended'::text) $$,
  'a lender reads its room''s target close date, deadline and reason'
);
select is_empty(
  $$ select 1 from public.lender_room_view('1c000000-0000-0000-0000-0000000000b0') $$,
  'a lender reads no other room''s deadline'
);
select is_empty($$ select 1 from public.deal_close_deadline $$, 'a lender reads no deadline table row');
select is_empty($$ select 1 from public.deal_terms_sought $$, 'a lender reads no terms sought');

select tests.login_as('lc_lender_b');

select results_eq(
  $$ select target_close_date, must_close_by, must_close_reason from public.lender_room_view('1c000000-0000-0000-0000-0000000000b0') $$,
  $$ values (null::date, null::date, null::text) $$,
  'a room on a deal without a deadline shows none'
);

select tests.login_as_service_role();
update public.lender_room set closed_at = now() where id = '1c000000-0000-0000-0000-0000000000a0';
select tests.login_as('lc_lender_a');
select results_eq(
  $$ select target_close_date, must_close_by, must_close_reason from public.lender_room_view('1c000000-0000-0000-0000-0000000000a0') $$,
  $$ values (null::date, null::date, null::text) $$,
  'a closed room shows its lender no dates or reason'
);
select tests.login_as_service_role();
update public.lender_room set closed_at = null where id = '1c000000-0000-0000-0000-0000000000a0';

-- ---- Timeline confirmation ----
select tests.login_as('lc_lender_a');

select throws_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source)
     values ('1c000000-0000-0000-0000-0000000000a0', 'yes', tests.get_uid('lc_lender_a'), 'lender') $$,
  '42501', null, 'a lender cannot write its confirmation directly'
);
select is_empty($$ select 1 from public.lender_room_timeline_answer $$, 'no answer yet');

select tests.login_as('lc_owner');

select lives_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source)
     values ('1c000000-0000-0000-0000-0000000000a0', 'need_to_talk', tests.get_uid('lc_owner'), 'internal') $$,
  'the team records a lender''s answer by hand'
);
select throws_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source)
     values ('1c000000-0000-0000-0000-0000000000b0', 'yes', tests.get_uid('lc_owner'), 'lender') $$,
  '42501', null, 'the team cannot pass its entry off as the lender''s'
);
select throws_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source)
     values ('1c000000-0000-0000-0000-0000000000b0', 'maybe', tests.get_uid('lc_owner'), 'internal') $$,
  '22P02', null, 'an answer is yes, no or need_to_talk'
);
select lives_ok(
  $$ update public.lender_room_timeline_answer set answer = 'yes', answered_at = now() where room_id = '1c000000-0000-0000-0000-0000000000a0' $$,
  'the team overwrites the answer'
);
select is(
  (select count(*) from public.lender_room_timeline_answer where room_id = '1c000000-0000-0000-0000-0000000000a0'),
  1::bigint, 'a room keeps one answer'
);

select tests.login_as('lc_owner_2');

select is_empty($$ select 1 from public.lender_room_timeline_answer $$, 'another team reads no answer');
select throws_ok(
  $$ insert into public.lender_room_timeline_answer (room_id, answer, answered_by, source)
     values ('1c000000-0000-0000-0000-0000000000b0', 'no', tests.get_uid('lc_owner_2'), 'internal') $$,
  '42501', null, 'another team cannot answer for this team''s room'
);

select tests.login_as('lc_lender_a');

select is(
  (select answer::text from public.lender_room_timeline_answer where room_id = '1c000000-0000-0000-0000-0000000000a0'),
  'yes', 'a lender reads its own room''s answer'
);

select tests.login_as('lc_lender_b');

select is_empty($$ select 1 from public.lender_room_timeline_answer $$, 'a lender reads no other room''s answer');

-- ---- Outreach record ----
select tests.login_as('lc_owner');

select lives_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'pat@bank-a.test', 'Hello', 'First'),
            ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'pat@bank-a.test', 'Hello', 'Resend') $$,
  'the team records outreach, resends included'
);
select results_eq(
  $$ select count(*), count(sent_at), count(sent_by) from public.lender_room_outreach $$,
  $$ values (2::bigint, 2::bigint, 2::bigint) $$,
  'each record carries when it was sent and by whom'
);
select throws_ok(
  $$ update public.lender_room_outreach set body = 'Edited' $$,
  '42501', null, 'a record cannot be edited'
);
select throws_ok(
  $$ delete from public.lender_room_outreach $$,
  '42501', null, 'a record cannot be deleted'
);
select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body, status)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'x@y.test', 's', 'b', 'sent') $$,
  '42501', null, 'a record cannot be written already marked'
);
select is(
  (select status::text from public.lender_room_outreach where body = 'First'), 'sending',
  'a record starts as sending'
);
select lives_ok(
  $$ update public.lender_room_outreach set status = 'sent', provider_thread_id = 't1', provider_message_id = 'm1'
     where body = 'First' $$,
  'the sender marks a record sent and fills the provider ids'
);
select results_eq(
  $$ select status::text, provider_thread_id, provider_message_id from public.lender_room_outreach where body = 'First' $$,
  $$ values ('sent'::text, 't1'::text, 'm1'::text) $$,
  'the record is marked'
);
update public.lender_room_outreach set status = 'failed', provider_message_id = 'changed' where body = 'First';
select results_eq(
  $$ select status::text, provider_message_id from public.lender_room_outreach where body = 'First' $$,
  $$ values ('sent'::text, 'm1'::text) $$,
  'a marked record stays as marked'
);
select throws_ok(
  $$ update public.lender_room_outreach set provider_thread_id = 'x' where body = 'Resend' $$,
  '42501', null, 'a record that is still sending cannot be filled in without being marked'
);
select lives_ok(
  $$ update public.lender_room_outreach set status = 'failed' where body = 'Resend' $$,
  'the sender marks a record failed'
);
select throws_ok(
  $$ update public.lender_room_outreach set sent_by = null where body = 'Resend' $$,
  '42501', null, 'no one rewrites who sent a record'
);

select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct-2'), 'x@y.test', 's', 'b') $$,
  '23503', null, 'a record belongs to its room''s account and no other'
);

select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, sent_by, to_email, subject, body)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), tests.get_uid('lc_owner_2'), 'x@y.test', 's', 'b') $$,
  '42501', null, 'a send cannot be recorded as another user'
);

select tests.login_as('lc_lender_a');

select is_empty($$ select 1 from public.lender_room_outreach $$, 'a lender reads no outreach');
select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'x@y.test', 's', 'b') $$,
  '42501', null, 'a lender cannot record outreach'
);

select tests.login_as('lc_owner_2');

select is_empty($$ select 1 from public.lender_room_outreach $$, 'another team reads no outreach');
update public.lender_room_outreach set status = 'failed' where body = 'First';
select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.account_id('lc-acct'), 'x@y.test', 's', 'b') $$,
  '42501', null, 'another team cannot record outreach for this team''s room'
);

-- ---- Lenders due a nudge ----
-- Deal d4 holds rooms N01..N12, each backdated. N01 and N11 never heard from
-- (N11 only has internal activity); N03 last heard 8 days ago; N08 was sent
-- outreach 7 days ago and never answered. The rest are quiet for a reason.
select tests.login_as_service_role();
select public.append_deal_event('1c000000-0000-0000-0000-0000000000d4', 'deal',
  '1c000000-0000-0000-0000-0000000000d4', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lc-acct'), 'firm_id', tests.create_firm(tests.account_id('lc-acct')), 'owner_user_id', tests.get_uid('lc_owner'),
    'description', 'Nudge deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
select ('1c000000-0000-0000-0000-00000000f1' || lpad(n::text, 2, '0'))::uuid, tests.account_id('lc-acct'),
  '1c000000-0000-0000-0000-0000000000d4', null, 'N' || n
from generate_series(1, 12) n;

insert into public.lender_room (id, account_id, deal_id, brand_domain, lender_id, name, private_folder_id, status)
select ('1c000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, tests.account_id('lc-acct'),
  '1c000000-0000-0000-0000-0000000000d4', case when n = 1 then 'bank-b.test' end,
  case when n = 1 then '1c000000-0000-0000-0000-00000000e002'::uuid end, 'N' || n,
  ('1c000000-0000-0000-0000-00000000f1' || lpad(n::text, 2, '0'))::uuid,
  case when n = 5 then 'term_sheet'::public.lender_room_status
       when n = 2 then 'reviewing' else 'invited' end
from generate_series(1, 12) n;

set local session_replication_role = replica;
update public.lender_room set created_at = now() - interval '10 days'
where deal_id = '1c000000-0000-0000-0000-0000000000d4' and name <> 'N7';
update public.lender_room set created_at = now() - interval '3 days' where name = 'N7' and deal_id = '1c000000-0000-0000-0000-0000000000d4';
update public.lender_room set closed_at = now() where name = 'N6' and deal_id = '1c000000-0000-0000-0000-0000000000d4';

insert into public.lender_room_activity (room_id, account_id, side, action, created_at)
values
  ('1c000000-0000-0000-0000-000000000102', tests.account_id('lc-acct'), 'lender', 'room_opened', now() - interval '1 day'),
  ('1c000000-0000-0000-0000-000000000103', tests.account_id('lc-acct'), 'lender', 'room_opened', now() - interval '8 days'),
  ('1c000000-0000-0000-0000-000000000111', tests.account_id('lc-acct'), 'internal', 'room_opened', now() - interval '1 day');
insert into public.lender_room_outreach (room_id, account_id, to_email, subject, body, kind, sent_at, status)
values
  ('1c000000-0000-0000-0000-000000000104', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'nudge', now() - interval '1 day', 'sent'),
  ('1c000000-0000-0000-0000-000000000108', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'outreach', now() - interval '7 days', 'sent'),
  ('1c000000-0000-0000-0000-000000000101', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'nudge', now() - interval '1 day', 'sending'),
  ('1c000000-0000-0000-0000-000000000101', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'nudge', now() - interval '1 day', 'failed'),
  ('1c000000-0000-0000-0000-000000000101', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'outreach', now() - interval '9 days', 'failed'),
  ('1c000000-0000-0000-0000-000000000101', tests.account_id('lc-acct'), 'a@b.test', 's', 'b', 'outreach', now() - interval '9 days', 'sending');
insert into public.lender_room_email_reply (room_id, account_id, received_at, provider_message_id)
values ('1c000000-0000-0000-0000-000000000109', tests.account_id('lc-acct'), now() - interval '1 day', 'm1');
insert into public.lender_room_timeline_answer (room_id, answer, answered_at, source)
values ('1c000000-0000-0000-0000-000000000110', 'yes', now() - interval '1 day', 'lender');
insert into public.lender_ask (id, room_id, account_id, kind, title, created_at)
values ('1c000000-0000-0000-0000-00000000a512', '1c000000-0000-0000-0000-000000000112', tests.account_id('lc-acct'), 'ask', 'Q', now() - interval '1 day');
set local session_replication_role = origin;

select tests.login_as('lc_owner');

select results_eq(
  $$ select room_id from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) order by room_id $$,
  $$ values
       ('1c000000-0000-0000-0000-000000000101'::uuid),
       ('1c000000-0000-0000-0000-000000000103'::uuid),
       ('1c000000-0000-0000-0000-000000000108'::uuid),
       ('1c000000-0000-0000-0000-000000000111'::uuid) $$,
  'with five quiet days only open invited or reviewing rooms silent past them are due'
);
select results_eq(
  $$ select room_id, days_silent from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) order by room_id $$,
  $$ values
       ('1c000000-0000-0000-0000-000000000101'::uuid, 10),
       ('1c000000-0000-0000-0000-000000000103'::uuid, 8),
       ('1c000000-0000-0000-0000-000000000108'::uuid, 7),
       ('1c000000-0000-0000-0000-000000000111'::uuid, 10) $$,
  'silence counts from the last word, else the first send, else the room''s creation'
);
select results_eq(
  $$ select lender_id, deal_name, last_heard_at is null from public.lender_rooms_due_nudge(tests.account_id('lc-acct'))
     where room_id = '1c000000-0000-0000-0000-000000000101' $$,
  $$ values ('1c000000-0000-0000-0000-00000000e002'::uuid, 'Fixture business', true) $$,
  'a room matches its saved lender by domain, and may lack a last word'
);
select is(
  (select lender_id from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) where room_id = '1c000000-0000-0000-0000-000000000103'),
  null, 'a room with no saved lender has none'
);
select is(
  (select due_since - (select created_at from public.lender_room where id = '1c000000-0000-0000-0000-000000000101') from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) where room_id = '1c000000-0000-0000-0000-000000000101'),
  interval '5 days', 'a room is due from the end of the quiet days'
);
select results_eq(
  $$ select days_silent from public.lender_rooms_due_nudge(tests.account_id('lc-acct'), now() + interval '5 days')
     where room_id = '1c000000-0000-0000-0000-000000000102' $$,
  $$ values (6) $$,
  'a later as_of makes a recently heard room due and counts its silence up to that time'
);

select lives_ok(
  $$ insert into public.lender_nudge_setting (account_id, quiet_days) values (tests.account_id('lc-acct'), 2) $$,
  'the team sets its quiet days'
);
select throws_ok(
  $$ insert into public.lender_nudge_setting (account_id, quiet_days) values (tests.account_id('lc-acct'), 3) $$,
  '23505', null, 'a team has one setting'
);
select throws_ok(
  $$ update public.lender_nudge_setting set quiet_days = 0 $$,
  '23514', null, 'quiet days are positive'
);
select results_eq(
  $$ select room_id from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) order by room_id $$,
  $$ values
       ('1c000000-0000-0000-0000-000000000101'::uuid),
       ('1c000000-0000-0000-0000-000000000103'::uuid),
       ('1c000000-0000-0000-0000-000000000107'::uuid),
       ('1c000000-0000-0000-0000-000000000108'::uuid),
       ('1c000000-0000-0000-0000-000000000111'::uuid) $$,
  'the team''s quiet days set when a room is due'
);

select tests.login_as('lc_owner_2');

select is_empty(
  $$ select 1 from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) $$,
  'another team is told of no due room'
);
select is_empty($$ select 1 from public.lender_nudge_setting $$, 'another team reads no setting');

select tests.login_as('lc_owner');

select throws_ok(
  $$ insert into public.lender_room_email_reply (room_id, account_id, received_at, provider_message_id)
     values ('1c000000-0000-0000-0000-000000000101', tests.account_id('lc-acct'), now(), 'm9') $$,
  '42501', null, 'the team cannot record a reply by hand'
);
select is(
  (select count(*) from public.lender_room_email_reply), 1::bigint, 'the team reads recorded replies'
);

reset role;
select is(
  (select status::text from public.lender_room_outreach where body = 'First'), 'sent',
  'another team cannot mark this team''s record'
);
select tests.login_as_service_role();
select throws_ok(
  $$ insert into public.lender_room_email_reply (room_id, account_id, received_at, provider_message_id)
     values ('1c000000-0000-0000-0000-000000000109', tests.account_id('lc-acct'), now(), 'm1') $$,
  '23505', null, 'a reply is recorded once per room'
);
select lives_ok(
  $$ update public.lender_room_outreach set status = 'failed'
     where room_id = '1c000000-0000-0000-0000-000000000101' and kind = 'outreach' and status = 'sending' $$,
  'the scheduled job fails a record stuck sending'
);
select throws_ok(
  $$ update public.lender_room_outreach set body = 'Edited' where room_id = '1c000000-0000-0000-0000-000000000101' $$,
  '42501', null, 'the job changes nothing but the status'
);

select tests.login_as('lc_lender_a');
select is_empty($$ select 1 from public.lender_room_email_reply $$, 'a lender reads no reply');
select is_empty(
  $$ select 1 from public.lender_rooms_due_nudge(tests.account_id('lc-acct')) $$,
  'a lender is told of no due room'
);

-- ---- The daily job reads as the service role ----
select tests.login_as_service_role();
select set_config('request.jwt.claims', '{"role": "service_role"}', true);

select cmp_ok(
  (select count(*) from public.lender_rooms_due_nudge(tests.account_id('lc-acct'))), '>', 0::bigint,
  'the service role lists the rooms due a nudge'
);
select is(
  (select count(*) from public.lender_room_view('1c000000-0000-0000-0000-0000000000a0')), 1::bigint,
  'the service role reads a room''s view'
);

-- ---- One nudge to-do per room and teammate ----
reset role;
insert into public.personal_todo (id, account_id, user_id, title)
values
  ('1c000000-0000-0000-0000-00000000d001', tests.account_id('lc-acct'), tests.get_uid('lc_owner'), 'Nudge A'),
  ('1c000000-0000-0000-0000-00000000d002', tests.account_id('lc-acct'), tests.get_uid('lc_owner'), 'Nudge B');

select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.lender_nudge_todo (room_id, user_id, todo_id)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.get_uid('lc_owner'), '1c000000-0000-0000-0000-00000000d001') $$,
  'the job links a teammate''s to-do to a room'
);
select throws_ok(
  $$ insert into public.lender_nudge_todo (room_id, user_id, todo_id)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.get_uid('lc_owner'), '1c000000-0000-0000-0000-00000000d002') $$,
  '23505', null, 'a teammate has one to-do per room'
);
select throws_ok(
  $$ update public.lender_nudge_todo set todo_id = '1c000000-0000-0000-0000-00000000d002' $$,
  '42501', null, 'a link is not edited'
);
select lives_ok(
  $$ delete from public.lender_nudge_todo where room_id = '1c000000-0000-0000-0000-0000000000a0' $$,
  'the job clears a link'
);
select lives_ok(
  $$ insert into public.lender_nudge_todo (room_id, user_id, todo_id)
     values ('1c000000-0000-0000-0000-0000000000a0', tests.get_uid('lc_owner'), '1c000000-0000-0000-0000-00000000d001') $$,
  'and it can be made again'
);

select tests.login_as('lc_owner');
select throws_ok(
  $$ select 1 from public.lender_nudge_todo $$,
  '42501', null, 'signed-in users reach the table by no route'
);

reset role;
delete from public.personal_todo where id = '1c000000-0000-0000-0000-00000000d001';
select results_eq(
  $$ select room_id, user_id, todo_id from public.lender_nudge_todo where room_id = '1c000000-0000-0000-0000-0000000000a0' $$,
  $$ values ('1c000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lc_owner'), null::uuid) $$,
  'a to-do deleted by hand leaves its link, so the room is not nudged again at once'
);
select ok(
  exists (select 1 from odb.billing_lock_exempt_tables where table_name = 'lender_nudge_todo'),
  'the table names why a locked team may still have it'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.lender_nudge_todo'::regclass and tgname = 'refuse_team_move'),
  'its rows do not move between teams'
);

select * from finish();
rollback;
