begin;
select no_plan();

-- A team whose owner manages deal d1, with an analyst and a plain member who
-- both do deal work, a "Buyer's counsel" folder, a team folder, and an open
-- seller room.
select tests.create_user('ar_owner');
select tests.create_user('ar_analyst');
select tests.create_user('ar_member');
select tests.create_user('ar_viewer');

select tests.login_as_service_role();
select public.create_team_account('AR Team', tests.get_uid('ar_owner'), 'ar-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('ar-team'), tests.get_uid('ar_analyst'), 'analyst'),
  (tests.account_id('ar-team'), tests.get_uid('ar_member'), 'member'),
  (tests.account_id('ar-team'), tests.get_uid('ar_viewer'), 'viewer');

select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal',
  'a7000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ar-team'), 'firm_id', tests.create_firm(tests.account_id('ar-team')), 'owner_user_id', tests.get_uid('ar_owner'),
    'description', 'Analyst rights deal'), null, 'service');

insert into public.dr_folder (id, account_id, deal_id, name) values
  ('a7000000-0000-0000-0000-00000000f001', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'Financials');
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
select 'a7000000-0000-0000-0000-00000000f002', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1',
  public.ensure_counsel_uploads_folder('a7000000-0000-0000-0000-0000000000d1'), 'Counsel drafts';

insert into public.dr_folder (id, account_id, deal_id, name) values
  ('a7000000-0000-0000-0000-00000000f003', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'Seller uploads');
insert into public.seller_room (id, account_id, deal_id, uploads_folder_id) values
  ('a7000000-0000-0000-0000-0000000000a9', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1',
   'a7000000-0000-0000-0000-00000000f003');

insert into public.checklist_template (id, account_id, name) values
  ('a7000000-0000-0000-0000-0000000000e9', tests.account_id('ar-team'), 'Standard');
insert into public.calc_version (id, account_id, deal_id, type) values
  ('a7000000-0000-0000-0000-0000000000b7', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'deal');
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('a7000000-0000-0000-0000-00000000f004', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'Lender A');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id) values
  ('a7000000-0000-0000-0000-0000000000aa', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'Lender A',
   'a7000000-0000-0000-0000-00000000f004');
insert into public.lender_ask (id, room_id, account_id, kind, title) values
  ('a7000000-0000-0000-0000-0000000000ab', 'a7000000-0000-0000-0000-0000000000aa', tests.account_id('ar-team'), 'ask', 'Tax returns?');

-- ---- members lose team settings; deal managers keep them ----
select is(
  public.has_permission(tests.get_uid('ar_member'), tests.account_id('ar-team'), 'settings.manage'),
  false,
  'a plain member cannot change team settings'
);

-- ---- analysts and members do the deal work ----
select tests.login_as('ar_analyst');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'offer',
       'a7000000-0000-0000-0000-0000000000a1', 'offer.drafted', '{}'::jsonb) $$,
  'an analyst drafts an offer'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.created',
       '{"type":"loi","status":"draft","current_version":0}'::jsonb) $$,
  'an analyst drafts an LOI'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'checklist_item',
       'a7000000-0000-0000-0000-0000000000e1', 'checklist_item.added', '{"title":"Tax returns"}'::jsonb) $$,
  'an analyst adds a checklist item'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'dr_document',
       'a7000000-0000-0000-0000-0000000000b1', 'dr_document.added',
       jsonb_build_object('folder_id', 'a7000000-0000-0000-0000-00000000f001', 'name', 'pl.pdf',
         'storage_path', 'deal/a7000000-0000-0000-0000-0000000000d1/pl.pdf',
         'uploaded_by', tests.get_uid('ar_analyst'))) $$,
  'an analyst uploads to a team data-room folder'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('data-room', 'deal/a7000000-0000-0000-0000-0000000000d1/pl.pdf', tests.get_uid('ar_analyst')::text) $$,
  'an analyst stores a data-room file'
);
select lives_ok(
  $$ insert into public.seller_room_question (room_id, account_id, title)
     values ('a7000000-0000-0000-0000-0000000000a9', tests.account_id('ar-team'), 'Lease terms?') $$,
  'an analyst asks the seller in an existing room'
);

select tests.login_as('ar_member');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d2', 'deal',
       'a7000000-0000-0000-0000-0000000000d2', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ar-team'), 'firm_id', tests.create_firm(tests.account_id('ar-team')), 'description', 'Member deal')) $$,
  'a member creates a deal'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d2', 'offer',
       'a7000000-0000-0000-0000-0000000000a2', 'offer.drafted', '{}'::jsonb) $$,
  'a member drafts an offer'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'checklist_item',
       'a7000000-0000-0000-0000-0000000000e2', 'checklist_item.added', '{"title":"Leases"}'::jsonb) $$,
  'a member adds a checklist item'
);

-- ---- the manager work stays with deals.manage, and the refusal names it ----
select tests.login_as('ar_analyst');
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal',
       'a7000000-0000-0000-0000-0000000000d1', 'deal.financials_adopted', '{}'::jsonb) $$,
  '42501', 'not authorized to append deal.financials_adopted on deal a7000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'an analyst cannot adopt financials'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal',
       'a7000000-0000-0000-0000-0000000000d1', 'deal.stage_changed', '{"stage":"loi_submitted"}'::jsonb) $$,
  '42501', 'not authorized to append deal.stage_changed on deal a7000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'an analyst cannot change the stage'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'offer',
       'a7000000-0000-0000-0000-0000000000a1', 'offer.submitted', '{}'::jsonb) $$,
  '42501', 'not authorized to append offer.submitted on deal a7000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'an analyst cannot send an offer'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'dr_document',
       'a7000000-0000-0000-0000-0000000000b1', 'dr_document.removed', '{}'::jsonb) $$,
  '42501', 'not authorized to append dr_document.removed on deal a7000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'an analyst cannot delete a shared document'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal_participant',
       'a7000000-0000-0000-0000-0000000000f9', 'deal_participant.added', '{}'::jsonb) $$,
  '42501', 'not authorized to append deal_participant.added on deal a7000000-0000-0000-0000-0000000000d1: needs participants.manage',
  'an analyst cannot invite an outside party'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'dr_document',
       'a7000000-0000-0000-0000-0000000000b2', 'dr_document.added',
       jsonb_build_object('folder_id', 'a7000000-0000-0000-0000-00000000f002', 'name', 'memo.pdf',
         'storage_path', 'deal/a7000000-0000-0000-0000-0000000000d1/memo.pdf',
         'uploaded_by', tests.get_uid('ar_analyst'))) $$,
  '42501', 'not authorized to add a document to a counsel folder on deal a7000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'an analyst cannot upload inside a counsel folder'
);
select throws_ok(
  $$ select public.ensure_seller_room('a7000000-0000-0000-0000-0000000000d2') $$,
  '42501', null,
  'an analyst cannot open a new seller room'
);

select tests.login_as('ar_owner');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'dr_document',
       'a7000000-0000-0000-0000-0000000000b3', 'dr_document.added',
       jsonb_build_object('folder_id', 'a7000000-0000-0000-0000-00000000f002', 'name', 'memo.pdf',
         'storage_path', 'deal/a7000000-0000-0000-0000-0000000000d1/memo.pdf',
         'uploaded_by', tests.get_uid('ar_owner'))) $$,
  'a deal manager uploads inside a counsel folder'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal',
       'a7000000-0000-0000-0000-0000000000d1', 'deal.stage_changed', '{"stage":"loi_submitted"}'::jsonb) $$,
  'a deal manager changes the stage'
);

-- ---- meetings, milestones and counsel comments are deal work ----
select tests.login_as('ar_analyst');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'meeting',
       'a7000000-0000-0000-0000-0000000000a3', 'meeting.scheduled',
       '{"type":"weekly","scheduled_at":"2026-11-02T15:00:00Z"}'::jsonb) $$,
  'an analyst schedules a meeting'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'meeting_action_item',
       'a7000000-0000-0000-0000-0000000000a4', 'meeting_action_item.added',
       '{"meeting_id":"a7000000-0000-0000-0000-0000000000a3","description":"Call the landlord"}'::jsonb) $$,
  'an analyst adds a meeting action item'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       'a7000000-0000-0000-0000-0000000000a5', 'deal_milestone.set',
       '{"kind":"loi_deadline","target_on":"2026-12-01"}'::jsonb) $$,
  'an analyst sets a milestone date'
);
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.comment_posted', '{}'::jsonb) $$,
  'an analyst logs a contract comment'
);

-- ---- a contract's status is the managers' to change ----
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set', '{"current_version":1}'::jsonb) $$,
  'an analyst moves a draft to its next version'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set',
       '{"current_version":1,"status":"signed"}'::jsonb) $$,
  '42501', 'not authorized to change the status of contract a7000000-0000-0000-0000-0000000000c1: needs deals.manage',
  'an analyst cannot mark a contract signed'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c2', 'contract.created',
       '{"type":"apa","status":"signed","current_version":0}'::jsonb) $$,
  '42501', 'not authorized to change the status of contract a7000000-0000-0000-0000-0000000000c2: needs deals.manage',
  'an analyst cannot create a contract already signed'
);
select tests.login_as('ar_owner');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set',
       '{"current_version":1,"status":"signed"}'::jsonb) $$,
  'a deal manager marks a contract signed'
);
select tests.login_as('ar_analyst');
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.created',
       '{"type":"loi","status":"draft","current_version":0}'::jsonb) $$,
  '42501', 'not authorized to change the status of contract a7000000-0000-0000-0000-0000000000c1: needs deals.manage',
  'an analyst cannot turn a signed contract back into a draft'
);

-- ---- the team checklist library is the managers' ----
select throws_ok(
  $$ insert into public.checklist_template (account_id, name) values (tests.account_id('ar-team'), 'Analyst library') $$,
  '42501', null,
  'an analyst cannot add to the team checklist library'
);
select throws_ok(
  $$ select public.set_default_checklist_template('a7000000-0000-0000-0000-0000000000e9') $$,
  '42501', null,
  'an analyst cannot choose the default checklist template'
);

-- ---- thesis, worksheets, calculators and uploads are deal work ----
select lives_ok(
  $$ insert into public.deal_thesis (account_id, deal_id) values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1') $$,
  'an analyst writes the deal thesis'
);
select lives_ok(
  $$ insert into public.deal_worksheet_row (account_id, deal_id, worksheet_type)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'margin_analysis') $$,
  'an analyst adds a worksheet row'
);
select lives_ok(
  $$ insert into public.calc_version (id, account_id, deal_id, type) values
       ('a7000000-0000-0000-0000-0000000000b4', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'deal'),
       ('a7000000-0000-0000-0000-0000000000b5', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'deal'),
       ('a7000000-0000-0000-0000-0000000000b6', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'deal') $$,
  'an analyst saves calculator versions'
);
select lives_ok(
  $$ insert into public.funding_source (account_id, calc_version_id)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000b4') $$,
  'an analyst fills in a calculator'
);
select lives_ok(
  $$ update public.calc_version set name = 'Base case' where id = 'a7000000-0000-0000-0000-0000000000b5' $$,
  'an analyst edits her calculator version'
);
select throws_ok(
  $$ update public.calc_version set is_primary = true where id = 'a7000000-0000-0000-0000-0000000000b5' $$,
  '42501', 'choosing the primary calculator needs deals.manage',
  'an analyst cannot make a calculator version primary'
);
select throws_ok(
  $$ insert into public.calc_version (account_id, deal_id, type, is_primary)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'deal', true) $$,
  '42501', 'choosing the primary calculator needs deals.manage',
  'an analyst cannot save a calculator version as primary'
);
select tests.login_as('ar_owner');
select lives_ok(
  $$ update public.calc_version set is_primary = true where id = 'a7000000-0000-0000-0000-0000000000b5' $$,
  'a deal manager makes a calculator version primary'
);
select tests.login_as('ar_analyst');
select throws_ok(
  $$ update public.calc_version set is_primary = false where id = 'a7000000-0000-0000-0000-0000000000b5' $$,
  '42501', 'choosing the primary calculator needs deals.manage',
  'an analyst cannot clear the primary calculator version'
);
select lives_ok(
  $$ insert into public.upload_batch (account_id, deal_id, kind)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'single') $$,
  'an analyst stages an upload'
);

reset role;
insert into public.deal_financials (deal_id, account_id, source_calc_version_id)
values ('a7000000-0000-0000-0000-0000000000d1', tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000b6');

select tests.login_as('ar_analyst');
delete from public.calc_version where id in (
  'a7000000-0000-0000-0000-0000000000b4', 'a7000000-0000-0000-0000-0000000000b5',
  'a7000000-0000-0000-0000-0000000000b7', 'a7000000-0000-0000-0000-0000000000b6');
reset role;
select results_eq(
  $$ select id from public.calc_version where id in (
       'a7000000-0000-0000-0000-0000000000b4', 'a7000000-0000-0000-0000-0000000000b5',
       'a7000000-0000-0000-0000-0000000000b6', 'a7000000-0000-0000-0000-0000000000b7') order by id $$,
  $$ values ('a7000000-0000-0000-0000-0000000000b5'::uuid), ('a7000000-0000-0000-0000-0000000000b6'::uuid),
       ('a7000000-0000-0000-0000-0000000000b7'::uuid) $$,
  'an analyst deletes only her own calculator versions that are neither primary nor adopted'
);
select tests.login_as('ar_owner');
delete from public.calc_version where id = 'a7000000-0000-0000-0000-0000000000b5';
reset role;
select is_empty(
  $$ select 1 from public.calc_version where id = 'a7000000-0000-0000-0000-0000000000b5' $$,
  'a deal manager deletes any calculator version'
);

-- ---- answering lender asks is deal work ----
select tests.login_as('ar_analyst');
select isnt_empty(
  $$ select 1 from public.lender_room where id = 'a7000000-0000-0000-0000-0000000000aa' $$,
  'an analyst sees the deal''s lender rooms'
);
select lives_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('a7000000-0000-0000-0000-0000000000ab', 'internal', 'Attached the 2024 returns') $$,
  'an analyst answers a lender ask'
);
select results_eq(
  $$ update public.lender_ask set status = 'answered' where id = 'a7000000-0000-0000-0000-0000000000ab' returning status::text $$,
  $$ values ('answered') $$,
  'an analyst moves a lender ask along'
);
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, name, private_folder_id)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1', 'Lender Z', 'a7000000-0000-0000-0000-00000000f004') $$,
  '42501', null,
  'an analyst cannot create a lender room'
);

-- ---- team comments on contracts and meeting series are deal work ----
reset role;
insert into public.contract_version (id, contract_id, account_id, version, source, party)
values ('a7000000-0000-0000-0000-0000000000cb', 'a7000000-0000-0000-0000-0000000000c1', tests.account_id('ar-team'), 1, 'upload', 'buyer');

select tests.login_as('ar_analyst');
select lives_ok(
  $$ insert into public.contract_comment (account_id, contract_version_id, author_user_id, author_side, body)
     values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000cb', tests.get_uid('ar_analyst'), 'buyer', 'Check the earn-out') $$,
  'an analyst comments on a contract for the team'
);
select results_eq(
  $$ update public.contract_comment set resolved_at = now()
     where contract_version_id = 'a7000000-0000-0000-0000-0000000000cb' returning body $$,
  $$ values ('Check the earn-out') $$,
  'an analyst resolves a team comment'
);
select lives_ok(
  $$ insert into public.meeting_series (account_id, deal_id) values (tests.account_id('ar-team'), 'a7000000-0000-0000-0000-0000000000d1') $$,
  'an analyst sets up a meeting series'
);

-- ---- adding a version advances the contract; adopting an older one is the managers' ----
reset role;
insert into public.contract_version (id, contract_id, account_id, version, source, party)
values ('a7000000-0000-0000-0000-0000000000cc', 'a7000000-0000-0000-0000-0000000000c1', tests.account_id('ar-team'), 2, 'upload', 'seller');

select tests.login_as('ar_analyst');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set', '{"current_version":2}'::jsonb) $$,
  'an analyst advances a contract to its newest version'
);
select throws_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set', '{"current_version":1}'::jsonb) $$,
  '42501', 'not authorized to adopt an older version of contract a7000000-0000-0000-0000-0000000000c1: needs deals.manage',
  'an analyst cannot adopt an older version'
);
select tests.login_as('ar_owner');
select lives_ok(
  $$ select public.append_deal_event('a7000000-0000-0000-0000-0000000000d1', 'contract',
       'a7000000-0000-0000-0000-0000000000c1', 'contract.version_set', '{"current_version":1}'::jsonb) $$,
  'a deal manager adopts an older version'
);

-- ---- deal updates: workers draft and submit, managers approve ----
select tests.login_as('ar_member');
select lives_ok(
  $$ select public.submit_deal_update(public.create_deal_update('a7000000-0000-0000-0000-0000000000d1',
       'LOI signed', 'We signed the LOI.', '{"groups":[],"people":[]}'::jsonb)) $$,
  'a member drafts a deal update and submits it for approval'
);
select is(
  (select status::text from public.deal_update where author_id = tests.get_uid('ar_member')),
  'pending',
  'the member''s update waits for approval'
);
select throws_ok(
  $$ select public.decide_deal_update(u.id, u.version, 'approved') from public.deal_update u
     where u.author_id = tests.get_uid('ar_member') $$,
  '42501', 'not allowed to approve deal updates',
  'a member cannot approve a deal update'
);
select tests.login_as('ar_viewer');
select throws_ok(
  $$ select public.create_deal_update('a7000000-0000-0000-0000-0000000000d1',
       'Nope', 'Nope', '{"groups":[],"people":[]}'::jsonb) $$,
  '42501', null,
  'a read-only teammate cannot draft a deal update'
);
select tests.login_as('ar_owner');
select lives_ok(
  $$ select public.decide_deal_update(u.id, u.version, 'approved') from public.deal_update u
     where u.author_id = tests.get_uid('ar_member') $$,
  'a deal manager approves the member''s update'
);

select * from finish();
rollback;
