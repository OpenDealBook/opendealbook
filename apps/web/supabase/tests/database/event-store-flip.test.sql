-- The Wave 2 flip: the deal event log is the sole write path. Direct DML on the
-- evented projection tables is refused for authenticated and service_role, while
-- append_deal_event (security definer) still writes them; due_offset_days now
-- projects; and audit_event is retired.

begin;
select no_plan();

select tests.create_user('fl_owner');
select tests.login_as_service_role();
select public.create_team_account('Flip Acct', tests.get_uid('fl_owner'), 'fl-acct');

select tests.login_as('fl_owner');

-- ---- append still writes projections after the DML revoke ----
select public.append_deal_event('f1000000-0000-0000-0000-000000000001', 'deal',
  'f1000000-0000-0000-0000-000000000001', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('fl-acct'), 'description', 'Flip deal'));
select is(
  (select description from public.deal where id = 'f1000000-0000-0000-0000-000000000001'),
  'Flip deal',
  'append_deal_event still writes the deal projection after the DML revoke');

-- ---- due_offset_days projects (a field the audit_event catalogue missed) ----
select public.append_deal_event('f1000000-0000-0000-0000-000000000001', 'checklist_item',
  'f1c00000-0000-0000-0000-0000000000c1', 'checklist_item.added',
  jsonb_build_object('title', 'Tax returns', 'due_offset_days', 30));
select is(
  (select due_offset_days from public.checklist_item where id = 'f1c00000-0000-0000-0000-0000000000c1'),
  30,
  'checklist_item.added projects due_offset_days');

-- ---- direct DML on every evented projection table is refused ----
-- authenticated (the account owner: reads, but no write grant)
select throws_ok($$ insert into public.deal (account_id, description) values (tests.account_id('fl-acct'), 'x') $$, '42501', null, 'authenticated cannot insert deal');
select throws_ok($$ update public.deal set description = 'y' where id = 'f1000000-0000-0000-0000-000000000001' $$, '42501', null, 'authenticated cannot update deal');
select throws_ok($$ delete from public.deal where id = 'f1000000-0000-0000-0000-000000000001' $$, '42501', null, 'authenticated cannot delete deal');

select throws_ok($$ insert into public.checklist_item (account_id, deal_id, title) values (tests.account_id('fl-acct'), 'f1000000-0000-0000-0000-000000000001', 'x') $$, '42501', null, 'authenticated cannot insert checklist_item');
select throws_ok($$ update public.checklist_item set title = 'y' where id = 'f1c00000-0000-0000-0000-0000000000c1' $$, '42501', null, 'authenticated cannot update checklist_item');
select throws_ok($$ delete from public.checklist_item where id = 'f1c00000-0000-0000-0000-0000000000c1' $$, '42501', null, 'authenticated cannot delete checklist_item');

select throws_ok($$ insert into public.approval (deal_id, subject) values ('f1000000-0000-0000-0000-000000000001', 'stage_move') $$, '42501', null, 'authenticated cannot insert approval');
select throws_ok($$ update public.approval set decision = 'approved' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update approval');
select throws_ok($$ delete from public.approval where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete approval');

select throws_ok($$ insert into public.deal_participant (deal_id, user_id, party) values ('f1000000-0000-0000-0000-000000000001', tests.get_uid('fl_owner'), 'buyer') $$, '42501', null, 'authenticated cannot insert deal_participant');
select throws_ok($$ update public.deal_participant set role = 'x' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update deal_participant');
select throws_ok($$ delete from public.deal_participant where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete deal_participant');

select throws_ok($$ insert into public.dr_document (account_id, deal_id, folder_id, name, storage_path) values (tests.account_id('fl-acct'), 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ff', 'x', 'p') $$, '42501', null, 'authenticated cannot insert dr_document');
select throws_ok($$ update public.dr_document set name = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update dr_document');
select throws_ok($$ delete from public.dr_document where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete dr_document');

select throws_ok($$ insert into public.meeting (deal_id, account_id, type) values ('f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'weekly') $$, '42501', null, 'authenticated cannot insert meeting');
select throws_ok($$ update public.meeting set notes = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update meeting');
select throws_ok($$ delete from public.meeting where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete meeting');

select throws_ok($$ insert into public.meeting_action_item (meeting_id, deal_id, account_id, description) values ('00000000-0000-0000-0000-0000000000ff', 'f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'x') $$, '42501', null, 'authenticated cannot insert meeting_action_item');
select throws_ok($$ update public.meeting_action_item set description = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update meeting_action_item');
select throws_ok($$ delete from public.meeting_action_item where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete meeting_action_item');

select throws_ok($$ insert into public.contract (deal_id, account_id, type) values ('f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'loi') $$, '42501', null, 'authenticated cannot insert contract');
select throws_ok($$ update public.contract set status = 'signed' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot update contract');
select throws_ok($$ delete from public.contract where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'authenticated cannot delete contract');

-- service_role loses direct DML too, so workers also go through the log
select tests.login_as_service_role();

select throws_ok($$ insert into public.deal (account_id, description) values (tests.account_id('fl-acct'), 'x') $$, '42501', null, 'service_role cannot insert deal');
select throws_ok($$ update public.deal set description = 'y' where id = 'f1000000-0000-0000-0000-000000000001' $$, '42501', null, 'service_role cannot update deal');
select throws_ok($$ delete from public.deal where id = 'f1000000-0000-0000-0000-000000000001' $$, '42501', null, 'service_role cannot delete deal');

select throws_ok($$ insert into public.checklist_item (account_id, deal_id, title) values (tests.account_id('fl-acct'), 'f1000000-0000-0000-0000-000000000001', 'x') $$, '42501', null, 'service_role cannot insert checklist_item');
select throws_ok($$ update public.checklist_item set title = 'y' where id = 'f1c00000-0000-0000-0000-0000000000c1' $$, '42501', null, 'service_role cannot update checklist_item');
select throws_ok($$ delete from public.checklist_item where id = 'f1c00000-0000-0000-0000-0000000000c1' $$, '42501', null, 'service_role cannot delete checklist_item');

select throws_ok($$ insert into public.approval (deal_id, subject) values ('f1000000-0000-0000-0000-000000000001', 'stage_move') $$, '42501', null, 'service_role cannot insert approval');
select throws_ok($$ update public.approval set decision = 'approved' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update approval');
select throws_ok($$ delete from public.approval where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete approval');

select throws_ok($$ insert into public.deal_participant (deal_id, user_id, party) values ('f1000000-0000-0000-0000-000000000001', tests.get_uid('fl_owner'), 'buyer') $$, '42501', null, 'service_role cannot insert deal_participant');
select throws_ok($$ update public.deal_participant set role = 'x' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update deal_participant');
select throws_ok($$ delete from public.deal_participant where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete deal_participant');

select throws_ok($$ insert into public.dr_document (account_id, deal_id, folder_id, name, storage_path) values (tests.account_id('fl-acct'), 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ff', 'x', 'p') $$, '42501', null, 'service_role cannot insert dr_document');
select throws_ok($$ update public.dr_document set name = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update dr_document');
select throws_ok($$ delete from public.dr_document where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete dr_document');

select throws_ok($$ insert into public.meeting (deal_id, account_id, type) values ('f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'weekly') $$, '42501', null, 'service_role cannot insert meeting');
select throws_ok($$ update public.meeting set notes = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update meeting');
select throws_ok($$ delete from public.meeting where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete meeting');

select throws_ok($$ insert into public.meeting_action_item (meeting_id, deal_id, account_id, description) values ('00000000-0000-0000-0000-0000000000ff', 'f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'x') $$, '42501', null, 'service_role cannot insert meeting_action_item');
select throws_ok($$ update public.meeting_action_item set description = 'y' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update meeting_action_item');
select throws_ok($$ delete from public.meeting_action_item where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete meeting_action_item');

select throws_ok($$ insert into public.contract (deal_id, account_id, type) values ('f1000000-0000-0000-0000-000000000001', tests.account_id('fl-acct'), 'loi') $$, '42501', null, 'service_role cannot insert contract');
select throws_ok($$ update public.contract set status = 'signed' where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot update contract');
select throws_ok($$ delete from public.contract where id = '00000000-0000-0000-0000-0000000000ff' $$, '42501', null, 'service_role cannot delete contract');

-- ---- audit_event is retired; the event log carries its semantics ----
select hasnt_table('public', 'audit_event', 'the audit_event table no longer exists');

select * from finish();
rollback;
