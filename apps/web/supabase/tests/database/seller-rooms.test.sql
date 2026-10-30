begin;
select no_plan();

-- Team "SR Team" owns deal d1. The owner manages it; sr_member is on the team
-- without deals.manage. sr_seller is invited to the deal's seller room,
-- sr_stranger is not.
select tests.create_user('sr_owner');
select tests.create_user('sr_member');
select tests.create_user('sr_seller');
select tests.create_user('sr_stranger');
select tests.create_user('sr_partner');
select tests.create_user('sr_other');

select tests.login_as_service_role();
select public.create_team_account('SR Team', tests.get_uid('sr_owner'), 'sr-team');
select public.append_deal_event('5e000000-0000-0000-0000-0000000000d1', 'deal',
  '5e000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sr-team'), 'firm_id', tests.create_firm(tests.account_id('sr-team')), 'owner_user_id', tests.get_uid('sr_owner'),
    'description', 'Seller room deal'), null, 'service');
select public.append_deal_event('5e000000-0000-0000-0000-0000000000d2', 'deal',
  '5e000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sr-team'), 'firm_id', tests.create_firm(tests.account_id('sr-team')), 'owner_user_id', tests.get_uid('sr_owner'),
    'description', 'Other seller room deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('sr_member'), tests.account_id('sr-team'), 'member');
insert into public.firm (id, account_id, name)
values ('5e000000-0000-0000-0000-0000000000f1', tests.account_id('sr-team'), 'Brennan Climate');
update public.deal set firm_id = '5e000000-0000-0000-0000-0000000000f1', code_name = 'Project Frost'
where id = '5e000000-0000-0000-0000-0000000000d1';
update public.accounts set picture_url = 'https://cdn.test/sr-team.png'
where id = tests.account_id('sr-team');
update public.accounts set name = 'Olive Owner', phone = '555-0100'
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name) values
  ('5e000000-0000-0000-0000-00000000f001', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', null, 'Shared'),
  ('5e000000-0000-0000-0000-00000000f002', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', '5e000000-0000-0000-0000-00000000f001', 'Shared child'),
  ('5e000000-0000-0000-0000-00000000f003', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', null, 'Team only');

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path) values
  ('5e000000-0000-0000-0000-00000000c001', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
    '5e000000-0000-0000-0000-00000000f002', 'shown.pdf', 'sr/shown.pdf'),
  ('5e000000-0000-0000-0000-00000000c002', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
    '5e000000-0000-0000-0000-00000000f003', 'team-only.pdf', 'sr/team-only.pdf');

insert into public.meeting (id, deal_id, account_id, type, transcript_text, summary, recording_url) values
  ('5e000000-0000-0000-0000-00000000e001', '5e000000-0000-0000-0000-0000000000d1', tests.account_id('sr-team'),
    'weekly', 'Shared transcript', 'Shared summary', 'https://rec.test/1'),
  ('5e000000-0000-0000-0000-00000000e002', '5e000000-0000-0000-0000-0000000000d1', tests.account_id('sr-team'),
    'weekly', 'Private transcript', 'Private summary', null);

-- ---- Ensuring the room ----
select tests.login_as('sr_member');
select throws_ok(
  $$ select public.ensure_seller_room('5e000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'a team member without deals.manage cannot open the seller room'
);

select tests.login_as('sr_owner');
create temporary table room_ids (id uuid) on commit drop;
grant select, insert on room_ids to authenticated;
insert into room_ids select public.ensure_seller_room('5e000000-0000-0000-0000-0000000000d1');
insert into room_ids select public.ensure_seller_room('5e000000-0000-0000-0000-0000000000d1');

select is(
  (select count(distinct id)::int from room_ids),
  1,
  'ensuring the room twice gives the same single room for the deal'
);
select isnt(
  (select uploads_folder_id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1'),
  null,
  'the room gets its shared uploads folder in the deal''s data room'
);

-- ---- The team sets the room up ----
select lives_ok(
  $$ insert into public.seller_room_member (room_id, user_id, email, name, invited_by)
     select id, tests.get_uid('sr_seller'), 'sr_seller@opendealbook.test', 'Sam Seller', tests.get_uid('sr_owner')
     from room_ids limit 1 $$,
  'a deal manager adds a seller to the room'
);
select lives_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select id, '5e000000-0000-0000-0000-00000000f001' from room_ids limit 1 $$,
  'a deal manager shows a folder in the room'
);
select lives_ok(
  $$ insert into public.seller_room_meeting (room_id, meeting_id)
     select id, '5e000000-0000-0000-0000-00000000e001' from room_ids limit 1 $$,
  'a deal manager shares a meeting in the room'
);
select lives_ok(
  $$ insert into public.seller_room_question (id, room_id, account_id, title, body)
     select '5e000000-0000-0000-0000-00000000a001', id, tests.account_id('sr-team'), 'Customer list?', 'Top ten customers by revenue'
     from room_ids limit 1 $$,
  'a deal manager asks the seller a question'
);

reset role;
insert into public.lender_package (deal_id, account_id, master_folder_id)
values ('5e000000-0000-0000-0000-0000000000d1', tests.account_id('sr-team'), '5e000000-0000-0000-0000-00000000f003');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('5e000000-0000-0000-0000-0000000000b0', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
  'Bank', '5e000000-0000-0000-0000-00000000f003');
insert into public.lender_ask (id, room_id, account_id, kind, title)
values ('5e000000-0000-0000-0000-00000000a0a0', '5e000000-0000-0000-0000-0000000000b0', tests.account_id('sr-team'),
  'ask', 'Bank of Somewhere asks for customers');

select tests.login_as('sr_owner');
select lives_ok(
  $$ insert into public.seller_room_question_route (question_id, lender_ask_id)
     values ('5e000000-0000-0000-0000-00000000a001', '5e000000-0000-0000-0000-00000000a0a0') $$,
  'a deal manager links the seller question to the lender ask it came from'
);

select tests.login_as('sr_owner');
insert into public.seller_room_member (room_id, user_id, email, name, invited_by)
select id, tests.get_uid('sr_partner'), 'sr_partner@opendealbook.test', 'Pat Partner', tests.get_uid('sr_owner')
from room_ids limit 1;
select public.ensure_seller_room('5e000000-0000-0000-0000-0000000000d2');
insert into public.seller_room_member (room_id, user_id, email, name, invited_by)
select id, tests.get_uid('sr_other'), 'sr_other@opendealbook.test', 'Olly Other', tests.get_uid('sr_owner')
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d2';

-- ---- Analysts see the sellers' names, never their emails ----
select tests.login_as('sr_member');
select is_empty(
  $$ select 1 from public.seller_room_member $$,
  'an analyst cannot read sellers'' emails from the room members'
);
select is_empty(
  $$ select 1 from public.deal_people('5e000000-0000-0000-0000-0000000000d1') p, unnest(p.entries) e
     where e.source = 'seller_room' and p.email is not null $$,
  'an analyst sees no seller''s email among the deal''s people'
);
select results_eq(
  $$ select name from public.seller_room_names('5e000000-0000-0000-0000-0000000000d1') order by name $$,
  $$ values ('Pat Partner'), ('Sam Seller') $$,
  'an analyst lists the names of the sellers in the deal''s room'
);

select tests.login_as('sr_owner');
select set_eq(
  $$ select p.email from public.deal_people('5e000000-0000-0000-0000-0000000000d1') p, unnest(p.entries) e
     where e.source = 'seller_room' $$,
  $$ values ('sr_partner@opendealbook.test'), ('sr_seller@opendealbook.test') $$,
  'a deal manager sees each seller''s email among the deal''s people'
);
select set_eq(
  $$ select email from public.seller_room_member m join room_ids r on r.id = m.room_id $$,
  $$ values ('sr_partner@opendealbook.test'), ('sr_seller@opendealbook.test') $$,
  'a deal manager reads the sellers'' emails'
);

-- ---- The seller in the room ----
select tests.login_as('sr_seller');
select results_eq(
  $$ select name, email from public.seller_room_member order by name $$,
  $$ values ('Pat Partner', 'sr_partner@opendealbook.test'), ('Sam Seller', 'sr_seller@opendealbook.test') $$,
  'a seller sees the names and emails of fellow sellers in their room, and no other room''s'
);
select results_eq(
  $$ select team_name::text, team_picture_url::text, is_open from public.my_seller_rooms() $$,
  $$ values ('SR Team', 'https://cdn.test/sr-team.png', true) $$,
  'the seller lists their room with the team''s name and picture'
);
select results_eq(
  $$ select deal_name from public.my_seller_rooms() $$,
  $$ values ('Brennan Climate') $$,
  'the seller''s rooms list names the deal by its business name, not its code name or description'
);
select results_eq(
  $$ select deal_name from public.seller_room_view((select id from public.my_seller_rooms())) $$,
  $$ values ('Brennan Climate') $$,
  'the seller''s room view names the deal by its business name'
);
select results_eq(
  $$ select deal_name, public_stage, contact_name, contact_phone
     from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Brennan Climate', 'Talking', 'Olive Owner', '555-0100') $$,
  'the seller''s deal header names the business, the public stage, and the deal owner with their phone'
);
select results_eq(
  $$ select public.seller_stage(key) from (values
       ('sourcing'), ('pre_nda'), ('nda_signed'), ('loi_submitted'), ('loi_accepted'),
       ('due_diligence'), ('pa_submitted'), ('pa_accepted'), ('announcement'), ('integration')
     ) as stages(key) $$,
  $$ values ('Talking'), ('Talking'), ('Talking'), ('LOI'), ('LOI'),
       ('Diligence'), ('Closing'), ('Closing'), ('Closed'), ('Closed') $$,
  'every team stage maps to one of the five public stages'
);

reset role;
update public.accounts set phone = null
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;
update public.accounts set team_phone = '555-0200' where id = tests.account_id('sr-team');
update public.deal set resolution = 'won' where id = '5e000000-0000-0000-0000-0000000000d1';
select tests.login_as('sr_seller');
select results_eq(
  $$ select public_stage, contact_name, contact_phone
     from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Closed', 'Olive Owner', '555-0200') $$,
  'a deal won shows Closed whatever its stage, and an owner without a phone falls back to the team phone'
);
reset role;
update public.accounts set phone = ''
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;
select tests.login_as('sr_seller');
select is(
  (select contact_phone from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1')),
  '555-0200',
  'an owner with an empty phone falls back to the team phone'
);
reset role;
update public.accounts set team_phone = '' where id = tests.account_id('sr-team');
select tests.login_as('sr_seller');
select is(
  (select contact_phone from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1')),
  null,
  'empty owner and team phones show no phone'
);
reset role;
update public.accounts set timezone = 'Pacific/Kiritimati'
where primary_owner_user_id = tests.get_uid('sr_seller') and is_personal_account;
update public.accounts set timezone = 'Pacific/Pago_Pago'
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;
select tests.login_as('sr_seller');
select is(
  (select today from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1')),
  (now() at time zone 'Pacific/Kiritimati')::date,
  'the seller''s today is in their own time zone'
);
reset role;
update public.accounts set timezone = null
where primary_owner_user_id = tests.get_uid('sr_seller') and is_personal_account;
select tests.login_as('sr_seller');
select is(
  (select today from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1')),
  (now() at time zone 'Pacific/Pago_Pago')::date,
  'without their own time zone, the seller''s today is in the team owner''s'
);
reset role;
update public.accounts set timezone = null
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;
select tests.login_as('sr_seller');
select is(
  (select today from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1')),
  (now() at time zone 'UTC')::date,
  'with no time zone on either, the seller''s today is in UTC'
);
reset role;
select throws_ok(
  $$ update public.accounts set team_phone = '555-0300'
     where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account $$,
  '23514',
  null,
  'a personal account has no team phone'
);
update public.accounts set phone = '555-0100'
where primary_owner_user_id = tests.get_uid('sr_owner') and is_personal_account;
update public.deal set resolution = null where id = '5e000000-0000-0000-0000-0000000000d1';
insert into public.checklist_item (account_id, deal_id, title, due_at, waiting_on, removed_at) values
  (tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', 'Send the lease', '2026-11-01T00:00:00Z', 'seller', null),
  (tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', 'Review the lease', null, 'us', null),
  (tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1', 'Old ask', null, 'seller', now());
select tests.login_as('sr_seller');
select results_eq(
  $$ select title, due_at from public.seller_waiting_items('5e000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Send the lease'::text, '2026-11-01T00:00:00Z'::timestamptz) $$,
  'the seller lists the checklist items waiting on them, with title and due date only'
);
select tests.login_as('sr_owner');
select lives_ok(
  $$ update public.accounts set team_phone = '555-0201' where id = tests.account_id('sr-team') $$,
  'a team settings manager sets the team phone'
);
select throws_ok(
  $$ update public.accounts set team_phone = repeat('5', 51) where id = tests.account_id('sr-team') $$,
  '23514',
  null,
  'a team phone longer than 50 characters is refused'
);
select tests.login_as('sr_seller');
select results_eq(
  $$ select id from public.dr_document order by name $$,
  $$ values ('5e000000-0000-0000-0000-00000000c001'::uuid) $$,
  'the seller reads documents under a shown folder and nothing else'
);
select ok(
  exists (select 1 from public.dr_folder f join public.seller_room r on r.uploads_folder_id = f.id),
  'the seller reads the shared uploads folder'
);
select results_eq(
  $$ select transcript_text, summary from public.seller_room_meetings((select id from public.seller_room)) $$,
  $$ values ('Shared transcript', 'Shared summary') $$,
  'the seller sees the transcript and summary of shared meetings only'
);
select results_eq(
  $$ select title from public.seller_room_question $$,
  $$ values ('Customer list?') $$,
  'the seller reads the room''s questions'
);
select is_empty(
  $$ select 1 from public.seller_room_question_route $$,
  'the seller never sees which lender ask a question came from'
);
select lives_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('5e000000-0000-0000-0000-00000000a001', 'seller', 'Attached the list') $$,
  'the seller answers a question in their room'
);
select throws_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('5e000000-0000-0000-0000-00000000a001', 'internal', 'Pretending to be the team') $$,
  '42501',
  null,
  'the seller cannot write as the team'
);

select has_column('public', 'seller_upload', 'folder_id', 'a seller upload names the folder it goes into');

reset role;
insert into public.lender_oversize_file (account_id, dr_folder_id, name, size_bytes)
select tests.account_id('sr-team'), uploads_folder_id, 'huge.mov', 999999999
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as('sr_seller');
select results_eq(
  $$ select name from public.lender_oversize_file $$,
  $$ values ('huge.mov') $$,
  'the seller sees an oversize placeholder in the room''s uploads'
);

reset role;
insert into public.document_template (id, account_id, name, type)
values ('5e000000-0000-0000-0000-0000000000c9', tests.account_id('sr-team'), 'LOI', 'loi');
insert into public.generated_document (id, account_id, deal_id, template_id, pdf_path)
values ('5e000000-0000-0000-0000-0000000000c8', tests.account_id('sr-team'),
  '5e000000-0000-0000-0000-0000000000d1', '5e000000-0000-0000-0000-0000000000c9', 'acct/deal/loi.pdf');
insert into public.document_share (account_id, generated_document_id, recipient_user_id, room_id, sent_at)
select tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000c8', tests.get_uid('sr_seller'), id, now()
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as('sr_seller');
select results_eq(
  $$ select template_name, firm_name from public.seller_room_documents((select id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1')) $$,
  $$ values ('LOI', 'Brennan Climate') $$,
  'the seller lists the documents the team sent into their room'
);

reset role;
insert into public.seller_question (deal_id, account_id, question, answer, answered_at)
values ('5e000000-0000-0000-0000-0000000000d1', tests.account_id('sr-team'), 'Old portal question', 'Old answer', now());

select tests.login_as('sr_seller');
select results_eq(
  $$ select question, answer from public.seller_room_legacy_questions((select id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1')) $$,
  $$ values ('Old portal question', 'Old answer') $$,
  'the seller reads the deal''s earlier seller questions in the room'
);

-- ---- Who hears about a new file, and what the digest may name ----
reset role;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, uploaded_by)
select '5e000000-0000-0000-0000-00000000c010', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
  uploads_folder_id, 'seller-upload.pdf', 'sr/seller-upload.pdf', tests.get_uid('sr_seller')
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1';
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, uploaded_by)
select '5e000000-0000-0000-0000-00000000c011', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
  uploads_folder_id, 'team-note.pdf', 'sr/team-note.pdf', tests.get_uid('sr_owner')
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as_service_role();
select results_eq(
  $$ select user_id from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c001') order by user_id $$,
  $$ select tests.get_uid(name) from (values ('sr_partner'), ('sr_seller')) as people(name) order by 1 $$,
  'a new file in a folder the team shows reaches every seller in the room'
);
select results_eq(
  $$ select user_id from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c011') order by user_id $$,
  $$ select tests.get_uid(name) from (values ('sr_partner'), ('sr_seller')) as people(name) order by 1 $$,
  'a file the team adds to the uploads reaches every seller in the room'
);
select is_empty(
  $$ select 1 from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c010') $$,
  'a seller''s own upload is never announced to other sellers'
);
select is_empty(
  $$ select 1 from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c002') $$,
  'a file the room does not show reaches no seller'
);
select results_eq(
  $$ select kind, name, folder_id from public.seller_digest_items(
       tests.get_uid('sr_seller'),
       array['5e000000-0000-0000-0000-00000000c001', '5e000000-0000-0000-0000-00000000c002']::uuid[],
       array['5e000000-0000-0000-0000-00000000f001', '5e000000-0000-0000-0000-00000000f003']::uuid[],
       array['5e000000-0000-0000-0000-00000000e001', '5e000000-0000-0000-0000-00000000e002']::uuid[])
     order by kind, name $$,
  $$ values ('document', 'shown.pdf', '5e000000-0000-0000-0000-00000000f002'::uuid),
            ('folder', 'Shared', null::uuid), ('meeting', 'weekly', null::uuid) $$,
  'the digest names only what the seller still sees: shown files with their folder, shared folders and meetings'
);

reset role;
update public.dr_document set removed_at = now() where id = '5e000000-0000-0000-0000-00000000c001';
select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c001') $$,
  'a removed file reaches no seller'
);
select is_empty(
  $$ select 1 from public.seller_digest_items(tests.get_uid('sr_seller'),
       array['5e000000-0000-0000-0000-00000000c001']::uuid[], '{}', '{}') $$,
  'the digest drops a file removed before it was sent'
);
reset role;
update public.dr_document set removed_at = null where id = '5e000000-0000-0000-0000-00000000c001';
update public.seller_room set closed_at = now() where deal_id = '5e000000-0000-0000-0000-0000000000d1';
select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.seller_document_recipients('5e000000-0000-0000-0000-00000000c001') $$,
  'the sellers of a closed room hear about no file'
);
reset role;
update public.seller_room set closed_at = null where deal_id = '5e000000-0000-0000-0000-0000000000d1';

-- ---- Someone who is not in the room ----
select tests.login_as('sr_stranger');
select is_empty($$ select 1 from public.my_seller_rooms() $$, 'a stranger has no seller rooms');
select is_empty($$ select 1 from public.seller_room $$, 'a stranger cannot read the room');
select is_empty(
  $$ select 1 from public.seller_deal_header('5e000000-0000-0000-0000-0000000000d1') $$,
  'a stranger reads no deal header'
);
select is_empty(
  $$ select 1 from public.seller_waiting_items('5e000000-0000-0000-0000-0000000000d1') $$,
  'a stranger lists no items waiting on the seller'
);
select is_empty($$ select 1 from public.seller_room_member $$, 'a stranger sees no room members');
select is_empty($$ select 1 from public.lender_oversize_file $$, 'a stranger sees no oversize placeholders');
select is_empty(
  $$ select 1 from public.seller_room_documents('5e000000-0000-0000-0000-0000000000d1') $$,
  'a stranger lists no sent documents'
);
select is_empty(
  $$ select 1 from public.seller_room_legacy_questions((select id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1')) $$,
  'a stranger reads no earlier seller questions'
);
select is_empty($$ select 1 from public.dr_document $$, 'a stranger reads no documents');
select is_empty($$ select 1 from public.seller_room_question $$, 'a stranger reads no questions');

-- ---- Closing the room, and archiving the deal ----
reset role;
update public.seller_room set closed_at = now() where deal_id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as('sr_seller');
select results_eq(
  $$ select is_open from public.my_seller_rooms() $$,
  $$ values (false) $$,
  'a closed room still lists, as closed'
);
select isnt_empty($$ select 1 from public.dr_document $$, 'a closed room still shows its documents to the seller, read-only');

reset role;
update public.seller_room set closed_at = null where deal_id = '5e000000-0000-0000-0000-0000000000d1';
update public.deal set archived_at = now() where id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as('sr_seller');
select results_eq(
  $$ select is_open from public.my_seller_rooms() $$,
  $$ values (false) $$,
  'archiving the deal closes its seller room'
);

reset role;
update public.deal set archived_at = null where id = '5e000000-0000-0000-0000-0000000000d1';

-- ---- A locked team: its own writes stop, the seller's do not ----
select tests.login_as_service_role();
select public.set_team_account_billing(true);
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('sr-team');

select tests.login_as('sr_owner');
select throws_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select id, '5e000000-0000-0000-0000-00000000f003' from public.seller_room limit 1 $$,
  '42501',
  null,
  'a locked team cannot change its seller room'
);

select tests.login_as('sr_seller');
select lives_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('5e000000-0000-0000-0000-00000000a001', 'seller', 'One more file') $$,
  'the seller can still answer while the team is locked'
);

select tests.login_as_service_role();
update public.accounts set trial_ends_at = now() + interval '1 day'
where id = tests.account_id('sr-team');

-- ---- Lender data never reaches the seller room ----
select tests.login_as('sr_owner');
select throws_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select id, '5e000000-0000-0000-0000-00000000f003' from public.seller_room
     where deal_id = '5e000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  null,
  'the team cannot show a lender room or lender package folder to sellers'
);

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('5e000000-0000-0000-0000-00000000f004', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d1',
  '5e000000-0000-0000-0000-00000000f003', 'Under the package');
insert into public.seller_room_folder (room_id, dr_folder_id)
select id, '5e000000-0000-0000-0000-00000000f004' from public.seller_room
where deal_id = '5e000000-0000-0000-0000-0000000000d1';

select tests.login_as('sr_seller');
select is_empty(
  $$ select 1 from public.dr_folder where id = '5e000000-0000-0000-0000-00000000f004' $$,
  'a seller room row pointing under a lender folder still shows the seller nothing'
);
select is_empty(
  $$ select 1 from public.dr_document where id = '5e000000-0000-0000-0000-00000000c002' $$,
  'the seller never reads a lender package document'
);

select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.seller_digest_items(tests.get_uid('sr_seller'), '{}',
       array['5e000000-0000-0000-0000-00000000f004']::uuid[], '{}') $$,
  'the digest never names a folder under the lender package, even when a room row points at it'
);

-- ---- The room's own columns ----
select tests.login_as('sr_owner');
select throws_ok(
  $$ update public.seller_room set uploads_folder_id = '5e000000-0000-0000-0000-00000000f001'
     where deal_id = '5e000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  null,
  'the team cannot repoint the room uploads folder'
);
select lives_ok(
  $$ update public.seller_room set welcome_note = 'Welcome', closed_at = null
     where deal_id = '5e000000-0000-0000-0000-0000000000d1' $$,
  'the team can change the welcome note and close or reopen the room'
);
select throws_like(
  $$ delete from public.dr_folder
     where id = (select uploads_folder_id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1') $$,
  '%seller room%',
  'the team cannot delete the sellers'' uploads folder while the room exists'
);

-- ---- A question file comes from that question's room ----
reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('sr_seller'), 'sr_seller@opendealbook.test', 'Sam Seller'
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d2';
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
select '5e000000-0000-0000-0000-00000000c003', tests.account_id('sr-team'), '5e000000-0000-0000-0000-0000000000d2',
  uploads_folder_id, 'other-deal.pdf', 'sr/other-deal.pdf'
from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d2';

select tests.login_as('sr_seller');
select throws_ok(
  $$ insert into public.seller_room_question_file (question_id, dr_document_id, side)
     values ('5e000000-0000-0000-0000-00000000a001', '5e000000-0000-0000-0000-00000000c003', 'seller') $$,
  '42501',
  null,
  'a seller cannot attach a file from another of their rooms to a question'
);

reset role;
delete from public.seller_room_member
where user_id = tests.get_uid('sr_seller')
  and room_id = (select id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d2');
delete from public.seller_room_removed_member;

-- ---- A shared meeting survives the deal being replayed ----
delete from public.meeting where id = '5e000000-0000-0000-0000-00000000e001';
insert into public.meeting (id, deal_id, account_id, type, transcript_text, summary)
values ('5e000000-0000-0000-0000-00000000e001', '5e000000-0000-0000-0000-0000000000d1', tests.account_id('sr-team'),
  'weekly', 'Shared transcript', 'Shared summary');

select tests.login_as('sr_seller');
select results_eq(
  $$ select transcript_text from public.seller_room_meetings((select id from public.seller_room where deal_id = '5e000000-0000-0000-0000-0000000000d1')) $$,
  $$ values ('Shared transcript') $$,
  'a meeting put back under the same id stays shared'
);

-- ---- Deleting a deal still takes its room and uploads folder ----
select tests.login_as_service_role();
select public.append_deal_event('5e000000-0000-0000-0000-0000000000d3', 'deal',
  '5e000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sr-team'), 'firm_id', tests.create_firm(tests.account_id('sr-team')), 'owner_user_id', tests.get_uid('sr_owner'),
    'description', 'Deal to delete'), null, 'service');
select tests.login_as('sr_owner');
select public.ensure_seller_room('5e000000-0000-0000-0000-0000000000d3');
reset role;
select lives_ok(
  $$ delete from public.deal where id = '5e000000-0000-0000-0000-0000000000d3' $$,
  'deleting a deal deletes its seller room and uploads folder'
);

-- ---- Removing the seller ----
select tests.login_as('sr_owner');
delete from public.seller_room_member where user_id = tests.get_uid('sr_seller');

reset role;
select results_eq(
  $$ select user_id, email from public.seller_room_removed_member $$,
  $$ values (tests.get_uid('sr_seller'), 'sr_seller@opendealbook.test') $$,
  'removing a seller records who was removed'
);

select tests.login_as('sr_seller');
select is_empty($$ select 1 from public.my_seller_rooms() $$, 'a removed seller has no room');
select is_empty($$ select 1 from public.dr_document $$, 'a removed seller reads no documents');

select * from finish();
rollback;
