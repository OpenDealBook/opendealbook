begin;
select no_plan();

-- Team "CIC Team" owns deals d1 and d2. cic_owner manages, cic_analyst does
-- deal work, cic_viewer only reads, cic_stranger is on another team. Deal d1
-- has a "Financials" folder with a P&L PDF and a Seller's counsel folder with
-- a counsel memo; deal d2 has its own file.
select tests.create_user('cic_owner');
select tests.create_user('cic_analyst');
select tests.create_user('cic_viewer');
select tests.create_user('cic_stranger');
select tests.create_user('cic_counsel');

select tests.login_as_service_role();
select public.create_team_account('CIC Team', tests.get_uid('cic_owner'), 'cic-team');
select public.create_team_account('CIC Other', tests.get_uid('cic_stranger'), 'cic-other');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('cic-team'), tests.get_uid('cic_analyst'), 'analyst'),
  (tests.account_id('cic-team'), tests.get_uid('cic_viewer'), 'viewer');

select public.append_deal_event('c1c00000-0000-0000-0000-0000000000d1', 'deal',
  'c1c00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cic-team'), 'owner_user_id', tests.get_uid('cic_owner'),
    'description', 'Citation deal'), null, 'service');
select public.append_deal_event('c1c00000-0000-0000-0000-0000000000d2', 'deal',
  'c1c00000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cic-team'), 'owner_user_id', tests.get_uid('cic_owner'),
    'description', 'Other deal'), null, 'service');

reset role;
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'seller',
  tests.get_uid('cic_counsel'), 'cic_counsel@tuckin.test', 'Cora Counsel');

insert into public.dr_folder (id, account_id, deal_id, name) values
  ('c1c00000-0000-0000-0000-0000000000f1', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'Financials'),
  ('c1c00000-0000-0000-0000-0000000000f2', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d2', 'Financials');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path) values
  ('c1c00000-0000-0000-0000-0000000000a1', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1',
    'c1c00000-0000-0000-0000-0000000000f1', 'p-and-l.pdf', 'cic/p-and-l.pdf'),
  ('c1c00000-0000-0000-0000-0000000000a3', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d2',
    'c1c00000-0000-0000-0000-0000000000f2', 'other.pdf', 'cic/other.pdf');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
select 'c1c00000-0000-0000-0000-0000000000a2', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1',
  s.folder_id, 'counsel-memo.pdf', 'cic/counsel-memo.pdf'
from public.seller_counsel_folder s where s.deal_id = 'c1c00000-0000-0000-0000-0000000000d1';

insert into public.calc_version (id, account_id, deal_id, type, created_by, is_primary) values
  ('c1c00000-0000-0000-0000-0000000000b1', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'sde', tests.get_uid('cic_analyst'), false),
  ('c1c00000-0000-0000-0000-0000000000b2', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'sde', tests.get_uid('cic_owner'), false),
  ('c1c00000-0000-0000-0000-0000000000b3', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'sde', tests.get_uid('cic_analyst'), true),
  ('c1c00000-0000-0000-0000-0000000000b4', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d1', 'sde', tests.get_uid('cic_analyst'), false);
insert into public.deal_financials (deal_id, account_id, source_calc_version_id) values
  ('c1c00000-0000-0000-0000-0000000000d1', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b4');

-- ---- who cites ----

select tests.login_as('cic_analyst');
select lives_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page, cell)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b1', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a1', 4, 'B12') $$,
  'an analyst cites a page on their own scratch calc'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a1', 1) $$,
  '42501', null,
  'an analyst cannot cite on a calc someone else made'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b3', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a1', 1) $$,
  '42501', null,
  'an analyst cannot cite on the primary calc'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b4', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a1', 1) $$,
  '42501', null,
  'an analyst cannot cite on the adopted calc'
);

select tests.login_as('cic_viewer');
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b1', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a1', 1) $$,
  '42501', null,
  'a viewer cannot cite'
);

select tests.login_as('cic_owner');
select lives_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, sheet)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b3', 'sde.0.cogs',
       'c1c00000-0000-0000-0000-0000000000a1', 'P&L 2023') $$,
  'a manager cites on the primary calc'
);
select lives_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b4', 'sde.0.cogs',
       'c1c00000-0000-0000-0000-0000000000a1', 2) $$,
  'a manager cites on the adopted calc'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page, sheet)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.cogs',
       'c1c00000-0000-0000-0000-0000000000a1', 1, 'P&L') $$,
  '23514', null,
  'a citation names a page or a sheet, not both'
);
select lives_ok(
  $$ insert into public.calc_input_citation (id, account_id, calc_version_id, input_key, dr_document_id)
     values ('c1c00000-0000-0000-0000-0000000000c9', tests.account_id('cic-team'),
       'c1c00000-0000-0000-0000-0000000000b2', 'cogs', 'c1c00000-0000-0000-0000-0000000000a1') $$,
  'a citation can name the whole document'
);
delete from public.calc_input_citation where id = 'c1c00000-0000-0000-0000-0000000000c9';

-- ---- the Seller's counsel folder is never cited ----

-- Refused exactly as an id that does not exist, so nobody can probe which
-- ids are Seller's counsel files.
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a2', 1) $$,
  '23503', 'A calc cites only documents in its own deal',
  'a manager cannot cite a Seller''s counsel file'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000fe', 1) $$,
  '23503', 'A calc cites only documents in its own deal',
  'an unknown document is refused with the same code and message'
);
select tests.login_as_service_role();
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a2', 1) $$,
  '23503', 'A calc cites only documents in its own deal',
  'not even the server cites a Seller''s counsel file'
);

-- ---- a citation stays on its own deal ----

select tests.login_as('cic_owner');
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000a3', 1) $$,
  '23503', null,
  'a calc cannot cite a document of another deal'
);
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sde.0.sales',
       'c1c00000-0000-0000-0000-0000000000ff', 1) $$,
  '23503', null,
  'a calc cannot cite a document that does not exist'
);

-- ---- who reads ----

select tests.login_as('cic_viewer');
select results_eq(
  $$ select input_key, page, sheet, cell from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b1') $$,
  $$ values ('sde.0.sales', 4, null::text, 'B12') $$,
  'everyone on the team reads a calc''s citations'
);
select tests.login_as('cic_stranger');
select is_empty(
  $$ select 1 from public.calc_input_citation $$,
  'another team reads no citations'
);
select is_empty(
  $$ select 1 from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b1') $$,
  'another team reads no citations through the listing either'
);

-- ---- who removes ----

select tests.login_as('cic_analyst');
delete from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b3';
select tests.login_as('cic_owner');
select results_eq(
  $$ select count(*)::int from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b3' $$,
  $$ values (1) $$,
  'an analyst cannot remove a citation from the primary calc'
);
select tests.login_as('cic_analyst');
delete from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b1';
select is_empty(
  $$ select 1 from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b1' $$,
  'an analyst removes a citation from their own scratch calc'
);

-- ---- a citation pins its document version ----

select tests.login_as('cic_owner');
select results_eq(
  $$ select document_name, document_version, newer_version_uploaded, document_removed
     from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b3') $$,
  $$ values ('p-and-l.pdf', 1, false, false) $$,
  'a fresh citation is current'
);

select tests.login_as_service_role();
select public.append_deal_event('c1c00000-0000-0000-0000-0000000000d1', 'dr_document',
  'c1c00000-0000-0000-0000-0000000000a4', 'dr_document.added',
  jsonb_build_object('folder_id', 'c1c00000-0000-0000-0000-0000000000f1', 'name', 'p-and-l.pdf',
    'storage_path', 'deal/c1c00000-0000-0000-0000-0000000000d1/p-and-l-v2.pdf', 'version', 2), null, 'service');

select tests.login_as('cic_owner');
select results_eq(
  $$ select dr_document_id, document_version, newer_version_uploaded, document_removed
     from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b3') $$,
  $$ values ('c1c00000-0000-0000-0000-0000000000a1'::uuid, 1, true, false) $$,
  'a newer upload of the file flags the citation and keeps the pinned version'
);

select tests.login_as_service_role();
select public.append_deal_event('c1c00000-0000-0000-0000-0000000000d1', 'dr_document',
  'c1c00000-0000-0000-0000-0000000000a1', 'dr_document.removed', '{}'::jsonb, null, 'service');

select tests.login_as('cic_owner');
select results_eq(
  $$ select document_name, document_removed
     from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b3') $$,
  $$ values ('p-and-l.pdf', true) $$,
  'removing the cited document flags the citation'
);

-- ---- the snapshot outlives the document ----

select tests.login_as('cic_owner');
select results_eq(
  $$ select document_name, document_version
     from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b3' $$,
  $$ values ('p-and-l.pdf', 1) $$,
  'a citation keeps the document name and version it was made against'
);

select tests.login_as('cic_owner');
select lives_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page,
       document_name, document_version)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sales',
       'c1c00000-0000-0000-0000-0000000000a4', 3, 'made-up.pdf', 9) $$,
  'the manager cites the second upload'
);
select results_eq(
  $$ select document_name, document_version
     from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b2' $$,
  $$ values ('p-and-l.pdf', 2) $$,
  'the snapshot comes from the document, never from the caller'
);

reset role;
delete from public.dr_document where id = 'c1c00000-0000-0000-0000-0000000000a4';

select tests.login_as('cic_owner');
select results_eq(
  $$ select document_name, document_version, document_removed
     from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b2') $$,
  $$ values ('p-and-l.pdf', 2, true) $$,
  'a hard-deleted document still shows as removed'
);
select lives_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b3', 'sales',
       'c1c00000-0000-0000-0000-0000000000a4', 3) $$,
  'a citation of a deleted document copies to another calc of the same deal'
);
select results_eq(
  $$ select document_name, document_version
     from public.calc_input_citation where calc_version_id = 'c1c00000-0000-0000-0000-0000000000b3' and input_key = 'sales' $$,
  $$ values ('p-and-l.pdf', 2) $$,
  'the copy keeps the snapshot'
);

reset role;
insert into public.calc_version (id, account_id, deal_id, type, created_by) values
  ('c1c00000-0000-0000-0000-0000000000b5', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000d2', 'sde', tests.get_uid('cic_owner'));
select tests.login_as('cic_owner');
select throws_ok(
  $$ insert into public.calc_input_citation (account_id, calc_version_id, input_key, dr_document_id, page)
     values (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b5', 'sales',
       'c1c00000-0000-0000-0000-0000000000a4', 3) $$,
  '23503', null,
  'a deleted document is never cited from another deal'
);

-- ---- citations go with their row ----

reset role;
insert into public.sde_period (id, account_id, calc_version_id, weight) values
  ('c1c00000-0000-0000-0000-0000000000e1', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 0.5),
  ('c1c00000-0000-0000-0000-0000000000e2', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 0.5);
insert into public.sde_line (id, account_id, period_id, line_code, custom_label, amount) values
  ('c1c00000-0000-0000-0000-0000000000e3', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000e2', 'custom', 'Rent', 100);
insert into public.funding_source (id, account_id, calc_version_id, type, amount) values
  ('c1c00000-0000-0000-0000-0000000000e4', tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'sba_7a', 1000);

select tests.login_as('cic_owner');
insert into public.calc_input_citation (account_id, calc_version_id, row_id, input_key, dr_document_id, page)
values
  (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'c1c00000-0000-0000-0000-0000000000e1', 'sales', 'c1c00000-0000-0000-0000-0000000000a1', 1),
  (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'c1c00000-0000-0000-0000-0000000000e2', 'sales', 'c1c00000-0000-0000-0000-0000000000a1', 2),
  (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'c1c00000-0000-0000-0000-0000000000e3', 'amount', 'c1c00000-0000-0000-0000-0000000000a1', 3),
  (tests.account_id('cic-team'), 'c1c00000-0000-0000-0000-0000000000b2', 'c1c00000-0000-0000-0000-0000000000e4', 'rate', 'c1c00000-0000-0000-0000-0000000000a1', 4);

delete from public.sde_period where id = 'c1c00000-0000-0000-0000-0000000000e1';
delete from public.funding_source where id = 'c1c00000-0000-0000-0000-0000000000e4';
select results_eq(
  $$ select row_id, page from public.calc_input_citations('c1c00000-0000-0000-0000-0000000000b2')
     where row_id is not null order by page $$,
  $$ values ('c1c00000-0000-0000-0000-0000000000e2'::uuid, 2), ('c1c00000-0000-0000-0000-0000000000e3'::uuid, 3) $$,
  'removing a period or a funding source removes its citations and keeps the others'
);
delete from public.sde_period where id = 'c1c00000-0000-0000-0000-0000000000e2';
select is_empty(
  $$ select 1 from public.calc_input_citation where row_id is not null $$,
  'removing a period removes its custom addbacks'' citations too'
);

-- ---- why a change is refused ----

select tests.login_as('cic_analyst');
select is(public.calc_citation_refusal('c1c00000-0000-0000-0000-0000000000b2'), 'not_yours',
  'an analyst is told the version is not theirs');
select is(public.calc_citation_refusal('c1c00000-0000-0000-0000-0000000000b3'), 'not_yours',
  'an analyst is told the primary is not theirs to change');
select is(public.calc_citation_refusal('c1c00000-0000-0000-0000-0000000000b1'), null,
  'an analyst may change their own scratch version');
select tests.login_as('cic_viewer');
select is(public.calc_citation_refusal('c1c00000-0000-0000-0000-0000000000b1'), 'read_only',
  'a viewer is told they only read');
select tests.login_as('cic_stranger');
select is(public.calc_citation_refusal('c1c00000-0000-0000-0000-0000000000b1'), 'outsider',
  'another team is told only the deal team may');

select * from finish();
rollback;
