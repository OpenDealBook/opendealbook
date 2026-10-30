begin;
select no_plan();

-- Team "SSR Team" owns deal d1 and its seller room, which shows a Financials
-- folder. ssr_walt is the seller, ssr_owen his counsel. On the buyer side:
-- ssr_owner, ssr_analyst, ssr_buyer_law (buyer's counsel) and ssr_lender.
select tests.create_user('ssr_owner');
select tests.create_user('ssr_analyst');
select tests.create_user('ssr_buyer_law');
select tests.create_user('ssr_lender');
select tests.create_user('ssr_walt');
select tests.create_user('ssr_owen');

select tests.login_as_service_role();
select public.create_team_account('SSR Team', tests.get_uid('ssr_owner'), 'ssr-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('ssr-team'), tests.get_uid('ssr_analyst'), 'analyst');
select public.append_deal_event('55500000-0000-0000-0000-0000000000d1', 'deal',
  '55500000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ssr-team'), 'firm_id', tests.create_firm(tests.account_id('ssr-team')), 'owner_user_id', tests.get_uid('ssr_owner'),
    'description', 'Seller side read-only deal'), null, 'service');

select tests.login_as('ssr_owner');
select public.ensure_seller_room('55500000-0000-0000-0000-0000000000d1');

reset role;
create temp table ssr_room as
select id, account_id from public.seller_room where deal_id = '55500000-0000-0000-0000-0000000000d1';
grant select on ssr_room to authenticated;

insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('ssr_walt'), 'ssr_walt@opendealbook.test', 'Walt Brennan' from ssr_room;
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by) values
  (tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('ssr_owen'), 'ssr_owen@opendealbook.test', 'Owen Castillo', tests.get_uid('ssr_walt')),
  (tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('ssr_buyer_law'), 'ssr_buyer_law@opendealbook.test', 'Bea Law', tests.get_uid('ssr_owner'));
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('55500000-0000-0000-0000-0000000000f1', tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1', 'Financials'),
  ('55500000-0000-0000-0000-0000000000f2', tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1', 'Lender A');
insert into public.seller_room_folder (room_id, dr_folder_id)
select id, '55500000-0000-0000-0000-0000000000f1' from ssr_room;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path) values
  ('55500000-0000-0000-0000-0000000000a1', tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1',
    '55500000-0000-0000-0000-0000000000f1', 'p-and-l.pdf', 'ssr/p-and-l.pdf');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
select '55500000-0000-0000-0000-0000000000a2', tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1',
  s.folder_id, 'engagement.pdf', 'ssr/engagement.pdf'
from public.seller_counsel_folder s where s.deal_id = '55500000-0000-0000-0000-0000000000d1';
insert into public.seller_room_question (id, room_id, account_id, title)
select '55500000-0000-0000-0000-0000000000b1', id, account_id, 'Why did revenue dip?' from ssr_room;
insert into public.contract (id, deal_id, account_id, type, current_version) values
  ('55500000-0000-0000-0000-0000000000e1', '55500000-0000-0000-0000-0000000000d1', tests.account_id('ssr-team'), 'apa', 1);
insert into public.contract_version (id, contract_id, account_id, version, source, party, shared_at) values
  ('55500000-0000-0000-0000-0000000000e2', '55500000-0000-0000-0000-0000000000e1', tests.account_id('ssr-team'),
    1, 'upload', 'buyer', now());
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id) values
  ('55500000-0000-0000-0000-0000000000c1', tests.account_id('ssr-team'), '55500000-0000-0000-0000-0000000000d1',
   'Lender A', '55500000-0000-0000-0000-0000000000f2');
insert into public.lender_room_member (room_id, user_id, email) values
  ('55500000-0000-0000-0000-0000000000c1', tests.get_uid('ssr_lender'), 'ssr_lender@opendealbook.test');

select tests.login_as('ssr_walt');
select public.post_seller_counsel_message('55500000-0000-0000-0000-0000000000d1', 'Before the room closed');

-- ---- The seller room closes ----

reset role;
update public.seller_room set closed_at = now() where deal_id = '55500000-0000-0000-0000-0000000000d1';

select tests.login_as('ssr_walt');
select is(
  public.seller_side_read_only_reason('55500000-0000-0000-0000-0000000000d1'),
  'The seller room is closed, so this is read-only.',
  'the seller is told a closed room is read-only'
);
select results_eq(
  $$ select name from public.dr_document where folder_id = '55500000-0000-0000-0000-0000000000f1' $$,
  $$ values ('p-and-l.pdf') $$,
  'the seller still reads the files a closed room shows'
);
select isnt_empty(
  $$ select 1 from public.seller_room_documents((select id from ssr_room))
     union all select 1 from public.seller_room_question $$,
  'the seller still reads a closed room''s questions'
);
select results_eq(
  $$ select name from public.dr_document where id = '55500000-0000-0000-0000-0000000000a2' $$,
  $$ values ('engagement.pdf') $$,
  'the seller still reads the Seller''s counsel folder'
);
select results_eq(
  $$ select body from public.seller_counsel_message $$,
  $$ values ('Before the room closed') $$,
  'the seller still reads the private thread'
);
select throws_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('55500000-0000-0000-0000-0000000000b1', 'seller', 'Late answer') $$,
  '42501',
  null,
  'the seller cannot answer a question in a closed room'
);
select throws_ok(
  $$ insert into public.seller_room_question_file (question_id, dr_document_id, side)
     values ('55500000-0000-0000-0000-0000000000b1', '55500000-0000-0000-0000-0000000000a1', 'seller') $$,
  '42501',
  null,
  'the seller cannot attach a file to an answer in a closed room'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('55500000-0000-0000-0000-0000000000d1', 'Late note') $$,
  'P0001',
  'The seller room is closed, so this is read-only.',
  'the seller cannot post in the private thread once the room closes, and is told why'
);
delete from public.deal_counsel where deal_id = '55500000-0000-0000-0000-0000000000d1' and side = 'seller';

select tests.login_as_service_role();
select isnt_empty(
  $$ select 1 from public.deal_counsel where deal_id = '55500000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  'the seller cannot remove their counsel from a closed room'
);

select tests.login_as('ssr_owen');
select throws_ok(
  $$ select public.post_seller_counsel_message('55500000-0000-0000-0000-0000000000d1', 'Late note') $$,
  'P0001',
  'The seller room is closed, so this is read-only.',
  'seller''s counsel cannot post once the room closes, and are told why'
);

select results_eq(
  $$ select id from public.seller_side_contracts('55500000-0000-0000-0000-0000000000d1') $$,
  $$ values ('55500000-0000-0000-0000-0000000000e1'::uuid) $$,
  'the seller still reads the contracts shown to them once the room closes'
);

-- Seller's counsel read a closed room while the deal is open, and write nothing.
select tests.login_as('ssr_owen');
select ok(
  public.is_seller_room_member((select id from ssr_room)),
  'seller''s counsel still read a closed room'
);
select results_eq(
  $$ select name from public.dr_document where folder_id = '55500000-0000-0000-0000-0000000000f1' $$,
  $$ values ('p-and-l.pdf') $$,
  'seller''s counsel still read the files a closed room shows'
);
select throws_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, dr_document_id, body)
     select id, account_id, '55500000-0000-0000-0000-0000000000a1', 'Late comment' from ssr_room $$,
  '42501',
  null,
  'seller''s counsel cannot comment in a closed room'
);

-- The buyer side is unchanged.
select tests.login_as('ssr_owner');
select lives_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('55500000-0000-0000-0000-0000000000b1', 'internal', 'Note for the team') $$,
  'the team still writes its own notes on a closed room''s question'
);
select is_empty($$ select 1 from public.seller_counsel_message $$, 'the buyer team''s owner still sees no private thread');
select is(
  public.seller_side_read_only_reason('55500000-0000-0000-0000-0000000000d1'),
  null,
  'the buyer team is never given the seller side''s reason'
);

select tests.login_as('ssr_analyst');
select is(public.is_seller_room_member((select id from ssr_room)), false, 'a buyer analyst is no seller room member');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'a buyer analyst still sees no private thread');

select tests.login_as('ssr_buyer_law');
select is(public.is_seller_room_member((select id from ssr_room)), false, 'buyer''s counsel are no seller room member');
select is_empty($$ select 1 from public.seller_room_question $$, 'buyer''s counsel cannot read the closed room''s questions directly');

select tests.login_as('ssr_lender');
select is(public.is_seller_room_member((select id from ssr_room)), false, 'a lender is no seller room member');
select is_empty($$ select 1 from public.dr_document where folder_id = '55500000-0000-0000-0000-0000000000f1' $$,
  'a lender still cannot read the room''s files');

-- ---- The deal is archived ----

reset role;
update public.seller_room set closed_at = null where deal_id = '55500000-0000-0000-0000-0000000000d1';
update public.deal set archived_at = now() where id = '55500000-0000-0000-0000-0000000000d1';

select tests.login_as('ssr_owen');
select is(
  public.is_seller_room_member((select id from ssr_room)),
  false,
  'seller''s counsel no longer read the room once the deal is archived'
);

select tests.login_as('ssr_walt');
select is(
  public.seller_side_read_only_reason('55500000-0000-0000-0000-0000000000d1'),
  'This deal has closed, so everything here is read-only.',
  'the seller is told an ended deal is read-only'
);
select results_eq(
  $$ select name from public.dr_document where folder_id = '55500000-0000-0000-0000-0000000000f1' $$,
  $$ values ('p-and-l.pdf') $$,
  'the seller still reads the room''s files once the deal is archived'
);
select throws_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('55500000-0000-0000-0000-0000000000b1', 'seller', 'Late answer') $$,
  '42501',
  null,
  'the seller cannot answer once the deal is archived'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('55500000-0000-0000-0000-0000000000d1', 'Late note') $$,
  'P0001',
  'This deal has closed, so everything here is read-only.',
  'the seller cannot post once the deal is archived, and is told why'
);
select results_eq(
  $$ select id from public.seller_side_contracts('55500000-0000-0000-0000-0000000000d1') $$,
  $$ values ('55500000-0000-0000-0000-0000000000e1'::uuid) $$,
  'the seller still reads the contracts once the deal is archived'
);

-- ---- Back open ----

reset role;
update public.deal set archived_at = null where id = '55500000-0000-0000-0000-0000000000d1';

select tests.login_as('ssr_walt');
select lives_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('55500000-0000-0000-0000-0000000000b1', 'seller', 'Answer') $$,
  'the seller answers again once the room is open'
);

select * from finish();
rollback;
