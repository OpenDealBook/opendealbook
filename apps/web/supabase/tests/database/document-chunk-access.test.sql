begin;
select no_plan();

-- Deal d1 on account A: a lender package folder shown to an open lender room,
-- a diligence folder the room does not show, and a document removed from the
-- package. Each document has one indexed chunk.
select tests.create_user('dca_owner');
select tests.create_user('dca_foreign');
select tests.create_user('dca_lender');

select tests.login_as_service_role();
select public.create_team_account('DCA Acct', tests.get_uid('dca_owner'), 'dca-acct');
select public.create_team_account('DCA Foreign', tests.get_uid('dca_foreign'), 'dca-foreign');

select public.append_deal_event('dca00000-0000-0000-0000-0000000000d1', 'deal',
  'dca00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dca-acct'), 'firm_id', tests.create_firm(tests.account_id('dca-acct')),
    'owner_user_id', tests.get_uid('dca_owner'), 'description', 'Chunk deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, name)
values
  ('dca00000-0000-0000-0000-00000000f001', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'Lender package'),
  ('dca00000-0000-0000-0000-00000000f00a', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'Room A'),
  ('dca00000-0000-0000-0000-00000000f0ff', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'Diligence');

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version)
values
  ('dca00000-0000-0000-0000-00000000d001', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000f001', 'cim.pdf', 'deal/x/cim.pdf', 1),
  ('dca00000-0000-0000-0000-00000000d00e', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000f001', 'removed.pdf', 'deal/x/removed.pdf', 1),
  ('dca00000-0000-0000-0000-00000000d0ff', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000f0ff', 'tax-return.pdf', 'deal/x/tax-return.pdf', 1);

insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content)
values
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000d001', 0, 'cim'),
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000d00e', 0, 'removed'),
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'dca00000-0000-0000-0000-00000000d0ff', 0, 'tax return');

insert into public.lender_package (deal_id, account_id, master_folder_id)
values ('dca00000-0000-0000-0000-0000000000d1', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-00000000f001');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('dca00000-0000-0000-0000-0000000000a0', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d1', 'Lender A', 'dca00000-0000-0000-0000-00000000f00a');

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('dca00000-0000-0000-0000-0000000000a0', tests.get_uid('dca_lender'), 'dca_lender@opendealbook.test', tests.get_uid('dca_owner'));

select public.append_deal_event('dca00000-0000-0000-0000-0000000000d1', 'dr_document',
  'dca00000-0000-0000-0000-00000000d00e', 'dr_document.removed', '{}'::jsonb, null, 'service');

-- Deal d2 on account A has a seller room showing one folder, an internal
-- folder it does not show, and the Seller's counsel folder that inviting
-- seller's counsel creates. Each document has one indexed chunk.
select tests.create_user('dca_seller');
select tests.create_user('dca_counsel');

select tests.login_as_service_role();
select public.append_deal_event('dca00000-0000-0000-0000-0000000000d2', 'deal',
  'dca00000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dca-acct'), 'firm_id', tests.create_firm(tests.account_id('dca-acct')),
    'owner_user_id', tests.get_uid('dca_owner'), 'description', 'Seller deal'), null, 'service');

select tests.login_as('dca_owner');
select public.ensure_seller_room('dca00000-0000-0000-0000-0000000000d2');

reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('dca_seller'), 'dca_seller@opendealbook.test', 'Sam Seller'
from public.seller_room where deal_id = 'dca00000-0000-0000-0000-0000000000d2';

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by)
values (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'seller',
  tests.get_uid('dca_counsel'), 'dca_counsel@opendealbook.test', 'Cora Counsel', tests.get_uid('dca_seller'));

insert into public.dr_folder (id, account_id, deal_id, name)
values
  ('dca00000-0000-0000-0000-00000000f201', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'Shared'),
  ('dca00000-0000-0000-0000-00000000f202', tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'Internal');

insert into public.seller_room_folder (room_id, dr_folder_id)
select id, 'dca00000-0000-0000-0000-00000000f201'
from public.seller_room where deal_id = 'dca00000-0000-0000-0000-0000000000d2';

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version)
select v.id::uuid, tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', v.folder_id, v.name, 'deal/y/' || v.name, 1
from (values
  ('dca00000-0000-0000-0000-00000000d201', 'dca00000-0000-0000-0000-00000000f201'::uuid, 'shared.pdf'),
  ('dca00000-0000-0000-0000-00000000d202', 'dca00000-0000-0000-0000-00000000f202'::uuid, 'internal.pdf'),
  ('dca00000-0000-0000-0000-00000000d203',
    (select folder_id from public.seller_counsel_folder where deal_id = 'dca00000-0000-0000-0000-0000000000d2'), 'side-letter.pdf')
) as v (id, folder_id, name);

insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content)
values
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'dca00000-0000-0000-0000-00000000d201', 0, 'shared'),
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'dca00000-0000-0000-0000-00000000d202', 0, 'internal'),
  (tests.account_id('dca-acct'), 'dca00000-0000-0000-0000-0000000000d2', 'dca00000-0000-0000-0000-00000000d203', 0, 'side letter');

select tests.login_as('dca_owner');
select results_eq(
  $$ select content from public.document_chunk
     where deal_id = 'dca00000-0000-0000-0000-0000000000d1' order by content $$,
  array['cim', 'tax return'],
  'the team reads chunks of every live document and none of a removed one'
);

select tests.login_as('dca_lender');
select results_eq(
  $$ select content from public.document_chunk $$,
  array['cim'],
  'a lender reads chunks of exactly the documents their open room shows'
);

select tests.login_as('dca_seller');
select results_eq(
  $$ select content from public.document_chunk $$,
  array['shared'],
  'a seller reads chunks of the room''s documents and none of the internal or Seller''s counsel files'
);

select tests.login_as('dca_counsel');
select isnt_empty(
  $$ select 1 from public.dr_document where id = 'dca00000-0000-0000-0000-00000000d203' $$,
  'seller''s counsel opens a file in the Seller''s counsel folder'
);
select is_empty(
  $$ select 1 from public.document_chunk where document_id = 'dca00000-0000-0000-0000-00000000d203' $$,
  'seller''s counsel reads no chunks of a Seller''s counsel file'
);

select tests.login_as('dca_foreign');
select is_empty(
  $$ select 1 from public.document_chunk $$,
  'another team reads no chunks'
);

select * from finish();
rollback;
