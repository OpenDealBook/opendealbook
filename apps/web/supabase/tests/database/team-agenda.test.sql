begin;
select no_plan();

-- The owner owns deals d1 and d3; a deal lead owns d2, which the analyst
-- touches only through a checklist item she owns. The
-- owner last opened Home a day ago; outside counsel is not on the team.
select tests.create_user('ta_owner');
select tests.create_user('ta_analyst');
select tests.create_user('ta_lead');
select tests.create_user('ta_counsel');
select tests.create_user('ta_seller');

select tests.login_as_service_role();
select public.create_team_account('TA Team', tests.get_uid('ta_owner'), 'ta-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('ta-team'), tests.get_uid('ta_analyst'), 'analyst'),
  (tests.account_id('ta-team'), tests.get_uid('ta_lead'), 'deal_lead');
reset role;

insert into public.firm (id, account_id, name) values
  ('7a000000-0000-0000-0000-0000000000f1', tests.account_id('ta-team'), 'Brennan Climate'),
  ('7a000000-0000-0000-0000-0000000000f2', tests.account_id('ta-team'), 'Harbor Dental'),
  ('7a000000-0000-0000-0000-0000000000f3', tests.account_id('ta-team'), 'Oak Signs');

select tests.login_as_service_role();
select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ta-team'), 'owner_user_id', tests.get_uid(d.owner),
    'firm_id', d.firm_id, 'description', d.name), null, 'service')
from (values
  ('7a000000-0000-0000-0000-0000000000d1'::uuid, '7a000000-0000-0000-0000-0000000000f1'::uuid, 'Climate', 'ta_owner'),
  ('7a000000-0000-0000-0000-0000000000d2'::uuid, '7a000000-0000-0000-0000-0000000000f2'::uuid, 'Dental', 'ta_lead'),
  ('7a000000-0000-0000-0000-0000000000d3'::uuid, '7a000000-0000-0000-0000-0000000000f3'::uuid, 'Signs', 'ta_owner')
) as d (id, firm_id, name, owner);
reset role;

insert into public.personal_todo (id, account_id, deal_id, user_id, title, done, due_at) values
  ('7a000000-0000-0000-0000-000000000001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   tests.get_uid('ta_owner'), 'Call the broker', false, now() - interval '2 days'),
  ('7a000000-0000-0000-0000-000000000002', tests.account_id('ta-team'), null,
   tests.get_uid('ta_owner'), 'Renew the bank letter', false, now() + interval '3 days'),
  ('7a000000-0000-0000-0000-000000000003', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   tests.get_uid('ta_owner'), 'Plan the site visit', false, now() + interval '20 days'),
  ('7a000000-0000-0000-0000-000000000004', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   tests.get_uid('ta_owner'), 'Sent the NDA', true, now() - interval '5 days');

insert into public.checklist_item (id, account_id, deal_id, title, owner_user_id, due_at, status) values
  ('7a000000-0000-0000-0000-000000000011', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'Tax returns', null, now() + interval '2 days', 'not_started'),
  ('7a000000-0000-0000-0000-000000000012', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d2',
   'Lease review', tests.get_uid('ta_analyst'), now() - interval '1 day', 'requested'),
  ('7a000000-0000-0000-0000-000000000013', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'Bank statements', tests.get_uid('ta_owner'), now() - interval '3 days', 'received');

insert into public.deal_update (id, account_id, deal_id, author_id, subject, body, picks, status, submitted_at) values
  ('7a000000-0000-0000-0000-000000000021', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   tests.get_uid('ta_analyst'), 'LOI signed', 'We signed.', '[]', 'pending', now() - interval '1 hour');

insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, shared) values
  ('7a000000-0000-0000-0000-000000000031', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'closing', current_date + 10, true),
  ('7a000000-0000-0000-0000-000000000032', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d3',
   'loi_deadline', current_date + 20, false),
  ('7a000000-0000-0000-0000-000000000033', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d3',
   'diligence_end', current_date + 4, false);

insert into public.deal_close_deadline (deal_id, account_id, must_close_by, must_close_reason) values
  ('7a000000-0000-0000-0000-0000000000d2', tests.account_id('ta-team'), current_date + 5, 'Lease ends');

insert into public.dr_folder (id, account_id, deal_id, name) values
  ('7a000000-0000-0000-0000-00000000a001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1', 'Seller uploads'),
  ('7a000000-0000-0000-0000-00000000a002', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1', 'Bank A');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path) values
  ('7a000000-0000-0000-0000-00000000b001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   '7a000000-0000-0000-0000-00000000a001', 'P&L 2025.pdf', 'ta/pl-2025.pdf'),
  ('7a000000-0000-0000-0000-00000000b002', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   '7a000000-0000-0000-0000-00000000a001', 'P&L 2024.pdf', 'ta/pl-2024.pdf');
insert into public.seller_room (id, account_id, deal_id, uploads_folder_id) values
  ('7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   '7a000000-0000-0000-0000-00000000a001');
insert into public.seller_room_question (id, room_id, account_id, title) values
  ('7a000000-0000-0000-0000-00000000c002', '7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'),
   'Who holds the lease?');
insert into public.seller_room_activity (room_id, account_id, user_id, side, action, dr_document_id, payload, created_at) values
  ('7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'), tests.get_uid('ta_seller'), 'seller',
   'document_uploaded', '7a000000-0000-0000-0000-00000000b001', null, now() - interval '1 hour'),
  ('7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'), tests.get_uid('ta_seller'), 'seller',
   'document_uploaded', '7a000000-0000-0000-0000-00000000b002', null, now() - interval '2 days'),
  ('7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'), tests.get_uid('ta_seller'), 'seller',
   'question_answered', null, '{"question_id": "7a000000-0000-0000-0000-00000000c002"}', now() - interval '2 hours'),
  ('7a000000-0000-0000-0000-00000000c001', tests.account_id('ta-team'), tests.get_uid('ta_seller'), 'seller',
   'document_previewed', '7a000000-0000-0000-0000-00000000b001', null, now() - interval '1 hour');

insert into public.lender_brand (domain, name) values ('ta-bank.test', 'TA Bank');
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id, status) values
  ('7a000000-0000-0000-0000-00000000d001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'ta-bank.test', 'TA Bank', '7a000000-0000-0000-0000-00000000a002', 'invited');
insert into public.lender_ask (id, room_id, account_id, kind, title, return_route, created_at) values
  ('7a000000-0000-0000-0000-00000000d002', '7a000000-0000-0000-0000-00000000d001', tests.account_id('ta-team'),
   'ask', 'Send the AR aging', null, now() - interval '3 hours'),
  ('7a000000-0000-0000-0000-00000000d003', '7a000000-0000-0000-0000-00000000d001', tests.account_id('ta-team'),
   'form', 'Personal financial statement', 'upload', now() - interval '4 hours');

insert into public.counsel_message (id, account_id, deal_id, side, author_user_id, body, created_at) values
  ('7a000000-0000-0000-0000-00000000e001', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'buyer', tests.get_uid('ta_counsel'), 'Comments on the APA are in.', now() - interval '5 hours'),
  ('7a000000-0000-0000-0000-00000000e002', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d1',
   'buyer', tests.get_uid('ta_owner'), 'Thanks.', now() - interval '4 hours');

insert into public.contract (id, deal_id, account_id, type, current_version) values
  ('7a000000-0000-0000-0000-00000000f101', '7a000000-0000-0000-0000-0000000000d1', tests.account_id('ta-team'), 'apa', 1);
insert into public.contract_version (id, contract_id, account_id, version, source, party) values
  ('7a000000-0000-0000-0000-00000000f102', '7a000000-0000-0000-0000-00000000f101', tests.account_id('ta-team'), 1, 'upload', 'buyer');
insert into public.contract_review_request (id, account_id, contract_version_id, requested_by, requested_at) values
  ('7a000000-0000-0000-0000-00000000f103', tests.account_id('ta-team'), '7a000000-0000-0000-0000-00000000f102',
   tests.get_uid('ta_owner'), now() - interval '2 days');
insert into public.contract_review_decision (id, account_id, contract_version_id, side, decision, decided_by, without_counsel, decided_at) values
  ('7a000000-0000-0000-0000-00000000f104', tests.account_id('ta-team'), '7a000000-0000-0000-0000-00000000f102',
   'buyer', 'approved', tests.get_uid('ta_counsel'), false, now() - interval '6 hours');

insert into public.team_home_visit (account_id, user_id, last_seen_at, new_since) values
  (tests.account_id('ta-team'), tests.get_uid('ta_owner'), now() - interval '1 day', now() - interval '10 days');

select tests.login_as('ta_owner');

select results_eq(
  $$ select section, kind, item_id from public.team_agenda(tests.account_id('ta-team'), false)
     where section in ('overdue', 'due_soon') order by section, item_id $$,
  $$ values
     ('due_soon', 'todo', '7a000000-0000-0000-0000-000000000002'::uuid),
     ('due_soon', 'checklist', '7a000000-0000-0000-0000-000000000011'::uuid),
     ('overdue', 'todo', '7a000000-0000-0000-0000-000000000001'::uuid) $$,
  'a manager''s own overdue and due-soon items include unassigned checklist items, not done or far-off ones'
);

select results_eq(
  $$ select kind, item_id, deal_id from public.team_agenda(tests.account_id('ta-team'), false)
     where section = 'approval' $$,
  $$ values ('deal_update', '7a000000-0000-0000-0000-000000000021'::uuid, '7a000000-0000-0000-0000-0000000000d1'::uuid) $$,
  'a manager sees the update waiting on their approval'
);

select results_eq(
  $$ select kind, item_id, title from public.team_agenda(tests.account_id('ta-team'), false)
     where section = 'activity' order by kind, item_id $$,
  $$ values
     ('counsel_decision', '7a000000-0000-0000-0000-00000000f102'::uuid, 'approved'),
     ('counsel_message', '7a000000-0000-0000-0000-00000000e001'::uuid, 'Comments on the APA are in.'),
     ('lender_ask', '7a000000-0000-0000-0000-00000000d002'::uuid, 'Send the AR aging'),
     ('lender_form', '7a000000-0000-0000-0000-00000000d003'::uuid, 'Personal financial statement'),
     ('seller_answer', '7a000000-0000-0000-0000-00000000c002'::uuid, 'Who holds the lease?'),
     ('seller_upload', '7a000000-0000-0000-0000-00000000b001'::uuid, 'P&L 2025.pdf') $$,
  'outside activity since the last visit, without the team''s own messages, seller views or older uploads'
);

select public.record_team_home_visit(tests.account_id('ta-team'));

select is(
  (select count(*)::int from public.team_agenda(tests.account_id('ta-team'), false) where section = 'activity'),
  6,
  'reopening Home within the same session keeps what is new'
);

reset role;
update public.team_home_visit
set last_seen_at = now() - interval '10 minutes', new_since = now() - interval '3 days'
where user_id = tests.get_uid('ta_owner');
select tests.login_as('ta_owner');

select ok(
  '7a000000-0000-0000-0000-00000000b002' in (
    select item_id from public.team_agenda(tests.account_id('ta-team'), false) where section = 'activity'
  ),
  'during a session, new counts from the end of the previous session'
);

reset role;
update public.team_home_visit
set last_seen_at = now() - interval '31 minutes', new_since = now() - interval '3 days'
where user_id = tests.get_uid('ta_owner');
select tests.login_as('ta_owner');
select public.record_team_home_visit(tests.account_id('ta-team'));

select results_eq(
  $$ select new_since, last_seen_at from public.team_home_visit where user_id = tests.get_uid('ta_owner') $$,
  $$ values (now() - interval '31 minutes', now()) $$,
  'returning after 30 minutes away starts a new session from where the last one ended'
);

select results_eq(
  $$ select kind, item_id, detail from public.team_agenda(tests.account_id('ta-team'), false)
     where section = 'deadline' order by item_id $$,
  $$ values ('milestone', '7a000000-0000-0000-0000-000000000031'::uuid, 'closing') $$,
  'deadlines on my deals in the next 14 days: LOI, financing, close and must-close-by only'
);

select results_eq(
  $$ select kind, item_id, deal_id, detail from public.team_agenda(tests.account_id('ta-team'), false)
     where section = 'signoff' $$,
  $$ values ('signoff', '7a000000-0000-0000-0000-00000000f102'::uuid, '7a000000-0000-0000-0000-0000000000d1'::uuid, 'seller') $$,
  'a counsel sign-off is pending for each side without a decision since the request'
);

select results_eq(
  $$ select kind, item_id from public.team_agenda(tests.account_id('ta-team'), true)
     where section in ('overdue', 'deadline') order by kind, item_id $$,
  $$ values
     ('checklist', '7a000000-0000-0000-0000-000000000012'::uuid),
     ('milestone', '7a000000-0000-0000-0000-000000000031'::uuid),
     ('must_close_by', '7a000000-0000-0000-0000-0000000000d2'::uuid),
     ('todo', '7a000000-0000-0000-0000-000000000001'::uuid) $$,
  'a manager''s whole-team view adds teammates'' items and every deal''s deadlines'
);

select results_eq(
  $$ select item_id, room_id, deal_id from public.team_agenda(tests.account_id('ta-team'), false, now() + interval '40 days')
     where section = 'quiet_lender' $$,
  $$ select null::uuid, null::uuid, null::uuid where false $$,
  'a room never sent outreach is not a lender to nudge'
);

reset role;
insert into public.lender_room_outreach (room_id, account_id, sent_by, sent_at, kind, status, to_email, subject, body)
values ('7a000000-0000-0000-0000-00000000d001', tests.account_id('ta-team'), tests.get_uid('ta_owner'),
  now(), 'outreach', 'sent', 'loans@ta-bank.test', 'Climate', 'Package attached.');
select tests.login_as('ta_owner');

select results_eq(
  $$ select item_id, deal_id, title from public.team_agenda(tests.account_id('ta-team'), false, now() + interval '40 days')
     where section = 'quiet_lender' $$,
  $$ values ('7a000000-0000-0000-0000-00000000d001'::uuid, '7a000000-0000-0000-0000-0000000000d1'::uuid, 'TA Bank') $$,
  'a lender room quiet past the team''s quiet days is due a nudge'
);

reset role;
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('7a000000-0000-0000-0000-00000000a003', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d2', 'Dental Bank');
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id, status) values
  ('7a000000-0000-0000-0000-00000000d011', tests.account_id('ta-team'), '7a000000-0000-0000-0000-0000000000d2',
   'ta-bank.test', 'Dental Bank', '7a000000-0000-0000-0000-00000000a003', 'invited');
insert into public.lender_room_outreach (room_id, account_id, sent_by, sent_at, kind, status, to_email, subject, body)
values ('7a000000-0000-0000-0000-00000000d011', tests.account_id('ta-team'), tests.get_uid('ta_lead'),
  now(), 'outreach', 'sent', 'loans@ta-bank.test', 'Dental', 'Package attached.');

select tests.login_as('ta_analyst');

select results_eq(
  $$ select item_id, deal_id, title from public.team_agenda(tests.account_id('ta-team'), false, now() + interval '40 days')
     where section = 'quiet_lender' $$,
  $$ values ('7a000000-0000-0000-0000-00000000d011'::uuid, '7a000000-0000-0000-0000-0000000000d2'::uuid, 'Dental Bank') $$,
  'an analyst sees quiet lenders on the deals she works, not on the rest'
);

select throws_ok(
  $$ insert into public.lender_room_outreach (room_id, account_id, sent_by, kind, status, to_email, subject, body)
     values ('7a000000-0000-0000-0000-00000000d011', tests.account_id('ta-team'), tests.get_uid('ta_analyst'),
       'nudge', 'sending', 'loans@ta-bank.test', 'Nudge', 'Any news?') $$,
  '42501', null,
  'seeing a quiet lender does not let an analyst send the nudge'
);

select results_eq(
  $$ select section, kind, item_id from public.team_agenda(tests.account_id('ta-team'), true)
     where section in ('overdue', 'due_soon', 'approval', 'deadline') order by section, item_id $$,
  $$ values
     ('deadline', 'must_close_by', '7a000000-0000-0000-0000-0000000000d2'::uuid),
     ('overdue', 'checklist', '7a000000-0000-0000-0000-000000000012'::uuid) $$,
  'an analyst sees her own items and the deals she touches, never approvals or the whole team'
);

select is_empty(
  $$ select 1 from public.team_agenda(tests.account_id('ta-team'), false) where section = 'activity' $$,
  'an analyst who has never opened Home sees no activity from before she joined'
);

select public.record_team_home_visit(tests.account_id('ta-team'));

select results_eq(
  $$ select new_since, last_seen_at from public.team_home_visit $$,
  $$ select m.created_at, now() from public.accounts_memberships m
     where m.account_id = tests.account_id('ta-team') and m.user_id = tests.get_uid('ta_analyst') $$,
  'a first visit counts what is new from when she joined'
);

select throws_ok(
  $$ insert into public.team_home_visit (account_id, user_id, last_seen_at, new_since)
     values (tests.account_id('ta-team'), tests.get_uid('ta_lead'), now(), now()) $$,
  '42501', null,
  'nobody records a visit for someone else'
);

select is_empty(
  $$ select 1 from public.team_home_visit where user_id = tests.get_uid('ta_owner') $$,
  'a member reads only her own visit'
);

select tests.login_as('ta_counsel');

select is_empty(
  $$ select 1 from public.team_agenda(tests.account_id('ta-team'), true) $$,
  'someone outside the team gets no agenda'
);

select throws_ok(
  $$ select public.record_team_home_visit(tests.account_id('ta-team')) $$,
  '42501', null,
  'someone outside the team records no visit'
);

select * from finish();
rollback;
