begin;
select no_plan();

-- dp_seller is a seller deal_participant on deal d1, the shape the legacy
-- seller portal creates. They answer seller questions and nothing else on the
-- deal is theirs to read or write.
select tests.create_user('dp_owner');
select tests.create_user('dp_seller');
select tests.create_user('dp_lender');
select tests.create_user('dp_buyer');
select tests.create_user('dp_outsider');

select tests.login_as_service_role();
select public.create_team_account('DP Acct', tests.get_uid('dp_owner'), 'dp-acct');

select public.append_deal_event('da000000-0000-0000-0000-0000000000d1', 'deal',
  'da000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dp-acct'), 'firm_id', tests.create_firm(tests.account_id('dp-acct')), 'owner_user_id', tests.get_uid('dp_owner'),
    'description', 'Participant deal'), null, 'service');

reset role;

insert into public.deal_participant (id, deal_id, user_id, party)
values
  ('da000000-0000-0000-0000-0000000000e1', 'da000000-0000-0000-0000-0000000000d1', tests.get_uid('dp_seller'), 'seller'),
  ('da000000-0000-0000-0000-0000000000e3', 'da000000-0000-0000-0000-0000000000d1', tests.get_uid('dp_buyer'), 'buyer');

insert into public.contract (id, deal_id, account_id, type)
values
  ('da000000-0000-0000-0000-0000000000c1', 'da000000-0000-0000-0000-0000000000d1', tests.account_id('dp-acct'), 'loi'),
  ('da000000-0000-0000-0000-0000000000c2', 'da000000-0000-0000-0000-0000000000d1', tests.account_id('dp-acct'), 'apa');
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed)
values
  ('da000000-0000-0000-0000-00000000c101', 'da000000-0000-0000-0000-0000000000c1', tests.account_id('dp-acct'), 1, 'upload', 'buyer', true),
  ('da000000-0000-0000-0000-00000000c201', 'da000000-0000-0000-0000-0000000000c2', tests.account_id('dp-acct'), 1, 'upload', 'buyer', false);

insert into public.approval (id, deal_id, subject, requested_by)
values ('da000000-0000-0000-0000-0000000000a1', 'da000000-0000-0000-0000-0000000000d1', 'apa', tests.get_uid('dp_owner'));

insert into public.seller_question (id, deal_id, account_id, question)
values ('da000000-0000-0000-0000-0000000000b1', 'da000000-0000-0000-0000-0000000000d1', tests.account_id('dp-acct'), 'What were 2025 revenues?');

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('da000000-0000-0000-0000-00000000f001', tests.account_id('dp-acct'), 'da000000-0000-0000-0000-0000000000d1', null, 'Diligence'),
  ('da000000-0000-0000-0000-00000000f00a', tests.account_id('dp-acct'), 'da000000-0000-0000-0000-0000000000d1', null, 'Lender A private');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version)
values
  ('da000000-0000-0000-0000-00000000d001', tests.account_id('dp-acct'), 'da000000-0000-0000-0000-0000000000d1', 'da000000-0000-0000-0000-00000000f001', 'tax-return.pdf', 'dp/d1/tax-return.pdf', 1),
  ('da000000-0000-0000-0000-00000000d00a', tests.account_id('dp-acct'), 'da000000-0000-0000-0000-0000000000d1', 'da000000-0000-0000-0000-00000000f00a', 'term-sheet.pdf', 'dp/d1/term-sheet.pdf', 1);

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('da000000-0000-0000-0000-0000000000aa', tests.account_id('dp-acct'), 'da000000-0000-0000-0000-0000000000d1', 'Lender A', 'da000000-0000-0000-0000-00000000f00a');
insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('da000000-0000-0000-0000-0000000000aa', tests.get_uid('dp_lender'), 'dp_lender@opendealbook.test', tests.get_uid('dp_owner'));

insert into storage.objects (bucket_id, name)
values ('data-room', tests.account_id('dp-acct') || '/da000000-0000-0000-0000-0000000000d1/tax-return.pdf');

-- ---- what the seller portal needs keeps working ----
select tests.login_as('dp_seller');

select is(
  (select count(*) from public.deal_participant where deal_id = 'da000000-0000-0000-0000-0000000000d1' and user_id = tests.get_uid('dp_seller') and party = 'seller'),
  1::bigint,
  'a seller participant reads their own participant row'
);
select results_eq(
  $$ select id, deal_name, stage from public.seller_deal_header('da000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('da000000-0000-0000-0000-0000000000d1'::uuid, 'Fixture business', 'sourcing'::text) $$,
  'a seller participant reads the deal header'
);
select is(
  public.deal_loi_signed('da000000-0000-0000-0000-0000000000d1'),
  true,
  'a seller participant learns the LOI is signed'
);
select is(
  (select count(*) from public.seller_question where deal_id = 'da000000-0000-0000-0000-0000000000d1'),
  1::bigint,
  'a seller participant reads the questions put to them'
);
select lives_ok(
  $$ update public.seller_question set answer = 'About 2.1M' where id = 'da000000-0000-0000-0000-0000000000b1' $$,
  'a seller participant answers a question'
);

-- ---- the leak: a seller participant reaches the buyer's private workspace ----
select is(
  (select count(*) from public.deal where id = 'da000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'a seller participant cannot read the full deal row'
);
select is(
  (select count(*) from public.deal_participant where deal_id = 'da000000-0000-0000-0000-0000000000d1' and user_id <> tests.get_uid('dp_seller')),
  0::bigint,
  'a seller participant cannot read other participants on the deal'
);
select is(
  (select count(*) from public.contract where deal_id = 'da000000-0000-0000-0000-0000000000d1' and type = 'apa'),
  0::bigint,
  'a seller participant cannot read the buyer''s APA contract'
);
select is(
  (select count(*) from public.contract_version where id = 'da000000-0000-0000-0000-00000000c201'),
  0::bigint,
  'a seller participant cannot read an APA contract version'
);
select is(
  (select count(*) from public.approval where deal_id = 'da000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'a seller participant cannot read the deal''s approvals'
);
select is(
  (select count(*) from public.dr_document where id = 'da000000-0000-0000-0000-00000000d001'),
  0::bigint,
  'a seller participant cannot read a data room document'
);
select is(
  (select count(*) from public.dr_folder where id = 'da000000-0000-0000-0000-00000000f00a'),
  0::bigint,
  'a seller participant cannot read a lender room''s private folder'
);
select is(
  (select count(*) from public.dr_document where id = 'da000000-0000-0000-0000-00000000d00a'),
  0::bigint,
  'a seller participant cannot read a document in a lender room''s private folder'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'data-room' and name like '%/da000000-0000-0000-0000-0000000000d1/%'),
  0::bigint,
  'a seller participant cannot read data room files in storage'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('data-room', (select account_id from public.seller_question where id = 'da000000-0000-0000-0000-0000000000b1') || '/da000000-0000-0000-0000-0000000000d1/planted.pdf') $$,
  '42501',
  null,
  'a seller participant cannot upload into the deal''s data room storage'
);
select throws_ok(
  $$ select public.append_deal_event('da000000-0000-0000-0000-0000000000d1', 'deal_participant',
       'da000000-0000-0000-0000-0000000000e2', 'deal_participant.added',
       jsonb_build_object('user_id', tests.get_uid('dp_outsider'), 'party', 'buyer')) $$,
  '42501',
  null,
  'a seller participant cannot grant someone else access to the deal'
);
select throws_ok(
  $$ select public.append_deal_event('da000000-0000-0000-0000-0000000000d1', 'approval',
       'da000000-0000-0000-0000-0000000000a2', 'approval.requested',
       jsonb_build_object('subject', 'apa')) $$,
  '42501',
  null,
  'a seller participant cannot write deal events'
);
select is(
  public.has_deal_permission('da000000-0000-0000-0000-0000000000d1', 'deals.manage'),
  false,
  'a seller participant does not hold deals.manage on the deal'
);

-- ---- buyer, broker and lender participant parties get nothing ----
select tests.login_as('dp_buyer');
select is(
  (select count(*) from public.seller_question where deal_id = 'da000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'a buyer participant cannot read the seller questions'
);
select is_empty(
  $$ select * from public.seller_deal_header('da000000-0000-0000-0000-0000000000d1') $$,
  'a buyer participant gets no seller deal header'
);
select is(
  public.deal_loi_signed('da000000-0000-0000-0000-0000000000d1'),
  false,
  'a buyer participant learns nothing about the LOI'
);
select is(
  (select count(*) from public.dr_document where deal_id = 'da000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'a buyer participant cannot read the data room'
);

select tests.login_as('dp_outsider');
select is(
  public.deal_loi_signed('da000000-0000-0000-0000-0000000000d1'),
  false,
  'an outsider learns nothing about the LOI'
);

-- ---- the lender still reaches their own private folder through the room ----
select tests.login_as('dp_lender');
select is(
  (select count(*) from public.dr_document where id = 'da000000-0000-0000-0000-00000000d00a'),
  1::bigint,
  'a lender room member reads a document in their room''s private folder'
);

select * from finish();
rollback;
