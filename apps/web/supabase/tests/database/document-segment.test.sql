begin;
select no_plan();

-- Deal d1 on account A. The lender package folder, shown to an open lender
-- room, holds two versions of cim.pdf and a removed document. The diligence
-- folder, hidden from the room, holds a tax return, a long report and a
-- workbook.
select tests.create_user('dsg_owner');
select tests.create_user('dsg_foreign');
select tests.create_user('dsg_lender');

select tests.login_as_service_role();
select public.create_team_account('DSG Acct', tests.get_uid('dsg_owner'), 'dsg-acct');
select public.create_team_account('DSG Foreign', tests.get_uid('dsg_foreign'), 'dsg-foreign');

select public.append_deal_event('d5a00000-0000-0000-0000-0000000000d1', 'deal',
  'd5a00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dsg-acct'), 'firm_id', tests.create_firm(tests.account_id('dsg-acct')),
    'owner_user_id', tests.get_uid('dsg_owner'), 'description', 'Segment deal'), null, 'service');

select public.append_deal_event('d5a00000-0000-0000-0000-0000000000d2', 'deal',
  'd5a00000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dsg-foreign'), 'firm_id', tests.create_firm(tests.account_id('dsg-foreign')),
    'owner_user_id', tests.get_uid('dsg_foreign'), 'description', 'Foreign deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, name)
values
  ('d5a00000-0000-0000-0000-00000000f001', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'Lender package'),
  ('d5a00000-0000-0000-0000-00000000f00a', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'Room A'),
  ('d5a00000-0000-0000-0000-00000000f0ff', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'Diligence'),
  ('d5a00000-0000-0000-0000-00000000f0cc', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'Seller''s counsel');

insert into public.seller_counsel_folder (deal_id, account_id, folder_id)
values ('d5a00000-0000-0000-0000-0000000000d1', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-00000000f0cc');

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version)
values
  ('d5a00000-0000-0000-0000-00000000d001', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f001', 'cim.pdf', 'deal/x/cim-1.pdf', 1),
  ('d5a00000-0000-0000-0000-00000000d002', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f001', 'cim.pdf', 'deal/x/cim-2.pdf', 2),
  ('d5a00000-0000-0000-0000-00000000d00e', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f001', 'removed.pdf', 'deal/x/removed.pdf', 1),
  ('d5a00000-0000-0000-0000-00000000d0ff', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f0ff', 'tax-return.pdf', 'deal/x/tax-return.pdf', 1),
  ('d5a00000-0000-0000-0000-00000000d004', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f0ff', 'report.pdf', 'deal/x/report.pdf', 1),
  ('d5a00000-0000-0000-0000-00000000d005', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f0ff', 'model.xlsx', 'deal/x/model.xlsx', 1),
  ('d5a00000-0000-0000-0000-00000000d0cc', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000f0cc', 'counsel-memo.pdf', 'deal/x/counsel-memo.pdf', 1);

insert into public.document_segment
  (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, sheet, cell_range, text, from_ocr, content_hash)
values
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d001', 1, 0, 'page', 1, 1, null, null,
    'Revenue was 1.2 million with an EBITDA addback for owner salary.', false, 'h1'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d002', 2, 0, 'page', 1, 1, null, null,
    'Revenue was 1.4 million with an EBITDA addback for owner salary and rent.', false, 'h2'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d002', 2, 1, 'page', 2, 2, null, null,
    'Customer list, see Schedule 4.13.', false, 'h2'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d00e', 1, 0, 'page', 1, 1, null, null,
    'Withdrawn EBITDA bridge.', false, 'h3'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d0ff', 1, 0, 'page', 1, 1, null, null,
    'EBITDA, adjusted EBITDA and EBITDA margin per Schedule 4.12.', true, 'h4'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d004', 1, 0, 'page', 1, 1, null, null,
    repeat('a ', 10000), false, 'h5'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d004', 1, 1, 'page', 2, 2, null, null,
    repeat('b ', 10000), false, 'h5'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d004', 1, 2, 'page', 3, 3, null, null,
    repeat('c ', 10000), false, 'h5'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d005', 1, 0, 'sheet_block', null, null, 'P&L', 'A1:F40',
    'P&L rows 1 to 40', false, 'h6'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d005', 1, 1, 'sheet_block', null, null, 'P&L', 'A41:F80',
    'P&L rows 41 to 80', false, 'h6'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d005', 1, 2, 'sheet_block', null, null, 'P&L', 'AA1:AB40',
    'P&L far columns', false, 'h6'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d005', 1, 3, 'sheet_block', null, null, 'Balance sheet', 'A1:F40',
    'Balance sheet rows 1 to 40', false, 'h6'),
  (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d0cc', 1, 0, 'page', 1, 1, null, null,
    'Seller counsel memo on indemnity strategy.', false, 'h7');

insert into public.lender_package (deal_id, account_id, master_folder_id)
values ('d5a00000-0000-0000-0000-0000000000d1', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-00000000f001');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('d5a00000-0000-0000-0000-0000000000a0', tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'Lender A', 'd5a00000-0000-0000-0000-00000000f00a');

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('d5a00000-0000-0000-0000-0000000000a0', tests.get_uid('dsg_lender'), 'dsg_lender@opendealbook.test', tests.get_uid('dsg_owner'));

select public.append_deal_event('d5a00000-0000-0000-0000-0000000000d1', 'dr_document',
  'd5a00000-0000-0000-0000-00000000d00e', 'dr_document.removed', '{}'::jsonb, null, 'service');

select throws_ok(
  $$ insert into public.document_segment
       (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
     values (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d005', 1, 9,
       'sheet_block', 1, 1, 'no range', false, 'h6') $$,
  '23514', null,
  'a sheet block is addressed by sheet and cell range, not pages'
);

select throws_ok(
  $$ insert into public.document_segment
       (account_id, deal_id, dr_document_id, document_version, segment_index, kind, text, from_ocr, content_hash)
     values (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d004', 1, 9,
       'page', 'no page', false, 'h5') $$,
  '23514', null,
  'a page segment is addressed by its pages'
);

select lives_ok(
  $$ insert into public.document_segment
       (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
     values (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-0000000000ff', 1, 0,
       'page', 1, 1, 'orphan', false, 'h9') $$,
  'a segment may name a document id with no dr_document row, so replay keeps it'
);

select throws_ok(
  $$ insert into public.document_segment
       (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
     values (tests.account_id('dsg-foreign'), 'd5a00000-0000-0000-0000-0000000000d2', 'd5a00000-0000-0000-0000-00000000d0ff', 1, 9,
       'page', 1, 1, 'stolen', false, 'h4') $$,
  '42501', null,
  'a segment cannot belong to one team and cite another team''s document'
);

-- Access.
select tests.login_as('dsg_owner');
select results_eq(
  $$ select distinct dr_document_id from public.document_segment order by 1 $$,
  array[
    'd5a00000-0000-0000-0000-00000000d001',
    'd5a00000-0000-0000-0000-00000000d002',
    'd5a00000-0000-0000-0000-00000000d004',
    'd5a00000-0000-0000-0000-00000000d005',
    'd5a00000-0000-0000-0000-00000000d0ff'
  ]::uuid[],
  'the team reads segments of every live document and none of a removed or missing one'
);

select is_empty(
  $$ select 1 from public.document_segment where dr_document_id = 'd5a00000-0000-0000-0000-00000000d0cc' $$,
  'the buyer team reads no segments of a document in the Seller''s counsel folder'
);

select throws_ok(
  $$ insert into public.document_segment
       (account_id, deal_id, dr_document_id, document_version, segment_index, kind, page_from, page_to, text, from_ocr, content_hash)
     values (tests.account_id('dsg-acct'), 'd5a00000-0000-0000-0000-0000000000d1', 'd5a00000-0000-0000-0000-00000000d004', 1, 9,
       'page', 9, 9, 'forged', false, 'h5') $$,
  '42501', null,
  'a signed-in user cannot insert a segment'
);

select throws_ok(
  $$ update public.document_segment set text = 'forged' where dr_document_id = 'd5a00000-0000-0000-0000-00000000d001' $$,
  '42501', null,
  'a signed-in user cannot update a segment'
);

select throws_ok(
  $$ delete from public.document_segment where dr_document_id = 'd5a00000-0000-0000-0000-00000000d001' $$,
  '42501', null,
  'a signed-in user cannot delete a segment'
);

select tests.login_as('dsg_lender');
select results_eq(
  $$ select distinct dr_document_id from public.document_segment order by 1 $$,
  array['d5a00000-0000-0000-0000-00000000d001', 'd5a00000-0000-0000-0000-00000000d002']::uuid[],
  'a lender reads segments of exactly the documents their open room shows'
);

select results_eq(
  $$ select dr_document_id from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'EBITDA') $$,
  array['d5a00000-0000-0000-0000-00000000d002']::uuid[],
  'a lender search finds only the latest version of documents the room shows'
);

select is_empty(
  $$ select 1 from public.read_document_pages('d5a00000-0000-0000-0000-00000000d0ff', 1, 1) $$,
  'a lender reads no pages of a document the room hides'
);

select results_eq(
  $$ select document_id from public.list_documents('d5a00000-0000-0000-0000-0000000000d1') $$,
  array['d5a00000-0000-0000-0000-00000000d002']::uuid[],
  'a lender lists only the latest version of documents the room shows'
);

select is_empty(
  $$ select 1 from public.list_sheets('d5a00000-0000-0000-0000-00000000d005') $$,
  'a lender lists no sheets of a workbook the room hides'
);

select tests.login_as('dsg_foreign');
select is_empty(
  $$ select 1 from public.document_segment $$,
  'another team reads no segments'
);

select is_empty(
  $$ select 1 from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'EBITDA') $$,
  'another team finds nothing in the deal'
);

select is_empty(
  $$ select 1 from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80') $$,
  'another team reads no sheet ranges'
);

select is_empty(
  $$ select 1 from public.list_documents('d5a00000-0000-0000-0000-0000000000d1') $$,
  'another team lists no documents'
);

select is_empty(
  $$ select 1 from public.list_sheets('d5a00000-0000-0000-0000-00000000d005') $$,
  'another team lists no sheets'
);

-- Search.
select tests.login_as('dsg_owner');
select results_eq(
  $$ select dr_document_id, document_name, document_version, page_from, page_to
     from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'addback') $$,
  $$ values ('d5a00000-0000-0000-0000-00000000d002'::uuid, 'cim.pdf', 2, 1, 1) $$,
  'search finds the latest version of a file by default'
);

select results_eq(
  $$ select document_version from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'addback', true) order by 1 $$,
  array[1, 2],
  'search finds earlier versions when asked'
);

select is_empty(
  $$ select 1 from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'withdrawn') $$,
  'search finds nothing in a removed document'
);

select results_eq(
  $$ select dr_document_id from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'Schedule 4.12') $$,
  array['d5a00000-0000-0000-0000-00000000d0ff']::uuid[],
  'search matches an exact schedule number and not a neighbouring one'
);

select results_eq(
  $$ select from_ocr from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'Schedule 4.12') $$,
  array[true],
  'a search hit in OCR text says it came from OCR'
);

select results_eq(
  $$ select from_ocr from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'addback') $$,
  array[false],
  'a search hit in extracted text says it did not come from OCR'
);

select results_eq(
  $$ select dr_document_id from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'EBITDA') limit 1 $$,
  array['d5a00000-0000-0000-0000-00000000d0ff']::uuid[],
  'search ranks the segment that uses the term most first'
);

select results_eq(
  $$ select snippet from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'rent') $$,
  array['Revenue was 1.4 million with an EBITDA addback for owner salary and <b>rent</b>.'],
  'search returns a snippet with the matched term marked'
);

select results_eq(
  $$ select count(*)::int from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'EBITDA', false, 1) $$,
  array[1],
  'search returns at most the requested number of results'
);

reset role;
update public.document_segment set text = 'Customer concentration in the top ten clients.'
where dr_document_id = 'd5a00000-0000-0000-0000-00000000d002' and segment_index = 1;

select tests.login_as('dsg_owner');
select results_eq(
  $$ select page_from from public.search_document_segments('d5a00000-0000-0000-0000-0000000000d1', 'concentration') $$,
  array[2],
  'search follows a segment whose text changed'
);

-- Reads.
select results_eq(
  $$ select page_from, page_to, text, from_ocr from public.read_document_pages('d5a00000-0000-0000-0000-00000000d0ff', 1, 1) $$,
  $$ values (1, 1, 'EBITDA, adjusted EBITDA and EBITDA margin per Schedule 4.12.', true) $$,
  'reading a page returns its text and whether it came from OCR'
);

select results_eq(
  $$ select page_from from public.read_document_pages('d5a00000-0000-0000-0000-00000000d002', 2, 5) $$,
  array[2],
  'reading pages returns only the pages in the range'
);

select results_eq(
  $$ select page_from, length(text) from public.read_document_pages('d5a00000-0000-0000-0000-00000000d004', 1, 3) $$,
  $$ values (1, 20000), (2, 12000) $$,
  'one page read returns at most 32000 characters, in page order'
);

select is_empty(
  $$ select 1 from public.read_document_pages('d5a00000-0000-0000-0000-00000000d00e', 1, 1) $$,
  'the team reads no pages of a removed document'
);

select results_eq(
  $$ select page_from, truncated, next_page from public.read_document_pages('d5a00000-0000-0000-0000-00000000d004', 1, 3) $$,
  $$ values (1, true, 2), (2, true, 2) $$,
  'a page read the cap cut says so and names the page to read next'
);

select results_eq(
  $$ select page_from, truncated, next_page from public.read_document_pages('d5a00000-0000-0000-0000-00000000d004', 3, 3) $$,
  $$ values (3, false, null::int) $$,
  'a page read that fits says it is whole and names no next page'
);

select results_eq(
  $$ select document_id, name, version, page_count, sheets from public.list_documents('d5a00000-0000-0000-0000-0000000000d1') $$,
  $$ values
       ('d5a00000-0000-0000-0000-00000000d002'::uuid, 'cim.pdf', 2, 2, null::text[]),
       ('d5a00000-0000-0000-0000-00000000d005'::uuid, 'model.xlsx', 1, null::int, array['P&L', 'Balance sheet']),
       ('d5a00000-0000-0000-0000-00000000d004'::uuid, 'report.pdf', 1, 3, null::text[]),
       ('d5a00000-0000-0000-0000-00000000d0ff'::uuid, 'tax-return.pdf', 1, 1, null::text[]) $$,
  'listing documents gives the latest version of each live document with text, with its pages or sheets'
);

select results_eq(
  $$ select sheet, used_range from public.list_sheets('d5a00000-0000-0000-0000-00000000d005') $$,
  $$ values ('P&L', 'A1:AB80'), ('Balance sheet', 'A1:F40') $$,
  'listing sheets gives each sheet in workbook order with the range its cells span'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'B45:C50') $$,
  array['A41:F80'],
  'reading a sheet range returns the block holding those cells'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80') $$,
  array['A1:F40', 'A41:F80'],
  'reading a sheet range returns every overlapping block of that sheet in order, and no other sheet or columns'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'AB7') $$,
  array['AA1:AB40'],
  'a single cell past column Z finds its block'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'b45') $$,
  array['A41:F80'],
  'a lowercase cell reference finds its block'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', '$B$7') $$,
  array['A1:F40'],
  'an anchored cell reference finds its block'
);

select results_eq(
  $$ select cell_range from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'a1:$c$45') $$,
  array['A1:F40', 'A41:F80'],
  'a mixed lowercase and anchored range finds every overlapping block'
);

reset role;
update public.document_segment set formulas = '80 | F: =SUM(F41:F79)'
where dr_document_id = 'd5a00000-0000-0000-0000-00000000d005' and segment_index = 1;

select tests.login_as('dsg_owner');
select results_eq(
  $$ select cell_range, formulas from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80') $$,
  $$ values ('A1:F40', null::text), ('A41:F80', null::text) $$,
  'reading a sheet range leaves formulas out by default'
);

select results_eq(
  $$ select cell_range, formulas from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80', with_formulas => true) $$,
  $$ values ('A1:F40', null::text), ('A41:F80', '80 | F: =SUM(F41:F79)') $$,
  'reading a sheet range with formulas returns each block''s formulas'
);

reset role;
update public.document_segment set text = repeat('t', 20000), formulas = repeat('f', 10000)
where dr_document_id = 'd5a00000-0000-0000-0000-00000000d005' and segment_index = 0;
update public.document_segment set text = repeat('u', 5000), formulas = repeat('g', 5000)
where dr_document_id = 'd5a00000-0000-0000-0000-00000000d005' and segment_index = 1;

select tests.login_as('dsg_owner');
select results_eq(
  $$ select length(text), length(formulas) from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80', with_formulas => true) $$,
  $$ values (20000, 10000), (2000, 0) $$,
  'with formulas, text and formulas together stay within 32000 characters, cut where the cap falls'
);

select results_eq(
  $$ select distinct truncated from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80', with_formulas => true) $$,
  array[true],
  'a sheet read the cap cut says so'
);

select results_eq(
  $$ select length(text), length(formulas) from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80') $$,
  $$ values (20000, null::int), (5000, null::int) $$,
  'without formulas, only text counts toward the cap'
);

select results_eq(
  $$ select distinct truncated from public.read_sheet_range('d5a00000-0000-0000-0000-00000000d005', 'P&L', 'A1:F80') $$,
  array[false],
  'a sheet read that fits says it is whole'
);

reset role;
update public.document_segment set text = repeat('p', 40000)
where dr_document_id = 'd5a00000-0000-0000-0000-00000000d004' and segment_index = 0;

select tests.login_as('dsg_owner');
select results_eq(
  $$ select page_from, length(text), truncated, next_page from public.read_document_pages('d5a00000-0000-0000-0000-00000000d004', 1, 3) $$,
  $$ values (1, 32000, true, 2) $$,
  'a single page over the cap returns its first 32000 characters and points at the page after it'
);

-- Purge.
reset role;
select public.purge_removed_document_text();

select results_eq(
  $$ select distinct dr_document_id from public.document_segment
     where deal_id = 'd5a00000-0000-0000-0000-0000000000d1' order by 1 $$,
  array[
    'd5a00000-0000-0000-0000-00000000d001',
    'd5a00000-0000-0000-0000-00000000d002',
    'd5a00000-0000-0000-0000-00000000d004',
    'd5a00000-0000-0000-0000-00000000d005',
    'd5a00000-0000-0000-0000-00000000d0cc',
    'd5a00000-0000-0000-0000-00000000d0ff'
  ]::uuid[],
  'the purge deletes segments of removed and missing documents and keeps live ones'
);

select * from finish();
rollback;
