begin;
select no_plan();

-- Team "LRA Team" works deal d1 with lender rooms A, B and a closed room C.
-- The lender package holds two versions of cim.pdf, two of budget.pdf (the
-- newer removed), secret.pdf (hidden from room A only), removed.pdf and
-- removed.xlsx (both removed) and model.xlsx, plus a folder hidden from room A
-- with a subfolder, each holding a memo. Each room has a private folder with
-- one document. The diligence folder, outside the package, holds tax.pdf and
-- hidden.xlsx. lra_viewer is on the team without deals.work; lra_lender is a
-- member of room A; lra_foreign is on another team, which has its own ask.
select tests.create_user('lra_owner');
select tests.create_user('lra_member');
select tests.create_user('lra_viewer');
select tests.create_user('lra_lender');
select tests.create_user('lra_foreign');

select tests.login_as_service_role();
select public.create_team_account('LRA Team', tests.get_uid('lra_owner'), 'lra-team');
select public.create_team_account('LRA Foreign', tests.get_uid('lra_foreign'), 'lra-foreign');

select public.append_deal_event('1a000000-0000-0000-0000-0000000000d1', 'deal',
  '1a000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lra-team'), 'firm_id', tests.create_firm(tests.account_id('lra-team')),
    'owner_user_id', tests.get_uid('lra_owner'), 'description', 'Room AI deal'), null, 'service');

select public.append_deal_event('1a000000-0000-0000-0000-0000000000d2', 'deal',
  '1a000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lra-foreign'), 'firm_id', tests.create_firm(tests.account_id('lra-foreign')),
    'owner_user_id', tests.get_uid('lra_foreign'), 'description', 'Foreign room deal'), null, 'service');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('lra-team'), tests.get_uid('lra_member'), 'member'),
  (tests.account_id('lra-team'), tests.get_uid('lra_viewer'), 'viewer');

insert into public.dr_folder (id, account_id, deal_id, name)
values
  ('1a000000-0000-0000-0000-00000000f001', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Lender package'),
  ('1a000000-0000-0000-0000-00000000f00a', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Room A'),
  ('1a000000-0000-0000-0000-00000000f00b', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Room B'),
  ('1a000000-0000-0000-0000-00000000f0dd', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Diligence'),
  ('1a000000-0000-0000-0000-00000000f00c', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Room C'),
  ('1a000000-0000-0000-0000-00000000f0ff', tests.account_id('lra-foreign'), '1a000000-0000-0000-0000-0000000000d2', 'Foreign room');

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('1a000000-0000-0000-0000-00000000f0a1', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1',
  '1a000000-0000-0000-0000-00000000f001', 'Withheld from A');
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('1a000000-0000-0000-0000-00000000f0a2', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1',
  '1a000000-0000-0000-0000-00000000f0a1', 'Under withheld');

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version)
values
  ('1a000000-0000-0000-0000-00000000d001', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'cim.pdf', 'lra/cim-1.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d002', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'cim.pdf', 'lra/cim-2.pdf', 2),
  ('1a000000-0000-0000-0000-00000000d005', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'secret.pdf', 'lra/secret.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d00e', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'removed.pdf', 'lra/removed.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d0e2', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'removed.xlsx', 'lra/removed.xlsx', 1),
  ('1a000000-0000-0000-0000-00000000d006', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'model.xlsx', 'lra/model.xlsx', 1),
  ('1a000000-0000-0000-0000-00000000d00a', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f00a', 'room-a-notes.pdf', 'lra/room-a.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d00b', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f00b', 'room-b-notes.pdf', 'lra/room-b.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d0dd', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f0dd', 'tax.pdf', 'lra/tax.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d0d2', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f0dd', 'hidden.xlsx', 'lra/hidden.xlsx', 1),
  ('1a000000-0000-0000-0000-00000000d0b1', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'budget.pdf', 'lra/budget-1.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d0b2', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f001', 'budget.pdf', 'lra/budget-2.pdf', 2),
  ('1a000000-0000-0000-0000-00000000d0a1', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f0a1', 'withheld-memo.pdf', 'lra/withheld.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d0a2', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f0a2', 'withheld-sub-memo.pdf', 'lra/withheld-sub.pdf', 1),
  ('1a000000-0000-0000-0000-00000000d00c', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000f00c', 'room-c-notes.pdf', 'lra/room-c.pdf', 1);

insert into public.document_segment
  (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, sheet, cell_range, text, from_ocr, content_hash)
values
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d001', 1, 0, 'page', 1, 1, null, null,
    'EBITDA was 1.1 million in the first draft.', false, 'h1'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d002', 2, 0, 'page', 1, 1, null, null,
    'EBITDA was 1.3 million after addbacks.', false, 'h2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d002', 2, 1, 'page', 2, 2, null, null,
    'Customer concentration is low.', true, 'h2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d005', 1, 0, 'page', 1, 1, null, null,
    'Secret EBITDA bridge for room B only.', false, 'h5'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d00e', 1, 0, 'page', 1, 1, null, null,
    'Withdrawn EBITDA schedule.', false, 'he'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0e2', 1, 0, 'sheet_block', null, null, 'P&L', 'A1:B2',
    'Withdrawn EBITDA sheet', false, 'he2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d006', 1, 0, 'sheet_block', null, null, 'P&L', 'A1:C10',
    'EBITDA by year', false, 'h6'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d006', 1, 1, 'sheet_block', null, null, 'Debt', 'A1:B4',
    'Debt schedule', false, 'h6'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d00a', 1, 0, 'page', 1, 1, null, null,
    'Room A EBITDA notes.', false, 'ha'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d00b', 1, 0, 'page', 1, 1, null, null,
    'Room B EBITDA notes.', false, 'hb'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0dd', 1, 0, 'page', 1, 1, null, null,
    'Tax return EBITDA reconciliation.', false, 'hd'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0d2', 1, 0, 'sheet_block', null, null, 'P&L', 'A1:C10',
    'Hidden EBITDA sheet', false, 'hd2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0b1', 1, 0, 'page', 1, 1, null, null,
    'Budget plan, first cut.', false, 'hb1'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0b2', 2, 0, 'page', 1, 1, null, null,
    'Budget plan, withdrawn cut.', false, 'hb2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0a1', 1, 0, 'page', 1, 1, null, null,
    'Withheld memo.', false, 'hw1'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d0a2', 1, 0, 'page', 1, 1, null, null,
    'Withheld sub memo.', false, 'hw2'),
  (tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', '1a000000-0000-0000-0000-00000000d00c', 1, 0, 'page', 1, 1, null, null,
    'Room C notes.', false, 'hc');

insert into public.lender_package (deal_id, account_id, master_folder_id)
values ('1a000000-0000-0000-0000-0000000000d1', tests.account_id('lra-team'), '1a000000-0000-0000-0000-00000000f001');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Harbor Lending', '1a000000-0000-0000-0000-00000000f00a'),
  ('1a000000-0000-0000-0000-0000000000b0', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Meadow Credit', '1a000000-0000-0000-0000-00000000f00b'),
  ('1a000000-0000-0000-0000-0000000000f0', tests.account_id('lra-foreign'), '1a000000-0000-0000-0000-0000000000d2', 'Foreign Lending', '1a000000-0000-0000-0000-00000000f0ff');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id, closed_at)
values ('1a000000-0000-0000-0000-0000000000c0', tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1', 'Juniper Bank',
  '1a000000-0000-0000-0000-00000000f00c', now() - interval '1 day');

insert into public.lender_room_hidden (room_id, dr_document_id)
values ('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d005');
insert into public.lender_room_hidden (room_id, dr_folder_id)
values ('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000f0a1');

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('1a000000-0000-0000-0000-0000000000a0', tests.get_uid('lra_lender'), 'lra_lender@opendealbook.test', tests.get_uid('lra_owner'));

select public.append_deal_event('1a000000-0000-0000-0000-0000000000d1', 'dr_document',
  '1a000000-0000-0000-0000-00000000d00e', 'dr_document.removed', '{}'::jsonb, null, 'service');
select public.append_deal_event('1a000000-0000-0000-0000-0000000000d1', 'dr_document',
  '1a000000-0000-0000-0000-00000000d0e2', 'dr_document.removed', '{}'::jsonb, null, 'service');
select public.append_deal_event('1a000000-0000-0000-0000-0000000000d1', 'dr_document',
  '1a000000-0000-0000-0000-00000000d0b2', 'dr_document.removed', '{}'::jsonb, null, 'service');

-- ---- Room-scoped document reads ----
select tests.login_as('lra_member');

select results_eq(
  $$ select document_id, name, version, page_count, sheets
     from public.list_room_documents('1a000000-0000-0000-0000-0000000000a0') $$,
  $$ values
       ('1a000000-0000-0000-0000-00000000d0b1'::uuid, 'budget.pdf', 1, 1, null::text[]),
       ('1a000000-0000-0000-0000-00000000d002'::uuid, 'cim.pdf', 2, 2, null::text[]),
       ('1a000000-0000-0000-0000-00000000d006'::uuid, 'model.xlsx', 1, null::int, array['P&L', 'Debt']),
       ('1a000000-0000-0000-0000-00000000d00a'::uuid, 'room-a-notes.pdf', 1, 1, null::text[]) $$,
  'room A lists the latest version of each document it shows, never a hidden, removed, unshared or other room''s document'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'budget') $$,
  array['1a000000-0000-0000-0000-00000000d0b1']::uuid[],
  'when the newest version is removed, room search finds the version before it'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'budget', true) $$,
  array['1a000000-0000-0000-0000-00000000d0b1']::uuid[],
  'asking for earlier versions never brings back the removed newest version'
);

select is_empty(
  $$ select 1 from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'withheld', true) $$,
  'room A finds nothing in a folder hidden from it or in that folder''s subfolder'
);

select is_empty(
  $$ select 1 from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0a2', 1, 9) $$,
  'room A reads no page in a subfolder of a folder hidden from it'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000b0', 'withheld') order by 1 $$,
  array['1a000000-0000-0000-0000-00000000d0a1', '1a000000-0000-0000-0000-00000000d0a2']::uuid[],
  'room B finds the memos in the folder hidden from room A'
);

select results_eq(
  $$ select document_id from public.list_room_documents('1a000000-0000-0000-0000-0000000000c0') where name = 'room-c-notes.pdf' $$,
  array['1a000000-0000-0000-0000-00000000d00c']::uuid[],
  'the team still reads a closed room''s documents'
);

select results_eq(
  $$ select document_id from public.list_room_documents('1a000000-0000-0000-0000-0000000000b0') $$,
  array['1a000000-0000-0000-0000-00000000d0b1', '1a000000-0000-0000-0000-00000000d002', '1a000000-0000-0000-0000-00000000d006',
    '1a000000-0000-0000-0000-00000000d00b', '1a000000-0000-0000-0000-00000000d005',
    '1a000000-0000-0000-0000-00000000d0a1', '1a000000-0000-0000-0000-00000000d0a2']::uuid[],
  'a document hidden from room A still lists in room B'
);

select results_eq(
  $$ select * from public.list_room_documents('1a000000-0000-0000-0000-0000000000a0') where name = 'model.xlsx' $$,
  $$ select * from public.list_documents('1a000000-0000-0000-0000-0000000000d1') where name = 'model.xlsx' $$,
  'a room lists a document exactly as the deal lists it'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'EBITDA') order by 1 $$,
  array['1a000000-0000-0000-0000-00000000d002', '1a000000-0000-0000-0000-00000000d006', '1a000000-0000-0000-0000-00000000d00a']::uuid[],
  'room A search finds only the latest version of documents room A shows'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'EBITDA', true) order by 1 $$,
  array['1a000000-0000-0000-0000-00000000d001', '1a000000-0000-0000-0000-00000000d002',
    '1a000000-0000-0000-0000-00000000d006', '1a000000-0000-0000-0000-00000000d00a']::uuid[],
  'asking for earlier versions adds them, and still nothing hidden, removed or unshared'
);

select results_eq(
  $$ select count(*)::int from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'EBITDA', true, 2) $$,
  array[2],
  'room search returns at most the requested number of matches'
);

select results_eq(
  $$ select * from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'concentration') $$,
  $$ select * from public.search_document_segments('1a000000-0000-0000-0000-0000000000d1', 'concentration') $$,
  'a room search match is exactly the deal search match'
);

select results_eq(
  $$ select dr_document_id from public.search_room_segments('1a000000-0000-0000-0000-0000000000b0', 'secret') $$,
  array['1a000000-0000-0000-0000-00000000d005']::uuid[],
  'room B finds the document hidden from room A'
);

select results_eq(
  $$ select * from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d002', 1, 2) $$,
  $$ select * from public.read_document_pages('1a000000-0000-0000-0000-00000000d002', 1, 2) $$,
  'a room reads the pages of a document it shows exactly as the deal reads them'
);

select is_empty(
  $$ select 1 from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d005', 1, 9) $$,
  'room A reads no page of a document hidden from it'
);

select is_empty(
  $$ select 1 from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0dd', 1, 9) $$,
  'room A reads no page of a document outside the lender package'
);

select is_empty(
  $$ select 1 from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d00b', 1, 9) $$,
  'room A reads no page of room B''s private document'
);

select is_empty(
  $$ select 1 from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d00e', 1, 9) $$,
  'a room reads no page of a removed document'
);

select results_eq(
  $$ select * from public.list_room_sheets('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d006') $$,
  $$ select * from public.list_sheets('1a000000-0000-0000-0000-00000000d006') $$,
  'a room lists the sheets of a workbook it shows exactly as the deal lists them'
);

select is_empty(
  $$ select 1 from public.list_room_sheets('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0d2') $$,
  'a room lists no sheets of a workbook it does not show'
);

select is_empty(
  $$ select 1 from public.list_room_sheets('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0e2') $$,
  'a room lists no sheets of a removed workbook'
);

select results_eq(
  $$ select * from public.read_room_sheet_range('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d006', 'P&L', 'A1:B2') $$,
  $$ select * from public.read_sheet_range('1a000000-0000-0000-0000-00000000d006', 'P&L', 'A1:B2') $$,
  'a room reads a sheet range of a workbook it shows exactly as the deal reads it'
);

select is_empty(
  $$ select 1 from public.read_room_sheet_range('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0d2', 'P&L', 'A1:C10') $$,
  'a room reads no range of a workbook it does not show'
);

select is_empty(
  $$ select 1 from public.read_room_sheet_range('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d0e2', 'P&L', 'A1:B2') $$,
  'a room reads no range of a removed workbook'
);

reset role;

create or replace function pg_temp.room_reads_for(who text)
  returns int
  language plpgsql as $$
declare
  n int;
begin
  perform tests.login_as(who);
  select
    (select count(*) from public.list_room_documents('1a000000-0000-0000-0000-0000000000a0'))
    + (select count(*) from public.search_room_segments('1a000000-0000-0000-0000-0000000000a0', 'EBITDA', true))
    + (select count(*) from public.read_room_document_pages('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d002', 1, 9))
    + (select count(*) from public.list_room_sheets('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d006'))
    + (select count(*) from public.read_room_sheet_range('1a000000-0000-0000-0000-0000000000a0', '1a000000-0000-0000-0000-00000000d006', 'P&L', 'A1:C10'))
  into n;
  reset role;
  return n;
end;
$$;

select is(pg_temp.room_reads_for('lra_viewer'), 0, 'a teammate without deals.work gets nothing from the room reads');
select is(pg_temp.room_reads_for('lra_lender'), 0, 'a lender in the room gets nothing from the room reads');
select is(pg_temp.room_reads_for('lra_foreign'), 0, 'another team gets nothing from the room reads');
select is(pg_temp.room_reads_for('lra_owner'), 13, 'the deal owner gets the room reads');

select function_privs_are(
  'public', 'list_room_documents', array['uuid'], 'anon', array[]::text[],
  'a signed-out visitor cannot call the room reads'
);

select function_privs_are(
  'public', 'list_room_documents', array['uuid'], 'service_role', array[]::text[],
  'the server, which has no user to check, cannot call the room reads'
);

-- ---- Drafts of a reply to a lender ask ----
reset role;

insert into public.lender_ask (id, room_id, account_id, kind, title, body)
values ('1a000000-0000-0000-0000-0000000000c1', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'),
  'ask', 'EBITDA bridge?', 'Please walk us through the addbacks.');
insert into public.lender_ask (id, room_id, account_id, kind, title, return_route)
values ('1a000000-0000-0000-0000-0000000000c2', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'),
  'form', 'Sign the credit form', 'upload');
insert into public.lender_ask (id, room_id, account_id, kind, title)
values ('1a000000-0000-0000-0000-0000000000cf', '1a000000-0000-0000-0000-0000000000f0', tests.account_id('lra-foreign'), 'ask', 'Foreign ask?');
insert into public.lender_ask (id, room_id, account_id, kind, title)
values
  ('1a000000-0000-0000-0000-0000000000c3', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'), 'ask', 'Debt schedule?'),
  ('1a000000-0000-0000-0000-0000000000c4', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'), 'ask', 'Customer list?'),
  ('1a000000-0000-0000-0000-0000000000c5', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'), 'ask', 'Capex plan?'),
  ('1a000000-0000-0000-0000-0000000000c6', '1a000000-0000-0000-0000-0000000000a0', tests.account_id('lra-team'), 'ask', 'Working capital?');

select tests.login_as('lra_owner');

select lives_ok(
  $$ insert into public.lender_ask_ai_draft (id, ask_id)
     values ('1a000000-0000-0000-0000-0000000000e1', '1a000000-0000-0000-0000-0000000000c1') $$,
  'someone who can reply in the room starts a draft for an ask'
);

select results_eq(
  $$ select room_id, account_id, deal_id, requested_by, status::text, body, citations, suggested_document_ids, credits_used, steps, finished_at
     from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('1a000000-0000-0000-0000-0000000000a0'::uuid, tests.account_id('lra-team'), '1a000000-0000-0000-0000-0000000000d1'::uuid,
       tests.get_uid('lra_owner'), 'running', null::text, '[]'::jsonb, '{}'::uuid[], 0::numeric, '[]'::jsonb, null::timestamptz) $$,
  'a new draft takes its room, team and deal from the ask, and is the requester''s, running and empty'
);

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c2') $$,
  '23514', null,
  'a form ask gets no draft'
);

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id, room_id)
     values ('1a000000-0000-0000-0000-0000000000c1', '1a000000-0000-0000-0000-0000000000b0') $$,
  '42501', null,
  'a draft cannot name its own room'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set status = 'ready', body = 'Forged', finished_at = now()
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '42501', null,
  'the requester''s own client cannot finish a draft'
);

select tests.login_as('lra_member');

select results_eq(
  $$ select id from public.lender_ask_ai_draft $$,
  array['1a000000-0000-0000-0000-0000000000e1']::uuid[],
  'a teammate who can reply reads the team''s drafts'
);

select lives_ok(
  $$ insert into public.lender_ask_ai_draft (id, ask_id)
     values ('1a000000-0000-0000-0000-0000000000e2', '1a000000-0000-0000-0000-0000000000c1') $$,
  'an ask can have several drafts'
);

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  '23505', null,
  'a person runs one draft at a time for an ask'
);

select tests.login_as('lra_viewer');

select is_empty($$ select 1 from public.lender_ask_ai_draft $$, 'a teammate without deals.work reads no draft');
select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  '42501', null,
  'a teammate without deals.work cannot start a draft'
);

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c2') $$,
  '42501', null,
  'a teammate without deals.work is refused before anything is said about the ask'
);

select tests.login_as('lra_lender');

select is_empty($$ select 1 from public.lender_ask_ai_draft $$, 'a lender in the room never reads a draft');
select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  '42501', null,
  'a lender cannot start a draft'
);

select tests.login_as('lra_owner');

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000cf') $$,
  '42501', 'only someone who can reply in the room drafts for its asks',
  'another team''s ask is refused'
);

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000ff') $$,
  '42501', 'only someone who can reply in the room drafts for its asks',
  'an ask that does not exist is refused the same way'
);

select tests.login_as('lra_foreign');

select is_empty($$ select 1 from public.lender_ask_ai_draft $$, 'another team reads no draft');
select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  '42501', null,
  'another team cannot start a draft'
);

select tests.login_as_service_role();

select throws_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  '42501', null,
  'the server does not start drafts'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set ask_id = '1a000000-0000-0000-0000-0000000000c3'
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '42501', null,
  'the server writes only a draft''s result'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set citations = '{"page": 1}'
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '23514', null,
  'a draft''s citations are a list'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set status = 'ready', body = 'No end time'
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '23514', null,
  'a finished draft records when it finished'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set status = 'failed', finished_at = now()
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '23514', null,
  'a failed draft says why it failed'
);

select throws_ok(
  $$ update public.lender_ask_ai_draft set status = 'ready', body = 'Done', failure_reason = 'too_long', finished_at = now()
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  '23514', null,
  'only a failed draft has a failure reason'
);

select lives_ok(
  $$ update public.lender_ask_ai_draft set status = 'failed', failure_reason = 'too_long', finished_at = now()
     where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  'the server fails a draft with its reason'
);

select results_eq(
  $$ select status::text, failure_reason::text from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('failed', 'too_long') $$,
  'a failed draft keeps its reason'
);

update public.lender_ask_ai_draft
set status = 'ready', failure_reason = null, body = 'The addbacks are owner salary and rent.', model = 'claude-test', credits_used = 2.5,
  citations = '[{"document_id": "1a000000-0000-0000-0000-00000000d002", "page": 1}]',
  suggested_document_ids = array['1a000000-0000-0000-0000-00000000d002']::uuid[],
  steps = '[{"tool": "search_documents"}]', finished_at = now()
where id = '1a000000-0000-0000-0000-0000000000e1';

select tests.login_as('lra_owner');

select results_eq(
  $$ select status::text, body, model, credits_used, suggested_document_ids, finished_at is not null
     from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('ready', 'The addbacks are owner salary and rent.', 'claude-test', 2.5::numeric,
       array['1a000000-0000-0000-0000-00000000d002']::uuid[], true) $$,
  'the server finishes a draft with its body, model, credits and suggested files'
);

-- A draft still running 10 minutes on belongs to a crashed request and fails
-- when its requester starts another.
select tests.login_as('lra_member');

insert into public.lender_ask_ai_draft (id, ask_id)
values
  ('1a000000-0000-0000-0000-0000000000e3', '1a000000-0000-0000-0000-0000000000c3'),
  ('1a000000-0000-0000-0000-0000000000e7', '1a000000-0000-0000-0000-0000000000c6');

reset role;

update public.lender_ask_ai_draft set created_at = now() - interval '2 minutes'
where id = '1a000000-0000-0000-0000-0000000000e3';
update public.lender_ask_ai_draft set created_at = now() - interval '11 minutes'
where id in ('1a000000-0000-0000-0000-0000000000e2', '1a000000-0000-0000-0000-0000000000e7');

select tests.login_as('lra_owner');

select lives_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  'another person starts a draft while a teammate''s draft is stale'
);

select results_eq(
  $$ select status::text from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e2' $$,
  array['running'],
  'another person''s draft does not sweep a teammate''s stale draft'
);

select tests.login_as('lra_member');

select lives_ok(
  $$ insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c1') $$,
  'the requester starts another draft'
);

select results_eq(
  $$ select id, status::text, failure_reason::text, finished_at is not null from public.lender_ask_ai_draft
     where id in ('1a000000-0000-0000-0000-0000000000e2', '1a000000-0000-0000-0000-0000000000e3', '1a000000-0000-0000-0000-0000000000e7') order by id $$,
  $$ values ('1a000000-0000-0000-0000-0000000000e2'::uuid, 'failed', 'interrupted', true),
            ('1a000000-0000-0000-0000-0000000000e3'::uuid, 'running', null, false),
            ('1a000000-0000-0000-0000-0000000000e7'::uuid, 'running', null, false) $$,
  'starting a draft fails the requester''s drafts on that ask that ran over 10 minutes, and no others'
);

-- A draft whose requester was deleted fails once stale, when anyone starts a
-- draft for the same ask.
select tests.login_as('lra_member');

insert into public.lender_ask_ai_draft (id, ask_id)
values ('1a000000-0000-0000-0000-0000000000e5', '1a000000-0000-0000-0000-0000000000c5');

reset role;

update public.lender_ask_ai_draft set requested_by = null, created_at = now() - interval '11 minutes'
where id = '1a000000-0000-0000-0000-0000000000e5';

select tests.login_as('lra_owner');

insert into public.lender_ask_ai_draft (ask_id) values ('1a000000-0000-0000-0000-0000000000c5');

select results_eq(
  $$ select status::text, failure_reason::text, finished_at is not null from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e5' $$,
  $$ values ('failed', 'interrupted', true) $$,
  'a stale draft with no requester left fails when a teammate starts a draft for the same ask'
);

reset role;

create temporary table started (id uuid) on commit drop;
grant select, insert on started to authenticated;

select tests.login_as('lra_member');

insert into started select public.start_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000c4');

select results_eq(
  $$ select d.ask_id, d.requested_by, d.status::text
     from started
     join public.lender_ask_ai_draft d on d.id = started.id $$,
  $$ values ('1a000000-0000-0000-0000-0000000000c4'::uuid, tests.get_uid('lra_member'), 'running') $$,
  'starting a draft by its ask returns the new running draft'
);

select tests.login_as('lra_viewer');

select throws_ok(
  $$ select public.start_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000c1') $$,
  '42501', null,
  'a teammate without deals.work cannot start a draft by its ask'
);

select function_privs_are(
  'public', 'start_lender_ask_ai_draft', array['uuid'], 'service_role', array[]::text[],
  'the server cannot start a draft, which would have no requester'
);

-- A ready draft is marked used or discarded by anyone who can reply.
select tests.login_as('lra_viewer');

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e1', 'used') $$,
  '42501', null,
  'a teammate without deals.work cannot mark a draft'
);

select tests.login_as('lra_lender');

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e1', 'used') $$,
  '42501', null,
  'a lender cannot mark a draft'
);

select tests.login_as('lra_member');

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e3', 'used') $$,
  '23514', null,
  'a running draft cannot be marked used'
);

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e2', 'discarded') $$,
  '23514', null,
  'a failed draft cannot be marked discarded'
);

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e1', 'failed') $$,
  '23514', null,
  'a ready draft is not marked failed by a person'
);

select lives_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e1', 'used') $$,
  'a teammate who can reply marks a ready draft used'
);

select results_eq(
  $$ select status::text, finished_at is not null from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('used', true) $$,
  'the draft is used'
);

select throws_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e1', 'discarded') $$,
  '23514', null,
  'a used draft cannot be discarded'
);

select tests.login_as_service_role();

update public.lender_ask_ai_draft set status = 'ready', body = 'Debt is a term loan.', finished_at = now()
where id = '1a000000-0000-0000-0000-0000000000e3';

select tests.login_as('lra_owner');

select lives_ok(
  $$ select public.mark_lender_ask_ai_draft('1a000000-0000-0000-0000-0000000000e3', 'discarded') $$,
  'a teammate who can reply discards a ready draft'
);

select results_eq(
  $$ select status::text from public.lender_ask_ai_draft where id = '1a000000-0000-0000-0000-0000000000e3' $$,
  array['discarded'],
  'the draft is discarded'
);

-- AI calls meter against the draft that made them.
select tests.login_as_service_role();

select public.reserve_ai_call(tests.account_id('lra-team'), 'claude-room-draft', 0,
  p_deal_id => '1a000000-0000-0000-0000-0000000000d1',
  p_created_by => tests.get_uid('lra_owner'),
  p_lender_ask_ai_draft_id => '1a000000-0000-0000-0000-0000000000e1');

reset role;

select results_eq(
  $$ select created_by, question_id, lender_ask_ai_draft_id, seller_answer_check_id from public.ai_call_log where model = 'claude-room-draft' $$,
  $$ values (tests.get_uid('lra_owner'), null::uuid, '1a000000-0000-0000-0000-0000000000e1'::uuid, null::uuid) $$,
  'reserving an AI call records the draft it was made for'
);

select tests.login_as_service_role();

select throws_ok(
  $$ select public.reserve_ai_call(tests.account_id('lra-team'), 'claude-room-draft', 0,
       p_question_id => gen_random_uuid(),
       p_lender_ask_ai_draft_id => '1a000000-0000-0000-0000-0000000000e1') $$,
  '23514', null,
  'an AI call meters against one subject at most'
);

reset role;

delete from public.lender_ask where id = '1a000000-0000-0000-0000-0000000000c1';

select is_empty(
  $$ select 1 from public.lender_ask_ai_draft where ask_id = '1a000000-0000-0000-0000-0000000000c1' $$,
  'deleting an ask deletes its drafts'
);

select results_eq(
  $$ select lender_ask_ai_draft_id from public.ai_call_log where model = 'claude-room-draft' $$,
  array[null::uuid],
  'deleting a draft keeps its AI calls in the log'
);

select * from finish();
rollback;
