begin;
select no_plan();

-- Account 1 owns deal d1 (rooms A and B, a master package) and deal d3 (no
-- package yet). Account 2 owns deal d2 (rooms Z and Y, no firm). Every user
-- here also owns a personal account, which holds no deal work;
-- lr_side_dealer opens deal d9 on their own team.
select tests.create_user('lr_owner');
select tests.create_user('lr_owner_2');
select tests.create_user('lr_lender_a');
select tests.create_user('lr_lender_a2');
select tests.create_user('lr_lender_b');
select tests.create_user('lr_lender_ab');
select tests.create_user('lr_lender_z');
select tests.create_user('lr_outsider');
select tests.create_user('lr_side_dealer');
select tests.create_user('lr_member');

select tests.login_as_service_role();
select public.create_team_account('LR Acct', tests.get_uid('lr_owner'), 'lr-acct');
select public.create_team_account('LR Acct 2', tests.get_uid('lr_owner_2'), 'lr-acct-2');
select public.create_team_account('LR Side', tests.get_uid('lr_side_dealer'), 'lr-side');

select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'deal',
  '1e000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lr-acct'), 'firm_id', tests.create_firm(tests.account_id('lr-acct')), 'owner_user_id', tests.get_uid('lr_owner'),
    'description', 'Lender deal'), null, 'service');
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d2', 'deal',
  '1e000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lr-acct-2'), 'firm_id', tests.create_firm(tests.account_id('lr-acct-2')), 'owner_user_id', tests.get_uid('lr_owner_2'),
    'description', 'Other deal'), null, 'service');
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d3', 'deal',
  '1e000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lr-acct'), 'firm_id', tests.create_firm(tests.account_id('lr-acct')), 'owner_user_id', tests.get_uid('lr_owner'),
    'description', 'Packageless deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('lr_member'), tests.account_id('lr-acct'), 'member');

insert into public.firm (id, account_id, name)
values ('1e000000-0000-0000-0000-0000000000f1', tests.account_id('lr-acct'), 'Target Co');
update public.deal set firm_id = '1e000000-0000-0000-0000-0000000000f1'
where id = '1e000000-0000-0000-0000-0000000000d1';

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('1e000000-0000-0000-0000-00000000f001', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Lender package'),
  ('1e000000-0000-0000-0000-00000000f002', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'Financials'),
  ('1e000000-0000-0000-0000-00000000f003', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'Hidden for A'),
  ('1e000000-0000-0000-0000-00000000f004', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f003', 'Under hidden'),
  ('1e000000-0000-0000-0000-00000000f00a', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Room A'),
  ('1e000000-0000-0000-0000-00000000f0a1', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00a', 'Room A sub'),
  ('1e000000-0000-0000-0000-00000000f00b', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Room B'),
  ('1e000000-0000-0000-0000-00000000f00c', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Room C'),
  ('1e000000-0000-0000-0000-00000000f0ff', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Diligence'),
  ('1e000000-0000-0000-0000-00000000f201', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', null, 'Lender package'),
  ('1e000000-0000-0000-0000-00000000f20a', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', null, 'Room Z'),
  ('1e000000-0000-0000-0000-00000000f301', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d3', null, 'Lender package');

-- d003 and d103 are two versions of one file; d00e has been removed; d0c9
-- belongs to deal d2 yet sits in a deal d1 master folder.
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, removed_at)
values
  ('1e000000-0000-0000-0000-00000000d001', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'cim.pdf', 'deal/x/cim.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d002', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f002', 'pnl.xlsx', 'deal/x/pnl.xlsx', 1, null),
  ('1e000000-0000-0000-0000-00000000d003', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'hidden-for-a.pdf', 'deal/x/hidden-for-a.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d103', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'hidden-for-a.pdf', 'deal/x/hidden-for-a-v2.pdf', 2, null),
  ('1e000000-0000-0000-0000-00000000d004', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f003', 'in-hidden-folder.pdf', 'deal/x/in-hidden-folder.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d005', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f004', 'under-hidden-folder.pdf', 'deal/x/under-hidden-folder.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d00e', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'removed.pdf', 'deal/x/removed.pdf', 1, now()),
  ('1e000000-0000-0000-0000-00000000d00a', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0a1', 'for-a.pdf', 'deal/x/for-a.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d00c', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0a1', 'asked-about.pdf', 'deal/x/asked-about.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d00b', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00b', 'for-b.pdf', 'deal/x/for-b.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d0ff', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0ff', 'tax-return.pdf', 'deal/x/tax-return.pdf', 1, null),
  ('1e000000-0000-0000-0000-00000000d201', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', '1e000000-0000-0000-0000-00000000f201', 'other-cim.pdf', 'deal/y/other-cim.pdf', 1, null);

-- The database refuses cross-team links, so the misfiled rows the read side
-- must still defend against are seeded with triggers off.
set local session_replication_role = replica;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, removed_at)
values ('1e000000-0000-0000-0000-00000000d0c9', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', '1e000000-0000-0000-0000-00000000f002', 'misfiled.pdf', 'deal/y/misfiled.pdf', 1, null);
set local session_replication_role = origin;

insert into public.lender_brand (domain, name, logo_path)
values ('lender-a.test', 'Lender A Bank', 'lender-a.test/logo.png');
insert into storage.objects (bucket_id, name) values ('lender-brand', 'lender-a.test/logo.png');

insert into public.lender_package (deal_id, account_id, master_folder_id)
values
  ('1e000000-0000-0000-0000-0000000000d1', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-00000000f001'),
  ('1e000000-0000-0000-0000-0000000000d2', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-00000000f201');

-- Room Y belongs to deal d2 but names a deal d1 folder as its private folder.
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, welcome_note, private_folder_id)
values
  ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', 'lender-a.test', 'Lender A', 'Welcome', '1e000000-0000-0000-0000-00000000f00a'),
  ('1e000000-0000-0000-0000-0000000000b0', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'Lender B', null, '1e000000-0000-0000-0000-00000000f00b'),
  ('1e000000-0000-0000-0000-0000000000e0', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', null, 'Lender Z', null, '1e000000-0000-0000-0000-00000000f20a');

set local session_replication_role = replica;
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, welcome_note, private_folder_id)
values ('1e000000-0000-0000-0000-0000000000e1', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d2', null, 'Lender Y', null, '1e000000-0000-0000-0000-00000000f0ff');
set local session_replication_role = origin;

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values
  ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test', tests.get_uid('lr_owner')),
  ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test', tests.get_uid('lr_owner')),
  ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test', tests.get_uid('lr_owner')),
  ('1e000000-0000-0000-0000-0000000000b0', tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test', tests.get_uid('lr_owner')),
  ('1e000000-0000-0000-0000-0000000000b0', tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test', tests.get_uid('lr_owner')),
  ('1e000000-0000-0000-0000-0000000000e0', tests.get_uid('lr_lender_z'), 'lr_lender_z@opendealbook.test', tests.get_uid('lr_owner_2')),
  ('1e000000-0000-0000-0000-0000000000e1', tests.get_uid('lr_lender_z'), 'lr_lender_z@opendealbook.test', tests.get_uid('lr_owner_2'));
update public.lender_room_member set created_at = '2026-02-01'
where room_id = '1e000000-0000-0000-0000-0000000000a0' and user_id = tests.get_uid('lr_lender_a2');
insert into public.lender_person (user_id, name)
values
  (tests.get_uid('lr_lender_a'), 'Ann Able'),
  (tests.get_uid('lr_lender_a2'), 'Ash Two'),
  (tests.get_uid('lr_lender_b'), 'Bo Baker');

insert into public.lender_room_hidden (room_id, dr_folder_id, dr_document_id)
values
  ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f003', null),
  ('1e000000-0000-0000-0000-0000000000a0', null, '1e000000-0000-0000-0000-00000000d003');

insert into public.lender_ask (id, room_id, account_id, kind, title, return_route, created_by)
values
  ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'ask', 'A asks', null, tests.get_uid('lr_lender_a')),
  ('1e000000-0000-0000-0000-00000000a5f0', '1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'form', 'A application', 'esign', tests.get_uid('lr_lender_a')),
  ('1e000000-0000-0000-0000-00000000a5b0', '1e000000-0000-0000-0000-0000000000b0', tests.account_id('lr-acct'), 'ask', 'B asks', null, tests.get_uid('lr_lender_b')),
  ('1e000000-0000-0000-0000-00000000a5e0', '1e000000-0000-0000-0000-0000000000e0', tests.account_id('lr-acct-2'), 'ask', 'Z asks', null, tests.get_uid('lr_lender_z'));

insert into public.lender_ask_message (ask_id, author_user_id, side, body)
values
  ('1e000000-0000-0000-0000-00000000a5a0', tests.get_uid('lr_lender_a'), 'lender', 'from A'),
  ('1e000000-0000-0000-0000-00000000a5b0', tests.get_uid('lr_lender_b'), 'lender', 'from B'),
  ('1e000000-0000-0000-0000-00000000a5e0', tests.get_uid('lr_lender_z'), 'lender', 'from Z');

insert into public.lender_ask_file (ask_id, dr_document_id, role, added_by)
values
  ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00a', 'attachment', tests.get_uid('lr_lender_a')),
  ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00c', 'attachment', tests.get_uid('lr_lender_a')),
  ('1e000000-0000-0000-0000-00000000a5b0', '1e000000-0000-0000-0000-00000000d00b', 'attachment', tests.get_uid('lr_lender_b'));

insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status, editor_url, created_at)
values
  ('1e000000-0000-0000-0000-00000000a5a0', 'doc_1', '[{"name":"Sam","email":"sam@lender-a.test"}]'::jsonb, 'declined', null, '2026-01-01'),
  ('1e000000-0000-0000-0000-00000000a5a0', 'doc_2', '[{"name":"Sam","email":"sam@lender-a.test"}]'::jsonb, 'expired', null, '2026-01-02'),
  ('1e000000-0000-0000-0000-00000000a5a0', 'doc_3', '[{"name":"Sam","email":"sam@lender-a.test"}]'::jsonb, default, 'https://sign.test/d/doc_3', '2026-01-03'),
  ('1e000000-0000-0000-0000-00000000a5b0', 'doc_b', '[{"name":"Bo","email":"bo@lender-b.test"}]'::jsonb, default, null, '2026-01-04');

-- c1 is a contract of deal d1 with two versions; c2 is a contract of deal d2.
insert into public.contract (id, deal_id, account_id, type)
values
  ('1e000000-0000-0000-0000-0000000000c1', '1e000000-0000-0000-0000-0000000000d1', tests.account_id('lr-acct'), 'loi'),
  ('1e000000-0000-0000-0000-0000000000c2', '1e000000-0000-0000-0000-0000000000d2', tests.account_id('lr-acct-2'), 'loi');
insert into public.contract_version (id, contract_id, account_id, version, source, party)
values
  ('1e000000-0000-0000-0000-00000000c101', '1e000000-0000-0000-0000-0000000000c1', tests.account_id('lr-acct'), 1, 'upload', 'buyer'),
  ('1e000000-0000-0000-0000-00000000c102', '1e000000-0000-0000-0000-0000000000c1', tests.account_id('lr-acct'), 2, 'upload', 'buyer'),
  ('1e000000-0000-0000-0000-00000000c201', '1e000000-0000-0000-0000-0000000000c2', tests.account_id('lr-acct-2'), 1, 'upload', 'buyer');

insert into public.lender_room_activity (room_id, account_id, user_id, side, action, dr_document_id, dr_folder_id)
values
  ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_a'), 'lender', 'room_opened', null, null),
  ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_a'), 'lender', 'document_previewed', '1e000000-0000-0000-0000-00000000d00c', null),
  ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_a'), 'lender', 'folder_opened', null, '1e000000-0000-0000-0000-00000000f0a1'),
  ('1e000000-0000-0000-0000-0000000000b0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'room_opened', null, null),
  ('1e000000-0000-0000-0000-0000000000e0', tests.account_id('lr-acct-2'), tests.get_uid('lr_lender_z'), 'lender', 'room_opened', null, null);

insert into public.lender_oversize_file (account_id, dr_folder_id, name, size_bytes)
values
  (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-00000000f002', 'huge-model.xlsx', 400000000),
  (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-00000000f00b', 'huge-for-b.mov', 500000000),
  (tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-00000000f201', 'huge-for-z.bin', 600000000);

-- ---- Shapes the tables refuse, whoever writes ----
select throws_ok(
  $$ insert into public.lender_ask (room_id, account_id, kind, title)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'form', 'no route') $$,
  '23514', null, 'a form ask must name its return route'
);
select throws_ok(
  $$ insert into public.lender_ask (room_id, account_id, kind, title, return_route)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'ask', 'stray route', 'upload') $$,
  '23514', null, 'a plain ask has no return route'
);
select throws_ok(
  $$ insert into public.lender_ask (room_id, account_id, kind, title)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct-2'), 'ask', 'misfiled') $$,
  '23503', null, 'an ask belongs to its room''s account and no other'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct-2'), 'internal', 'room_opened') $$,
  '23503', null, 'activity belongs to its room''s account and no other'
);
select throws_ok(
  $$ insert into public.lender_room_hidden (room_id, dr_folder_id, dr_document_id)
     values ('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-00000000f002', '1e000000-0000-0000-0000-00000000d002') $$,
  '23514', null, 'one hide cannot cover both a folder and a document'
);
select throws_ok(
  $$ insert into public.lender_room_hidden (room_id) values ('1e000000-0000-0000-0000-0000000000b0') $$,
  '23514', null, 'a hide must name a folder or a document'
);
select throws_ok(
  $$ insert into public.lender_room_hidden (room_id, dr_folder_id)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f003') $$,
  '23505', null, 'a folder is hidden at most once per room'
);
select throws_ok(
  $$ insert into public.lender_room_hidden (room_id, dr_document_id)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d003') $$,
  '23505', null, 'a document is hidden at most once per room'
);
select throws_ok(
  $$ insert into public.lender_room_member (room_id, user_id, email)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test') $$,
  '23505', null, 'a person joins a room at most once'
);
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, brand_domain, name, private_folder_id)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', 'lender-a.test', 'Lender A again', '1e000000-0000-0000-0000-00000000f00c') $$,
  '23505', null, 'a deal has at most one room per lender website'
);
select lives_ok(
  $$ insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id)
     values ('1e000000-0000-0000-0000-0000000000c3', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d3', 'lender-a.test', 'Lender A on another deal', '1e000000-0000-0000-0000-00000000f301') $$,
  'one lender website has a room on each of two deals'
);
select lives_ok(
  $$ insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id)
     values ('1e000000-0000-0000-0000-0000000000c0', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', null, 'No website', '1e000000-0000-0000-0000-00000000f00c') $$,
  'a deal has several rooms that name no lender website'
);
delete from public.lender_room
where id in ('1e000000-0000-0000-0000-0000000000c3', '1e000000-0000-0000-0000-0000000000c0');
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_3', '[]'::jsonb, 'declined') $$,
  '23505', null, 'a Documenso document is the envelope of at most one form signature'
);
insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_open', '[]'::jsonb);
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_second', '[]'::jsonb, 'draft') $$,
  '23505', null, 'a form with a draft signature request takes no second draft'
);
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_second', '[]'::jsonb, 'sent') $$,
  '23505', null, 'a form with a draft signature request takes no sent one beside it'
);
update public.lender_form_signature set status = 'sent' where documenso_document_id = 'doc_open';
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_second', '[]'::jsonb, 'draft') $$,
  '23505', null, 'a form with a signature request out takes no draft beside it'
);
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_second', '[]'::jsonb, 'sent') $$,
  '23505', null, 'a form with a signature request out takes no second one out'
);
update public.lender_form_signature set status = 'declined' where documenso_document_id = 'doc_open';
select lives_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_after_declined', '[]'::jsonb) $$,
  'a form takes a new signature request once the earlier one is declined'
);
update public.lender_form_signature set status = 'expired' where documenso_document_id = 'doc_after_declined';
select lives_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_after_expired', '[]'::jsonb) $$,
  'a form takes a new signature request once the earlier one is expired'
);
update public.lender_form_signature set status = 'completed' where documenso_document_id = 'doc_after_expired';
select lives_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_after_completed', '[]'::jsonb) $$,
  'a form takes a new signature request once the earlier one is completed'
);
update public.lender_form_signature set status = 'cancelled' where documenso_document_id = 'doc_after_completed';
select lives_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_after_cancelled', '[]'::jsonb) $$,
  'a form takes a new signature request once the earlier one is cancelled'
);
delete from public.lender_form_signature where ask_id = '1e000000-0000-0000-0000-00000000a5f0';

-- ---- The team's Lenders section: rooms and contacts across its deals ----
-- Room three is on deal d3, which has no firm. Bo opened three requests there:
-- one waiting on the team, one form out for signature, one answered.
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d3', 'Lender Three', '1e000000-0000-0000-0000-00000000f301');
insert into public.lender_room_member (room_id, user_id, email, invited_by, created_at)
values
  ('1e000000-0000-0000-0000-0000000003a0', tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test', tests.get_uid('lr_owner'), '2026-03-01'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test', tests.get_uid('lr_owner'), '2026-03-01'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test', tests.get_uid('lr_owner'), '2026-03-01');
delete from public.lender_room_member where room_id = '1e000000-0000-0000-0000-0000000003a0' and user_id = tests.get_uid('lr_lender_a2');
insert into public.lender_room_activity (room_id, account_id, user_id, side, action, dr_document_id, created_at)
values
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'room_opened', null, '2026-03-02'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'room_opened', null, '2026-03-05'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'document_previewed', '1e000000-0000-0000-0000-00000000d3d1', '2026-03-02'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'document_previewed', '1e000000-0000-0000-0000-00000000d3d1', '2026-03-03'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'document_previewed', '1e000000-0000-0000-0000-00000000d3d2', '2026-03-03'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'document_downloaded', '1e000000-0000-0000-0000-00000000d3d1', '2026-03-03'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'document_downloaded', '1e000000-0000-0000-0000-00000000d3d1', '2026-03-04'),
  ('1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), tests.get_uid('lr_lender_b'), 'lender', 'zip_downloaded', null, '2026-03-04');
insert into public.lender_ask (id, room_id, account_id, kind, title, return_route, status, created_by, created_at)
values
  ('1e000000-0000-0000-0000-000000003a51', '1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), 'ask', 'Waiting on the team', null, 'open', tests.get_uid('lr_lender_b'), '2026-03-04'),
  ('1e000000-0000-0000-0000-000000003a52', '1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), 'form', 'Out for signature', 'esign', 'open', tests.get_uid('lr_lender_b'), '2026-03-04'),
  ('1e000000-0000-0000-0000-000000003a53', '1e000000-0000-0000-0000-0000000003a0', tests.account_id('lr-acct'), 'ask', 'Answered', null, 'answered', tests.get_uid('lr_lender_b'), '2026-03-04');
insert into public.lender_form_signature (ask_id, documenso_document_id, signers, status, created_at)
values
  ('1e000000-0000-0000-0000-000000003a52', 'doc_3a_old', '[]'::jsonb, 'declined', '2026-03-01'),
  ('1e000000-0000-0000-0000-000000003a52', 'doc_3a_new', '[]'::jsonb, 'sent', '2026-03-03');
insert into public.lender_ask_message (ask_id, author_user_id, side, body, created_at)
values ('1e000000-0000-0000-0000-000000003a51', tests.get_uid('lr_lender_b'), 'lender', 'any news?', '2026-03-06');
insert into public.lender_upload (room_id, deal_id, folder_id, name, storage_path, uploaded_by, registered_at)
values ('1e000000-0000-0000-0000-0000000003a0', '1e000000-0000-0000-0000-0000000000d3', '1e000000-0000-0000-0000-00000000f301', 'statement.pdf', 'deal/x/lender-three-statement.pdf', tests.get_uid('lr_lender_b'), '2026-03-07');

select tests.login_as('lr_owner');
select set_eq(
  $$ select room_id from public.team_lender_rooms(tests.account_id('lr-acct')) $$,
  array['1e000000-0000-0000-0000-0000000000a0'::uuid, '1e000000-0000-0000-0000-0000000000b0'::uuid, '1e000000-0000-0000-0000-0000000003a0'::uuid],
  'a team manager gets every lender room on the team''s deals'
);
select results_eq(
  $$ select deal_name, deal_description, room_name, status::text, is_open, member_count, requests_waiting_on_team, last_lender_activity_at
     from public.team_lender_rooms(tests.account_id('lr-acct')) where room_id = '1e000000-0000-0000-0000-0000000003a0' $$,
  $$ values ('Fixture business', 'Packageless deal', 'Lender Three', 'invited', true, 2, 1, '2026-03-07'::timestamptz) $$,
  'a room comes with its deal, its members, what waits on the team and when a lender last did anything'
);
select results_eq(
  $$ select deal_name, brand_domain, brand_name, brand_logo_path
     from public.team_lender_rooms(tests.account_id('lr-acct')) where room_id = '1e000000-0000-0000-0000-0000000000a0' $$,
  $$ values ('Target Co', 'lender-a.test', 'Lender A Bank', 'lender-a.test/logo.png') $$,
  'a room comes with its deal''s name and its lender''s brand'
);
select set_eq(
  $$ select room_id, user_id, removed_at is not null from public.team_lender_contacts(tests.account_id('lr-acct')) $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a'), false),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a2'), false),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_ab'), false),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_b'), false),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_ab'), false),
       ('1e000000-0000-0000-0000-0000000003a0'::uuid, tests.get_uid('lr_lender_ab'), false),
       ('1e000000-0000-0000-0000-0000000003a0'::uuid, tests.get_uid('lr_lender_b'), false),
       ('1e000000-0000-0000-0000-0000000003a0'::uuid, tests.get_uid('lr_lender_a2'), true) $$,
  'a team manager gets each lender once per room across the team''s deals, removed people included'
);
select results_eq(
  $$ select email, name, has_signed_in, deal_name, room_status::text, invited_by, invited_at, removed_at,
       first_visit_at, last_visit_at, files_viewed, downloads, requests_opened,
       requests_waiting_on_team, requests_waiting_on_lender, forms_out_for_signature
     from public.team_lender_contacts(tests.account_id('lr-acct'))
     where room_id = '1e000000-0000-0000-0000-0000000003a0' and user_id = tests.get_uid('lr_lender_b') $$,
  $$ values ('lr_lender_b@opendealbook.test', 'Bo Baker', false, 'Fixture business', 'invited', tests.get_uid('lr_owner'), '2026-03-01'::timestamptz, null::timestamptz,
       '2026-03-02'::timestamptz, '2026-03-05'::timestamptz, 2, 2, 3, 1, 1, 1) $$,
  'a contact comes with their visits, files viewed, downloads, requests and what waits on whom in that room'
);
select results_eq(
  $$ select invited_by, invited_at, removed_at from public.team_lender_contacts(tests.account_id('lr-acct'))
     where room_id = '1e000000-0000-0000-0000-0000000003a0' and user_id = tests.get_uid('lr_lender_a2') $$,
  $$ values (null::uuid, '2026-03-01'::timestamptz, now()) $$,
  'a removed contact comes with when they were invited and when they were removed'
);
select results_eq(
  $$ select user_id, requests_opened, requests_waiting_on_team, requests_waiting_on_lender, forms_out_for_signature
     from public.team_lender_contacts(tests.account_id('lr-acct'))
     where room_id = '1e000000-0000-0000-0000-0000000003a0' and removed_at is null
     order by requests_opened $$,
  $$ values (tests.get_uid('lr_lender_ab'), 0, 0, 0, 0), (tests.get_uid('lr_lender_b'), 3, 1, 1, 1) $$,
  'each contact''s waiting and signature counts cover only the requests that person opened'
);
select results_eq(
  $$ select deal_description, invited_by_email, invited_by_name, removed_at is not null
     from public.team_lender_contacts(tests.account_id('lr-acct'))
     where room_id = '1e000000-0000-0000-0000-0000000003a0'
     order by removed_at is not null $$,
  $$ values
       ('Packageless deal', 'lr_owner@opendealbook.test', 'lr_owner', false),
       ('Packageless deal', 'lr_owner@opendealbook.test', 'lr_owner', false),
       ('Packageless deal', null::text, null::text, true) $$,
  'a contact comes with the deal''s description and who invited them, by email and name, unless that is not on record'
);

select tests.login_as('lr_member');
select is_empty($$ select 1 from public.team_lender_rooms(tests.account_id('lr-acct')) $$, 'a team member who does not manage deals gets no rooms');
select is_empty($$ select 1 from public.team_lender_contacts(tests.account_id('lr-acct')) $$, 'a team member who does not manage deals gets no contacts');
select tests.login_as('lr_owner_2');
select is_empty($$ select 1 from public.team_lender_rooms(tests.account_id('lr-acct')) $$, 'another team''s manager gets none of this team''s rooms');
select is_empty($$ select 1 from public.team_lender_contacts(tests.account_id('lr-acct')) $$, 'another team''s manager gets none of this team''s contacts');
select tests.login_as('lr_side_dealer');
select is_empty(
  $$ select 1 from public.team_lender_rooms(tests.account_id('lr-acct'))
     union all select 1 from public.team_lender_contacts(tests.account_id('lr-acct')) $$,
  'managing deals on another team gets nothing for this team'
);
select tests.login_as('lr_lender_b');
select is_empty(
  $$ select 1 from public.team_lender_rooms(tests.account_id('lr-acct'))
     union all select 1 from public.team_lender_contacts(tests.account_id('lr-acct')) $$,
  'a lender gets nothing from the team''s Lenders section'
);

reset role;
delete from public.lender_room where id = '1e000000-0000-0000-0000-0000000003a0';

-- ---- Signature requests are written by the server alone ----
select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers, editor_url)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_4', '[{"name":"Sam","email":"sam@lender-a.test"}]'::jsonb, 'https://sign.test/d/doc_4') $$,
  'the server records a signature request'
);
select isnt_empty(
  $$ update public.lender_form_signature set status = 'sent' where documenso_document_id = 'doc_4' returning 1 $$,
  'the server changes where a signature request stands'
);
select isnt_empty(
  $$ delete from public.lender_form_signature where documenso_document_id = 'doc_4' returning 1 $$,
  'the server removes a signature request'
);

-- ---- A contract version records the signing document created for it ----
select tests.login_as_service_role();
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c101","signing_document_id":"sd_1"}'::jsonb, null, 'service') $$,
  'a signature request for a version of the deal''s own contract is appended'
);
select is(
  (select signing_document_id from public.contract_version where id = '1e000000-0000-0000-0000-00000000c101'),
  'sd_1',
  'a signature request records its signing document on the contract version'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c102","signing_document_id":"sd_1"}'::jsonb, null, 'service') $$,
  '23505', null, 'a second contract version cannot take a signing document already recorded'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c2', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c201","signing_document_id":"sd_2"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c201 is not a version of contract 1e000000-0000-0000-0000-0000000000c2 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signature request cannot reach another deal''s contract version'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c201","signing_document_id":"sd_3"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c201 is not a version of contract 1e000000-0000-0000-0000-0000000000c1 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signature request cannot name a version of another contract'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c1ff","signing_document_id":"sd_4"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c1ff is not a version of contract 1e000000-0000-0000-0000-0000000000c1 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signature request cannot name a version that does not exist'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_requested',
       '{"version_id":"1e000000-0000-0000-0000-00000000c102"}'::jsonb, null, 'service') $$,
  'P0001', 'signature request for contract version 1e000000-0000-0000-0000-00000000c102 names no signing document',
  'a signature request must name the signing document created for it'
);
select is_empty(
  $$ select 1 from public.contract_version
     where id in ('1e000000-0000-0000-0000-00000000c102', '1e000000-0000-0000-0000-00000000c201') and signing_document_id is not null $$,
  'a refused signature request records nothing on any contract version'
);
select is(
  (select signing_status from public.contract_version where id = '1e000000-0000-0000-0000-00000000c101'),
  'draft',
  'a signature request starts the contract version''s signing as a draft'
);
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c101","status":"declined"}'::jsonb, null, 'service') $$,
  'a signing status change for a version of the deal''s own contract is appended'
);
select is(
  (select signing_status from public.contract_version where id = '1e000000-0000-0000-0000-00000000c101'),
  'declined',
  'a signing status change is recorded on the contract version'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c2', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c201","status":"completed"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c201 is not a version of contract 1e000000-0000-0000-0000-0000000000c2 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signing status change cannot reach another deal''s contract version'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c201","status":"completed"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c201 is not a version of contract 1e000000-0000-0000-0000-0000000000c1 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signing status change cannot name a version of another contract'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c1ff","status":"completed"}'::jsonb, null, 'service') $$,
  'P0001', 'contract version 1e000000-0000-0000-0000-00000000c1ff is not a version of contract 1e000000-0000-0000-0000-0000000000c1 in deal 1e000000-0000-0000-0000-0000000000d1',
  'a signing status change cannot name a version that does not exist'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c101","status":"cancelled"}'::jsonb, null, 'service') $$,
  'P0001', 'cancelled is not a signing status of a contract version',
  'a contract version takes none but the five signing statuses'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'contract',
       '1e000000-0000-0000-0000-0000000000c1', 'contract.signature_status_changed',
       '{"version_id":"1e000000-0000-0000-0000-00000000c101"}'::jsonb, null, 'service') $$,
  'P0001', '<NULL> is not a signing status of a contract version',
  'a signing status change must say the status'
);
select is_empty(
  $$ select 1 from public.contract_version
     where id in ('1e000000-0000-0000-0000-00000000c102', '1e000000-0000-0000-0000-00000000c201') and signing_status is not null $$,
  'a refused signing status change records nothing on any contract version'
);

-- ---- Who to tell about a document: the relay asks with the service role ----
select tests.login_as_service_role();

select set_eq(
  $$ select room_id, user_id, email from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d001') $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test') $$,
  'a master document reaches the members of every open room on its deal, and no other deal''s rooms'
);
select set_eq(
  $$ select room_id, user_id, email from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d003') $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test') $$,
  'a document hidden from room A reaches room B members only'
);
select set_eq(
  $$ select room_id, user_id, email from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d103') $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test') $$,
  'a later version of a file hidden from room A reaches room B members only'
);
select set_eq(
  $$ select room_id, user_id, email from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d00a') $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000a0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test') $$,
  'a room A private document reaches room A members only'
);
select is_empty(
  $$ select 1 from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d00e') $$,
  'a removed document reaches nobody'
);
select is_empty(
  $$ select 1 from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d0ff') $$,
  'a document outside the master package and every private folder reaches nobody'
);

-- ---- Which of some documents one person can open, and in which room ----
select results_eq(
  $$ select document_id, name, room_id, room_name
     from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array['1e000000-0000-0000-0000-00000000d001'::uuid]) $$,
  $$ values ('1e000000-0000-0000-0000-00000000d001'::uuid, 'cim.pdf', '1e000000-0000-0000-0000-0000000000a0'::uuid, 'Lender A') $$,
  'a master document a person''s room shows comes back with its name and that room'
);
select is_empty(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array['1e000000-0000-0000-0000-00000000d003'::uuid]) $$,
  'a document hidden from a person''s room does not come back'
);
select is_empty(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array['1e000000-0000-0000-0000-00000000d00b'::uuid]) $$,
  'another room''s private document does not come back'
);
select is_empty(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array['1e000000-0000-0000-0000-00000000d00e'::uuid]) $$,
  'a removed document does not come back'
);
select set_eq(
  $$ select document_id, room_id, room_name
     from public.lender_visible_documents(tests.get_uid('lr_lender_ab'), array[
       '1e000000-0000-0000-0000-00000000d001'::uuid,
       '1e000000-0000-0000-0000-00000000d003'::uuid,
       '1e000000-0000-0000-0000-00000000d0ff'::uuid]) $$,
  $$ values
       ('1e000000-0000-0000-0000-00000000d001'::uuid, '1e000000-0000-0000-0000-0000000000a0'::uuid, 'Lender A'),
       ('1e000000-0000-0000-0000-00000000d003'::uuid, '1e000000-0000-0000-0000-0000000000b0'::uuid, 'Lender B') $$,
  'a person in two rooms gets each document once, under the lowest room that shows it'
);
reset role;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values ('1e000000-0000-0000-0000-00000000d0f2', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f002', 'cim.pdf', 'deal/x/financials-cim.pdf');
select tests.login_as_service_role();
select set_eq(
  $$ select name, folder_id
     from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array[
       '1e000000-0000-0000-0000-00000000d001'::uuid,
       '1e000000-0000-0000-0000-00000000d0f2'::uuid]) $$,
  $$ values
       ('cim.pdf', '1e000000-0000-0000-0000-00000000f001'::uuid),
       ('cim.pdf', '1e000000-0000-0000-0000-00000000f002'::uuid) $$,
  'two documents of one name in different folders come back with their own folders'
);
reset role;
delete from public.dr_document where id = '1e000000-0000-0000-0000-00000000d0f2';
select tests.login_as_service_role();
insert into public.lender_room_hidden (room_id, dr_document_id)
values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d002');
select is_empty(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array['1e000000-0000-0000-0000-00000000d002'::uuid]) $$,
  'a document hidden after the fact stops coming back'
);
delete from public.lender_room_hidden
where room_id = '1e000000-0000-0000-0000-0000000000a0' and dr_document_id = '1e000000-0000-0000-0000-00000000d002';

-- ---- How many folders a room's own space holds ----
reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('1e000000-0000-0000-0000-00000000f0a2', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0a1', 'Room A sub sub');
select tests.login_as_service_role();
select is(
  public.lender_room_folder_count('1e000000-0000-0000-0000-0000000000a0'),
  2,
  'a room''s folder count takes in nested folders and leaves out its own root, the master package and every other room'
);
select is(
  public.lender_room_folder_count('1e000000-0000-0000-0000-0000000000b0'),
  0,
  'a room with nothing under its own folder counts no folders'
);
reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('1e000000-0000-0000-0000-00000000f0f1', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0ff', 'Under diligence');
select tests.login_as_service_role();
select is(
  public.lender_room_folder_count('1e000000-0000-0000-0000-0000000000e1'),
  0,
  'a room whose own folder belongs to another deal counts none of that deal''s folders'
);
reset role;
delete from public.dr_folder where id = '1e000000-0000-0000-0000-00000000f0f1';
select tests.login_as_service_role();
select is(
  public.lender_package_folder_count('1e000000-0000-0000-0000-0000000000d1'),
  3,
  'a deal''s package folder count takes in nested folders and leaves out the master folder itself'
);
select is(
  public.lender_package_folder_count('1e000000-0000-0000-0000-0000000000d2'),
  0,
  'another deal''s package counts none of this deal''s folders'
);
reset role;
delete from public.dr_folder where id = '1e000000-0000-0000-0000-00000000f0a2';
select tests.login_as_service_role();

-- ---- Uploads the server issued a storage key for: the service role's own record ----
select lives_ok(
  $$ insert into public.lender_upload (id, room_id, deal_id, folder_id, name, storage_path, uploaded_by)
     values
       ('1e000000-0000-0000-0000-000000000b01', '1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00a', 'application.pdf', 'deal/x/uploads/application.pdf', tests.get_uid('lr_lender_a')),
       ('1e000000-0000-0000-0000-000000000b02', '1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00a', 'abandoned.pdf', 'deal/x/uploads/abandoned.pdf', tests.get_uid('lr_lender_a')) $$,
  'the service role records an upload it issued a storage key for'
);
select results_eq(
  $$ select keep_as_zip, registered_at, document_ids from public.lender_upload
     where id = '1e000000-0000-0000-0000-000000000b01' $$,
  $$ values (null::boolean, null::timestamptz, null::uuid[]) $$,
  'an issued upload is not yet registered'
);
select throws_ok(
  $$ insert into public.lender_upload (room_id, deal_id, folder_id, name, storage_path, uploaded_by)
     values ('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00b', 'other.pdf', 'deal/x/uploads/application.pdf', tests.get_uid('lr_lender_b')) $$,
  '23505', null, 'a storage key is issued to one upload only'
);
select results_eq(
  $$ update public.lender_upload
     set keep_as_zip = false, registered_at = now(), document_ids = array['1e000000-0000-0000-0000-00000000d00a'::uuid]
     where id = '1e000000-0000-0000-0000-000000000b01'
     returning keep_as_zip, registered_at, document_ids $$,
  $$ values (false, now(), array['1e000000-0000-0000-0000-00000000d00a'::uuid]) $$,
  'the service role registers an upload against the documents it became'
);
select isnt_empty(
  $$ delete from public.lender_upload where id = '1e000000-0000-0000-0000-000000000b02' returning 1 $$,
  'the service role removes an upload record'
);
select lives_ok(
  $$ insert into public.lender_upload (room_id, deal_id, folder_id, name, storage_path, uploaded_by)
     values (null, '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f002', 'package.pdf', 'deal/x/uploads/package.pdf', tests.get_uid('lr_owner')) $$,
  'the service role records a team upload into the lender package, which belongs to no room'
);
select throws_ok(
  $$ insert into public.lender_upload (room_id, deal_id, folder_id, name, storage_path, uploaded_by)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-0000000000d2', '1e000000-0000-0000-0000-00000000f00a', 'astray.pdf', 'deal/x/uploads/astray.pdf', tests.get_uid('lr_lender_a')) $$,
  '42501', 'rows cannot link across teams', 'a room upload names the deal its room is on and no other'
);
select throws_ok(
  $$ insert into public.lender_upload (room_id, folder_id, name, storage_path, uploaded_by)
     values (null, '1e000000-0000-0000-0000-00000000f002', 'nowhere.pdf', 'deal/x/uploads/nowhere.pdf', tests.get_uid('lr_owner')) $$,
  '23502', null, 'every upload names its deal'
);

-- ---- Rate limit: one pass per key per window ----
select ok(
  public.lender_rate_limit_pass('sign-in:sam@lender-a.test', 60),
  'the first call for a key passes'
);
update public.lender_rate_limit set last_at = now() - interval '30 seconds' where key = 'sign-in:sam@lender-a.test';
select ok(
  not public.lender_rate_limit_pass('sign-in:sam@lender-a.test', 60),
  'a second call inside the window does not pass'
);
select is(
  (select last_at from public.lender_rate_limit where key = 'sign-in:sam@lender-a.test'),
  now() - interval '30 seconds',
  'a refused call does not move the time'
);
select ok(
  public.lender_rate_limit_pass('sign-in:bo@lender-b.test', 60),
  'another key passes while the first is still inside its window'
);
select ok(
  public.lender_rate_limit_pass('sign-in:sam@lender-a.test', 30),
  'a call passes once the window has gone by'
);
select is(
  (select last_at from public.lender_rate_limit where key = 'sign-in:sam@lender-a.test'),
  now(),
  'a call that passes records its own time'
);

select is_empty(
  $$ select t, p
     from unnest(array[
       'lender_brand', 'lender_package', 'lender_room', 'lender_room_member', 'lender_room_hidden',
       'lender_ask', 'lender_ask_message', 'lender_ask_file', 'lender_form_signature',
       'lender_room_activity', 'lender_oversize_file', 'lender_upload', 'lender_rate_limit'
     ]) t
     cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger', 'maintain']) p
     where has_table_privilege('anon', 'public.' || t, p) $$,
  'a visitor who is not signed in holds no privilege of any kind on any lender table'
);

-- ---- Lender A: what a member of open room A sees ----
select tests.login_as('lr_lender_a');

select is_empty('select 1 from public.lender_room', 'a lender sees no room table rows, so status stays private');
select is_empty('select 1 from public.deal', 'a lender sees no deal rows');
select results_eq(
  $$ select * from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values (
    '1e000000-0000-0000-0000-0000000000a0'::uuid,
    '1e000000-0000-0000-0000-0000000000d1'::uuid,
    'Lender A',
    'Welcome',
    now() + interval '60 days',
    true,
    '1e000000-0000-0000-0000-00000000f00a'::uuid,
    '1e000000-0000-0000-0000-00000000f001'::uuid,
    'Lender A Bank',
    'lender-a.test/logo.png',
    'Target Co',
    null::date,
    null::date,
    null::text,
    'LR Acct',
    null::numeric,
    null::text,
    null::numeric,
    null::numeric
  ) $$,
  'a member gets their room with its brand, folders, deal name, and buyer team, and nothing about status or people'
);
select is_empty(
  $$ select 1 from public.lender_room_view('1e000000-0000-0000-0000-0000000000b0') $$,
  'a member of room A gets nothing for room B'
);
select set_eq(
  'select id from public.my_lender_rooms()',
  array['1e000000-0000-0000-0000-0000000000a0'::uuid],
  'a member of room A lists room A alone'
);
select set_eq(
  'select id from public.dr_folder',
  array[
    '1e000000-0000-0000-0000-00000000f001'::uuid,
    '1e000000-0000-0000-0000-00000000f002'::uuid,
    '1e000000-0000-0000-0000-00000000f00a'::uuid,
    '1e000000-0000-0000-0000-00000000f0a1'::uuid
  ],
  'lender A sees the master folders not hidden from room A plus the room A folder tree, nothing else'
);
select set_eq(
  'select id from public.dr_document',
  array[
    '1e000000-0000-0000-0000-00000000d001'::uuid,
    '1e000000-0000-0000-0000-00000000d002'::uuid,
    '1e000000-0000-0000-0000-00000000d00a'::uuid,
    '1e000000-0000-0000-0000-00000000d00c'::uuid
  ],
  'lender A sees master documents not hidden from room A plus room A documents: no version of a hidden file, no removed file'
);
select set_eq(
  'select id from public.lender_ask',
  array['1e000000-0000-0000-0000-00000000a5a0'::uuid, '1e000000-0000-0000-0000-00000000a5f0'::uuid],
  'lender A sees room A asks only'
);
select set_eq(
  'select body from public.lender_ask_message',
  array['from A'],
  'lender A sees room A messages only'
);
select set_eq(
  'select dr_document_id from public.lender_ask_file',
  array['1e000000-0000-0000-0000-00000000d00a'::uuid, '1e000000-0000-0000-0000-00000000d00c'::uuid],
  'lender A sees room A ask files only'
);
select bag_eq(
  'select user_id from public.lender_room_member',
  array[tests.get_uid('lr_lender_a'), tests.get_uid('lr_lender_a2'), tests.get_uid('lr_lender_ab')],
  'lender A sees their room A colleagues and no membership of any other room'
);
select results_eq(
  $$ select status::text, created_at from public.lender_form_signature_status('1e000000-0000-0000-0000-00000000a5a0') $$,
  $$ values ('draft', '2026-01-03'::timestamptz), ('expired', '2026-01-02'::timestamptz), ('declined', '2026-01-01'::timestamptz) $$,
  'lender A gets where each signature request on a room A form stands, newest first'
);
select is_empty(
  $$ select 1 from public.lender_form_signature_status('1e000000-0000-0000-0000-00000000a5b0') $$,
  'lender A gets nothing about the signature requests of room B'
);
select is_empty(
  'select 1 from public.lender_form_signature',
  'a member reads no signature request directly, so no signer, signing document or editor link'
);
select set_eq(
  'select name from public.lender_oversize_file',
  array['huge-model.xlsx'],
  'lender A sees the too-large placeholder in a folder they can open and not the one in room B'
);
select is_empty('select 1 from public.lender_room_activity', 'a lender sees no activity');
select is_empty('select 1 from public.lender_room_hidden', 'a lender cannot tell what is hidden from them');
select is_empty('select 1 from public.lender_package', 'a lender sees no package row');
select throws_ok('select 1 from public.lender_brand', '42501', null, 'a lender cannot read the brand cache');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'lender-brand' $$,
  'a lender cannot read logo objects'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'data-room' $$,
  'a lender has no storage access to the data-room bucket'
);
select ok(
  public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d00a'),
  'a member can ask whether their own room shows a document'
);
select ok(
  not public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-00000000d00b'),
  'a member of room A learns nothing about what room B shows'
);
select ok(
  public.lender_room_shows_folder('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f002'),
  'a member can ask whether their own room shows a folder'
);
select ok(
  not public.lender_room_shows_folder('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-00000000f00b'),
  'a member of room A learns nothing about which folders room B shows'
);
select is_empty(
  $$ select 1 from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') $$,
  'a member cannot list the people of their room'
);
select throws_ok(
  $$ select 1 from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d001') $$,
  '42501', null, 'a member cannot ask who is told about a document'
);
select throws_ok(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_b'), array['1e000000-0000-0000-0000-00000000d00b'::uuid]) $$,
  '42501', null, 'a signed-in user cannot ask what another person can open'
);
select throws_ok(
  $$ select public.check_dr_document_event('1e000000-0000-0000-0000-0000000000d1',
       '1e000000-0000-0000-0000-00000000d001', 'dr_document.removed', '{}'::jsonb, null) $$,
  '42501', null, 'a signed-in user cannot run the document event check on its own'
);
select throws_ok(
  $$ select public.lender_room_folder_count('1e000000-0000-0000-0000-0000000000a0') $$,
  '42501', null, 'a signed-in user cannot count the folders of a room'
);
select throws_ok(
  $$ select public.lender_package_folder_count('1e000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'a signed-in user cannot count the folders of a lender package'
);
select throws_ok('select 1 from public.lender_upload', '42501', null, 'a member cannot read the upload records of their own room');
select throws_ok(
  $$ insert into public.lender_upload (room_id, folder_id, name, storage_path, uploaded_by)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f00a', 'mine.pdf', 'deal/x/tax-return.pdf', tests.get_uid('lr_lender_a')) $$,
  '42501', null, 'a member cannot issue themselves a storage key'
);
select throws_ok(
  $$ update public.lender_upload set storage_path = 'deal/x/tax-return.pdf' $$,
  '42501', null, 'a member cannot repoint an upload at another storage key'
);
select throws_ok(
  $$ delete from public.lender_upload $$,
  '42501', null, 'a member cannot remove an upload record'
);
select throws_ok('select 1 from public.lender_rate_limit', '42501', null, 'a signed-in user cannot read the rate limit table');
select throws_ok(
  $$ select public.lender_rate_limit_pass('sign-in:sam@lender-a.test', 0) $$,
  '42501', null, 'a signed-in user cannot spend or reset a rate limit'
);

select is(
  public.lender_open_room_deal_ids(),
  array['1e000000-0000-0000-0000-0000000000d1'::uuid],
  'a member''s open rooms come down to their deals'
);

select set_eq(
  'select name from public.lender_person',
  array['Ann Able', 'Ash Two'],
  'a member reads their own name and the names of people in their open room, and no one else''s'
);

-- ---- Lender A: read-only ----
select throws_ok(
  $$ insert into public.lender_ask (room_id, account_id, kind, title)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'ask', 'direct') $$,
  '42501', null, 'a member cannot open an ask in their own room directly'
);
select throws_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', 'lender', 'direct') $$,
  '42501', null, 'a member cannot post a message on their own ask directly'
);
select throws_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', 'internal', 'posing as the team') $$,
  '42501', null, 'a member cannot post as the team'
);
select throws_ok(
  $$ insert into public.lender_ask_file (ask_id, dr_document_id, role)
     values ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00a', 'attachment') $$,
  '42501', null, 'a member cannot attach a file to their own ask directly'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'lender', 'room_opened') $$,
  '42501', null, 'a member cannot record activity in their own room directly'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'internal', 'room_opened') $$,
  '42501', null, 'a member cannot record activity as the team'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action, dr_folder_id)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'lender', 'folder_created', '1e000000-0000-0000-0000-00000000f00a') $$,
  '42501', null, 'a member cannot record a folder they created directly'
);
select is_empty(
  $$ update public.lender_ask set title = 'A asks again' where id = '1e000000-0000-0000-0000-00000000a5a0' returning 1 $$,
  'a member cannot change an ask'
);
select throws_ok(
  $$ delete from public.lender_ask where id = '1e000000-0000-0000-0000-00000000a5a0' $$,
  '42501', null, 'a member cannot remove an ask'
);
select throws_ok(
  $$ update public.lender_ask_message set body = 'edited' $$,
  '42501', null, 'a member cannot edit a message'
);
select throws_ok(
  $$ delete from public.lender_ask_file $$,
  '42501', null, 'a member cannot detach an ask file'
);
select is_empty(
  $$ update public.lender_room set name = 'hijacked' where id = '1e000000-0000-0000-0000-0000000000a0' returning 1 $$,
  'a member cannot change their room'
);
select throws_ok(
  $$ insert into public.lender_oversize_file (account_id, dr_folder_id, name, size_bytes)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-00000000f00a', 'fake.bin', 1) $$,
  '42501', null, 'a member cannot plant a too-large placeholder'
);
select throws_ok(
  $$ insert into public.lender_brand (domain, name) values ('evil.test', 'Evil') $$,
  '42501', null, 'a member cannot write the brand cache'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('lender-brand', 'evil.test/logo.png') $$,
  '42501', null, 'a member cannot write logo objects'
);
select throws_ok(
  $$ insert into public.dr_document (account_id, deal_id, folder_id, name, storage_path)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f00a', 'direct.pdf', 'deal/x/direct.pdf') $$,
  '42501', null, 'a member cannot add a document directly'
);
select throws_ok(
  $$ update public.dr_document set name = 'renamed.pdf' $$,
  '42501', null, 'a member cannot rename a document directly'
);
select throws_ok(
  $$ delete from public.dr_document $$,
  '42501', null, 'a member cannot delete a document directly'
);

-- ---- Lender A: a personal account holds no deal work ----
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, name, private_folder_id)
     values (
       (select id from public.accounts where primary_owner_user_id = tests.get_uid('lr_lender_a') and is_personal_account),
       '1e000000-0000-0000-0000-0000000000d1', 'Mine now', '1e000000-0000-0000-0000-00000000f00a') $$,
  '23514', null, 'a lender cannot create a room on the deal by naming their personal account'
);
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, name, private_folder_id)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', 'Mine now', '1e000000-0000-0000-0000-00000000f00a') $$,
  '42501', null, 'a lender cannot create a room on the deal by naming the deal''s account'
);
select throws_ok(
  $$ insert into public.lender_package (deal_id, account_id, master_folder_id)
     values (
       '1e000000-0000-0000-0000-0000000000d3',
       (select id from public.accounts where primary_owner_user_id = tests.get_uid('lr_lender_a') and is_personal_account),
       '1e000000-0000-0000-0000-00000000f00a') $$,
  '23514', null, 'a lender cannot set a deal''s master package by naming their personal account'
);
select throws_ok(
  $$ insert into public.dr_folder (account_id, deal_id, parent_id, name)
     values (
       (select id from public.accounts where primary_owner_user_id = tests.get_uid('lr_lender_a') and is_personal_account),
       '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'Planted') $$,
  '23514', null, 'a lender cannot add a folder to the master package by naming their personal account'
);
select throws_ok(
  $$ insert into public.lender_room_member (room_id, user_id, email)
     values ('1e000000-0000-0000-0000-0000000000b0', tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test') $$,
  '42501', null, 'a lender cannot join another room'
);
select throws_ok(
  $$ insert into public.lender_room_member (room_id, user_id, email)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_outsider'), 'lr_outsider@opendealbook.test') $$,
  '42501', null, 'a lender cannot invite anyone into their own room'
);
select throws_ok(
  $$ insert into public.lender_room_hidden (room_id, dr_document_id)
     values ('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-00000000d001') $$,
  '42501', null, 'a lender cannot hide a document from another room'
);
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'forged', '[]'::jsonb) $$,
  '42501', null, 'a lender cannot record a signature envelope'
);

-- ---- A deal of your own is no way into anyone else's documents ----
select tests.login_as('lr_side_dealer');

select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'deal',
  '1e000000-0000-0000-0000-0000000000d9', 'deal.created',
  jsonb_build_object(
    'account_id', tests.account_id('lr-side'),
    'firm_id', tests.create_firm(tests.account_id('lr-side')),
    'description', 'Side deal'));
insert into public.dr_folder (id, account_id, deal_id, name)
values (
  '1e000000-0000-0000-0000-00000000f901',
  tests.account_id('lr-side'),
  '1e000000-0000-0000-0000-0000000000d9', 'Side folder');
select throws_ok(
  $$ insert into public.dr_folder (account_id, deal_id, parent_id, name)
     values (
       tests.account_id('lr-side'),
       '1e000000-0000-0000-0000-0000000000d9', '1e000000-0000-0000-0000-00000000f001', 'Hung from another deal') $$,
  '23503', null, 'a folder of one deal cannot hang under another deal''s folder'
);
select lives_ok(
  $$ insert into public.dr_folder (account_id, deal_id, parent_id, name)
     values (
       tests.account_id('lr-side'),
       '1e000000-0000-0000-0000-0000000000d9', '1e000000-0000-0000-0000-00000000f901', 'Under my own folder') $$,
  'a folder hangs under a folder of its own deal'
);
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d902', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"side.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/0b9c2f6e-side.pdf"}'::jsonb) $$,
  'a document is added at a storage path under its own deal'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d1/cim.pdf"}'::jsonb) $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d1/cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document cannot point at a storage path under another deal'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/../1e000000-0000-0000-0000-0000000000d1/cim.pdf"}'::jsonb) $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d9/../1e000000-0000-0000-0000-0000000000d1/cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document cannot climb out of its deal with a parent segment'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/./cim.pdf"}'::jsonb) $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d9/./cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document storage path has no current-directory segment'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9//cim.pdf"}'::jsonb) $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d9//cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document storage path has no empty segment'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/a\\cim.pdf"}'::jsonb) $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d9/a\cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document storage path has no backslash'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"nowhere.pdf"}'::jsonb) $$,
  'P0001', 'storage path <NULL> is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a new document must say where it is stored'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d902', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"side-renamed.pdf"}'::jsonb) $$,
  'P0001', 'storage path <NULL> is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'a document added again must still say where it is stored'
);

select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d901', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f001","name":"planted.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/planted.pdf"}'::jsonb) $$,
  'P0001', null, 'a document of one deal cannot be added to another deal''s folder'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d902', 'dr_document.moved',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f001"}'::jsonb) $$,
  'P0001', null, 'a document of one deal cannot be moved into another deal''s folder'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d001', 'dr_document.removed', '{}'::jsonb) $$,
  'P0001', null, 'a document cannot be removed through another deal'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d001', 'dr_document.moved',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901"}'::jsonb) $$,
  'P0001', null, 'a document cannot be moved through another deal'
);
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d001', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"renamed.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/renamed.pdf"}'::jsonb) $$,
  'P0001', null, 'a document cannot be renamed through another deal'
);
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d902', 'dr_document.removed', '{}'::jsonb) $$,
  'a document is still removed through its own deal'
);
select is_empty(
  $$ select 1 from public.dr_document where id = '1e000000-0000-0000-0000-00000000d902' $$,
  'a document removed through its own deal is gone from its owner''s view'
);
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d904', 'dr_document.removed', '{}'::jsonb) $$,
  'removing a document that does not exist is accepted'
);
select lives_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d904', 'dr_document.moved',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901"}'::jsonb) $$,
  'moving a document that does not exist is accepted'
);
select is_empty(
  $$ select 1 from public.dr_document
     where id in ('1e000000-0000-0000-0000-00000000d901', '1e000000-0000-0000-0000-00000000d903', '1e000000-0000-0000-0000-00000000d904') $$,
  'a refused document event, or one for a document that does not exist, leaves no document behind'
);
select bag_eq(
  $$ select aggregate_id, event_type from public.deal_event
     where deal_id = '1e000000-0000-0000-0000-0000000000d9' and aggregate_type = 'dr_document' $$,
  $$ values
       ('1e000000-0000-0000-0000-00000000d902'::uuid, 'dr_document.added'),
       ('1e000000-0000-0000-0000-00000000d902'::uuid, 'dr_document.removed'),
       ('1e000000-0000-0000-0000-00000000d904'::uuid, 'dr_document.removed'),
       ('1e000000-0000-0000-0000-00000000d904'::uuid, 'dr_document.moved') $$,
  'a refused document event leaves no event behind'
);

select tests.login_as_service_role();
select throws_ok(
  $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
       '1e000000-0000-0000-0000-00000000d903', 'dr_document.added',
       '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"stolen.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d1/cim.pdf"}'::jsonb,
       null, 'service') $$,
  'P0001', 'storage path deal/1e000000-0000-0000-0000-0000000000d1/cim.pdf is not a file of deal 1e000000-0000-0000-0000-0000000000d9',
  'server code appending for itself is held to the same storage path rule'
);

-- ---- Who uploaded a document ----
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
  '1e000000-0000-0000-0000-00000000d906', 'dr_document.added',
  jsonb_build_object('folder_id', '1e000000-0000-0000-0000-00000000f901', 'name', 'for-a-person.pdf',
    'storage_path', 'deal/1e000000-0000-0000-0000-0000000000d9/for-a-person.pdf', 'uploaded_by', tests.get_uid('lr_lender_a')),
  null, 'service');
select is(
  (select uploaded_by from public.dr_document where id = '1e000000-0000-0000-0000-00000000d906'),
  tests.get_uid('lr_lender_a'),
  'a document the server adds for a person is recorded as uploaded by that person'
);
select tests.login_as('lr_side_dealer');
select throws_ok(
  format(
    $$ select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
         '1e000000-0000-0000-0000-00000000d907', 'dr_document.added',
         '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"not-mine.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/not-mine.pdf","uploaded_by":"%s"}'::jsonb) $$,
    tests.get_uid('lr_lender_a')),
  'P0001', format('document 1e000000-0000-0000-0000-00000000d907 cannot be added by %s as uploaded by %s', tests.get_uid('lr_side_dealer'), tests.get_uid('lr_lender_a')),
  'a person cannot add a document in another person''s name'
);
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d9', 'dr_document',
  '1e000000-0000-0000-0000-00000000d907', 'dr_document.added',
  '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"mine.pdf","storage_path":"deal/1e000000-0000-0000-0000-0000000000d9/mine.pdf"}'::jsonb);
select is(
  (select uploaded_by from public.dr_document where id = '1e000000-0000-0000-0000-00000000d907'),
  tests.get_uid('lr_side_dealer'),
  'a document a person adds is recorded as uploaded by that person'
);

-- ---- History written before the document rules still rebuilds ----
reset role;
insert into public.deal_event (account_id, deal_id, aggregate_type, aggregate_id, event_type, payload, actor_kind, deal_seq, aggregate_seq)
select d.account_id, d.id, 'dr_document', '1e000000-0000-0000-0000-00000000d905', 'dr_document.added',
  '{"folder_id":"1e000000-0000-0000-0000-00000000f901","name":"old.pdf","storage_path":"0a000000-0000-0000-0000-00000000000a/0b000000-0000-0000-0000-00000000000b/old.pdf"}'::jsonb,
  'user', (select max(e.deal_seq) + 1 from public.deal_event e where e.deal_id = d.id), 1
from public.deal d
where d.id = '1e000000-0000-0000-0000-0000000000d9';

select tests.login_as_service_role();
select lives_ok(
  $$ select public.replay_deal('1e000000-0000-0000-0000-0000000000d9') $$,
  'a deal rebuilds when its history holds a document stored outside today''s path rule'
);
select results_eq(
  $$ select name, storage_path, removed_at is null from public.dr_document where id = '1e000000-0000-0000-0000-00000000d905' $$,
  $$ values ('old.pdf', '0a000000-0000-0000-0000-00000000000a/0b000000-0000-0000-0000-00000000000b/old.pdf', true) $$,
  'the rebuild projects that document as its event recorded it'
);

-- ---- Lender B: what is hidden from A is still shown to B ----
select tests.login_as('lr_lender_b');

select results_eq(
  $$ select name, folder_id from public.dr_document where id = '1e000000-0000-0000-0000-00000000d001' $$,
  $$ values ('cim.pdf', '1e000000-0000-0000-0000-00000000f001'::uuid) $$,
  'a master document is untouched by another deal''s attempts to remove, move, and rename it'
);
select is_empty(
  $$ select 1 from public.dr_document
     where id in ('1e000000-0000-0000-0000-00000000d901', '1e000000-0000-0000-0000-00000000d902') $$,
  'nothing from another deal reaches the master package'
);

select set_eq(
  'select id from public.dr_folder',
  array[
    '1e000000-0000-0000-0000-00000000f001'::uuid,
    '1e000000-0000-0000-0000-00000000f002'::uuid,
    '1e000000-0000-0000-0000-00000000f003'::uuid,
    '1e000000-0000-0000-0000-00000000f004'::uuid,
    '1e000000-0000-0000-0000-00000000f00b'::uuid
  ],
  'lender B sees the whole master tree, including what is hidden from A, plus room B'
);
select set_eq(
  'select id from public.dr_document',
  array[
    '1e000000-0000-0000-0000-00000000d001'::uuid,
    '1e000000-0000-0000-0000-00000000d002'::uuid,
    '1e000000-0000-0000-0000-00000000d003'::uuid,
    '1e000000-0000-0000-0000-00000000d103'::uuid,
    '1e000000-0000-0000-0000-00000000d004'::uuid,
    '1e000000-0000-0000-0000-00000000d005'::uuid,
    '1e000000-0000-0000-0000-00000000d00b'::uuid
  ],
  'lender B sees every master document, both versions of the file hidden from A included, plus room B documents'
);
select results_eq(
  $$ select status::text from public.lender_form_signature_status('1e000000-0000-0000-0000-00000000a5b0') $$,
  $$ values ('draft') $$,
  'lender B gets where the signature request on the room B form stands'
);

-- ---- One person in rooms A and B ----
select tests.login_as('lr_lender_ab');

select set_eq(
  'select id from public.my_lender_rooms()',
  array['1e000000-0000-0000-0000-0000000000a0'::uuid, '1e000000-0000-0000-0000-0000000000b0'::uuid],
  'a person in two rooms lists both'
);
select isnt_empty(
  $$ select 1 from public.dr_document where id = '1e000000-0000-0000-0000-00000000d003' $$,
  'a person in rooms A and B sees a document hidden from A because B shows it'
);

-- ---- Lender Z: another account's deal ----
select tests.login_as('lr_lender_z');

select results_eq(
  $$ select name, deal_name from public.lender_room_view('1e000000-0000-0000-0000-0000000000e0') $$,
  $$ values ('Lender Z', 'Fixture business') $$,
  'a lender sees the business of another account''s deal'
);
select is_empty(
  $$ select 1 from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  'a lender on another account''s deal gets nothing for room A'
);
select set_eq(
  'select id from public.dr_folder',
  array['1e000000-0000-0000-0000-00000000f201'::uuid, '1e000000-0000-0000-0000-00000000f20a'::uuid],
  'a room shows folders of its own deal only, even when it names another deal''s folder as its private folder'
);
select set_eq(
  'select id from public.dr_document',
  array['1e000000-0000-0000-0000-00000000d201'::uuid],
  'a room shows documents of its own deal only'
);
select set_eq(
  'select id from public.lender_ask',
  array['1e000000-0000-0000-0000-00000000a5e0'::uuid],
  'lender Z sees room Z asks only'
);
select set_eq(
  'select name from public.lender_oversize_file',
  array['huge-for-z.bin'],
  'lender Z sees too-large placeholders of their own deal only'
);

-- ---- Owner of account 2: internal for deal d2, nobody for deal d1 ----
select tests.login_as('lr_owner_2');

select set_eq(
  'select id from public.lender_room',
  array['1e000000-0000-0000-0000-0000000000e0'::uuid, '1e000000-0000-0000-0000-0000000000e1'::uuid],
  'the owner of account 2 sees account 2 rooms only'
);
select set_eq(
  'select id from public.lender_ask',
  array['1e000000-0000-0000-0000-00000000a5e0'::uuid],
  'the owner of account 2 sees account 2 asks only'
);
select set_eq('select body from public.lender_ask_message', array['from Z'], 'the owner of account 2 sees account 2 messages only');
select is((select count(*)::int from public.lender_room_activity), 1, 'the owner of account 2 sees account 2 activity only');
select is((select count(*)::int from public.lender_room_member), 2, 'the owner of account 2 sees account 2 members only');
select is_empty('select 1 from public.lender_person', 'another account''s team reads no lender''s name');
select is_empty('select 1 from public.lender_form_signature', 'the owner of account 2 sees no account 1 signature envelopes');
select set_eq(
  'select name from public.lender_oversize_file',
  array['huge-for-z.bin'],
  'the owner of account 2 sees account 2 too-large placeholders only'
);
select is_empty(
  $$ select 1 from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  'the owner of account 2 gets nothing for room A'
);
select ok(
  not public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d001'),
  'the owner of account 2 learns nothing about what room A shows'
);
select is_empty(
  $$ select 1 from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') $$,
  'the owner of account 2 cannot list the people of room A'
);
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, name, private_folder_id)
     values (tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d1', 'Poached', '1e000000-0000-0000-0000-00000000f20a') $$,
  '42501', null, 'the owner of account 2 cannot create a room on an account 1 deal'
);
select throws_ok(
  $$ insert into public.lender_package (deal_id, account_id, master_folder_id)
     values ('1e000000-0000-0000-0000-0000000000d3', tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-00000000f201') $$,
  '42501', null, 'the owner of account 2 cannot set the master package of an account 1 deal'
);
select throws_ok(
  $$ insert into public.dr_folder (account_id, deal_id, name)
     values (tests.account_id('lr-acct-2'), '1e000000-0000-0000-0000-0000000000d1', 'Planted') $$,
  '42501', null, 'the owner of account 2 cannot add a folder to an account 1 deal'
);
select throws_ok(
  $$ insert into public.lender_room_member (room_id, user_id, email)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_owner_2'), 'lr_owner_2@opendealbook.test') $$,
  '42501', null, 'the owner of account 2 cannot join room A'
);
select throws_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', 'internal', 'wrong team') $$,
  '42501', null, 'the owner of account 2 cannot reply on a room A ask'
);

-- ---- Owner of account 1: internal for rooms A and B ----
select tests.login_as('lr_owner');

select set_eq(
  'select id from public.lender_room',
  array['1e000000-0000-0000-0000-0000000000a0'::uuid, '1e000000-0000-0000-0000-0000000000b0'::uuid],
  'the team sees both of its rooms and no other account''s'
);
select results_eq(
  $$ select name, deal_name from public.lender_room_view('1e000000-0000-0000-0000-0000000000b0') $$,
  $$ values ('Lender B', 'Target Co') $$,
  'the team gets the lender view of any of its rooms'
);
select is((select count(*)::int from public.lender_room_member), 5, 'the team sees every member of its rooms');
select set_eq(
  'select name from public.lender_person',
  array['Ann Able', 'Ash Two', 'Bo Baker'],
  'the team reads the name of everyone in its rooms'
);
select results_eq(
  $$ select name from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') where user_id = tests.get_uid('lr_lender_a') $$,
  $$ values ('Ann Able') $$,
  'the team gets a person''s name with their email'
);
select throws_ok(
  $$ insert into public.lender_person (user_id, name) values (tests.get_uid('lr_lender_ab'), 'Al Both') $$,
  '42501', null, 'the team cannot write a lender''s name directly'
);
select throws_ok(
  $$ update public.lender_person set name = 'Renamed' $$,
  '42501', null, 'the team cannot change a lender''s name directly'
);
select throws_ok(
  $$ delete from public.lender_person $$,
  '42501', null, 'the team cannot remove a lender''s name'
);
select is((select count(*)::int from public.lender_room_hidden), 2, 'the team sees what is hidden');
select set_eq(
  'select deal_id from public.lender_package',
  array['1e000000-0000-0000-0000-0000000000d1'::uuid],
  'the team sees its own deal''s package and no other account''s'
);
select set_eq(
  'select documenso_document_id from public.lender_form_signature',
  array['doc_1', 'doc_2', 'doc_3', 'doc_b'],
  'the team sees every signature envelope on its asks'
);
select results_eq(
  $$ select signers -> 0 ->> 'email', editor_url from public.lender_form_signature where documenso_document_id = 'doc_3' $$,
  $$ values ('sam@lender-a.test', 'https://sign.test/d/doc_3') $$,
  'the team reads the signers and the editor link of a signature request'
);
select is(
  (select count(*)::int from public.lender_form_signature_status('1e000000-0000-0000-0000-00000000a5a0')),
  3,
  'the team gets where each signature request on its form stands'
);
select set_eq(
  $$ select documenso_document_id from public.lender_form_signature where status in ('declined', 'expired') $$,
  array['doc_1', 'doc_2'],
  'a declined or expired envelope stays on record'
);
select is(
  (select status::text from public.lender_form_signature where documenso_document_id = 'doc_3'),
  'draft',
  'a new signature request starts as a draft'
);
select set_eq(
  'select id from public.lender_ask',
  array[
    '1e000000-0000-0000-0000-00000000a5a0'::uuid,
    '1e000000-0000-0000-0000-00000000a5f0'::uuid,
    '1e000000-0000-0000-0000-00000000a5b0'::uuid
  ],
  'the team sees asks in both rooms'
);
select set_eq('select body from public.lender_ask_message', array['from A', 'from B'], 'the team sees messages in both rooms');
select is((select count(*)::int from public.lender_ask_file), 3, 'the team sees ask files in both rooms');
select is((select count(*)::int from public.lender_room_activity), 4, 'the team sees activity in both rooms');
select set_eq(
  'select name from public.lender_oversize_file',
  array['huge-model.xlsx', 'huge-for-b.mov'],
  'the team sees too-large placeholders in both rooms'
);
select is((select count(*)::int from public.dr_folder), 20, 'the team still sees its whole data room, default folders included');
select is((select count(*)::int from public.dr_document), 10, 'the team still sees every document that has not been removed');
select throws_ok('select 1 from public.lender_brand', '42501', null, 'the team cannot read the brand cache');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'lender-brand' $$,
  'the team cannot read logo objects'
);

select isnt_empty(
  $$ update public.lender_room set welcome_note = 'Hello B' where id = '1e000000-0000-0000-0000-0000000000b0' returning 1 $$,
  'the team changes a room'
);
select lives_ok(
  $$ insert into public.lender_room_member (room_id, user_id, email)
     values ('1e000000-0000-0000-0000-0000000000b0', tests.get_uid('lr_outsider'), 'lr_outsider@opendealbook.test') $$,
  'the team invites a person into a room'
);
select isnt_empty(
  $$ delete from public.lender_room_member
     where room_id = '1e000000-0000-0000-0000-0000000000b0' and user_id = tests.get_uid('lr_outsider') returning 1 $$,
  'the team removes a person from a room'
);
select lives_ok(
  $$ insert into public.lender_room_hidden (room_id, dr_document_id)
     values ('1e000000-0000-0000-0000-0000000000b0', '1e000000-0000-0000-0000-00000000d002') $$,
  'the team hides a document from a room'
);
select isnt_empty(
  $$ delete from public.lender_room_hidden
     where room_id = '1e000000-0000-0000-0000-0000000000b0' and dr_document_id = '1e000000-0000-0000-0000-00000000d002' returning 1 $$,
  'the team unhides a document'
);
select lives_ok(
  $$ insert into public.lender_package (deal_id, account_id, master_folder_id)
     values ('1e000000-0000-0000-0000-0000000000d3', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-00000000f301') $$,
  'the team sets the master package of its own deal'
);
select lives_ok(
  $$ insert into public.dr_folder (account_id, deal_id, parent_id, name)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'Added by the team') $$,
  'the team adds a folder to the master package'
);
select throws_ok(
  $$ insert into public.lender_form_signature (ask_id, documenso_document_id, signers)
     values ('1e000000-0000-0000-0000-00000000a5f0', 'doc_4', '[{"name":"Sam","email":"sam@lender-a.test"}]'::jsonb) $$,
  '42501', null, 'the team cannot record a signature request directly'
);
select throws_ok(
  $$ update public.lender_form_signature set status = 'completed' where documenso_document_id = 'doc_3' $$,
  '42501', null, 'the team cannot change where a signature request stands directly'
);
select throws_ok(
  $$ update public.lender_form_signature set documenso_document_id = 'someone-elses' where documenso_document_id = 'doc_3' $$,
  '42501', null, 'the team cannot point a signature request at another signing document'
);
select throws_ok(
  $$ update public.lender_form_signature set editor_url = 'https://sign.test/d/someone-elses' where documenso_document_id = 'doc_3' $$,
  '42501', null, 'the team cannot change the editor link of a signature request'
);
select throws_ok(
  $$ delete from public.lender_form_signature where documenso_document_id = 'doc_3' $$,
  '42501', null, 'the team cannot remove a signature request'
);
select throws_ok(
  $$ update public.contract_version set signing_document_id = 'someone-elses' where id = '1e000000-0000-0000-0000-00000000c102' $$,
  '42501', null, 'the team cannot set a contract version''s signing document directly'
);
select throws_ok(
  $$ update public.contract_version set signing_status = 'completed' where id = '1e000000-0000-0000-0000-00000000c102' $$,
  '42501', null, 'the team cannot set a contract version''s signing status directly'
);
select throws_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party, signing_document_id)
     values ('1e000000-0000-0000-0000-0000000000c1', tests.account_id('lr-acct'), 3, 'upload', 'buyer', 'someone-elses') $$,
  '42501', null, 'the team cannot add a contract version that already names a signing document'
);
select throws_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party, signing_status)
     values ('1e000000-0000-0000-0000-0000000000c1', tests.account_id('lr-acct'), 3, 'upload', 'buyer', 'completed') $$,
  '42501', null, 'the team cannot add a contract version that already has a signing status'
);
select lives_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party)
     values ('1e000000-0000-0000-0000-0000000000c1', tests.account_id('lr-acct'), 3, 'upload', 'buyer') $$,
  'the team still adds a contract version'
);
select isnt_empty(
  $$ update public.contract_version set change_summary = 'tidied' where id = '1e000000-0000-0000-0000-00000000c102' returning 1 $$,
  'the team still changes the other columns of a contract version'
);
select isnt_empty(
  $$ update public.lender_ask set status = 'answered', first_response_at = now()
     where id = '1e000000-0000-0000-0000-00000000a5a0' returning 1 $$,
  'the team changes an ask'
);
select lives_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', 'internal', 'here you go') $$,
  'the team replies on an ask'
);
select lives_ok(
  $$ insert into public.lender_ask_file (ask_id, dr_document_id, role)
     values ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00a', 'fulfilment') $$,
  'the team files a room A document against a room A ask'
);
select lives_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'internal', 'room_opened') $$,
  'the team records its own activity'
);
select lives_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action, dr_folder_id)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'internal', 'folder_created', '1e000000-0000-0000-0000-00000000f00a') $$,
  'the team records a folder it created in its room'
);
select ok(
  public.lender_room_shows_folder('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f002'),
  'the team can ask whether one of its rooms shows a folder'
);
select throws_ok(
  $$ select 1 from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d001') $$,
  '42501', null, 'a signed-in team member cannot ask who is told about a document'
);
select throws_ok('select 1 from public.lender_upload', '42501', null, 'the team cannot read upload records');
select throws_ok(
  $$ insert into public.lender_upload (room_id, folder_id, name, storage_path, uploaded_by)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f00a', 'ours.pdf', 'deal/x/uploads/ours.pdf', tests.get_uid('lr_owner')) $$,
  '42501', null, 'the team cannot issue itself a storage key'
);
select throws_ok(
  $$ update public.lender_upload set storage_path = 'deal/x/uploads/ours.pdf' $$,
  '42501', null, 'the team cannot repoint an upload at another storage key'
);
select throws_ok(
  $$ delete from public.lender_upload $$,
  '42501', null, 'the team cannot remove an upload record'
);
select set_eq(
  $$ select user_id, email from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values
       (tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test'),
       (tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test'),
       (tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test'),
       (tests.get_uid('lr_owner'), 'lr_owner@opendealbook.test') $$,
  'the team lists each person invited to a room or who acted in it, lenders and teammates alike, once each'
);

select throws_ok(
  $$ insert into public.lender_ask (room_id, account_id, kind, title)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'ask', 'ours') $$,
  '42501', null, 'the team cannot open an ask; asks come from lenders'
);
select throws_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', 'lender', 'posing as the lender') $$,
  '42501', null, 'the team cannot post as the lender'
);
select throws_ok(
  $$ insert into public.lender_ask_message (ask_id, author_user_id, side, body)
     values ('1e000000-0000-0000-0000-00000000a5a0', tests.get_uid('lr_owner_2'), 'internal', 'signed as someone else') $$,
  '42501', null, 'a team member cannot post a message under another person''s name'
);
select throws_ok(
  $$ insert into public.lender_ask_file (ask_id, dr_document_id, role, added_by)
     values ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d001', 'fulfilment', tests.get_uid('lr_owner_2')) $$,
  '42501', null, 'a team member cannot file a document under another person''s name'
);
select throws_ok(
  $$ insert into public.lender_ask_file (ask_id, dr_document_id, role)
     values ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00b', 'fulfilment') $$,
  '42501', null, 'the team cannot file a room B document against a room A ask'
);
select throws_ok(
  $$ insert into public.lender_ask_file (ask_id, dr_document_id, role)
     values ('1e000000-0000-0000-0000-00000000a5a0', '1e000000-0000-0000-0000-00000000d00e', 'fulfilment') $$,
  '42501', null, 'a removed document cannot be filed against an ask'
);
select ok(
  not public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d00e'),
  'no room shows a removed document'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'lender', 'room_opened') $$,
  '42501', null, 'the team cannot record activity as the lender'
);
select throws_ok(
  $$ insert into public.lender_room_activity (room_id, account_id, user_id, side, action)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), tests.get_uid('lr_owner_2'), 'internal', 'room_opened') $$,
  '42501', null, 'a team member cannot record activity under another person''s name'
);
select throws_ok(
  $$ update public.lender_ask_message set body = 'edited' $$,
  '42501', null, 'the team cannot edit a message'
);
select throws_ok(
  $$ delete from public.lender_ask_message $$,
  '42501', null, 'the team cannot remove a message'
);
select throws_ok(
  $$ update public.lender_ask_file set role = 'signed_form' $$,
  '42501', null, 'the team cannot relabel an ask file'
);
select throws_ok(
  $$ delete from public.lender_ask_file $$,
  '42501', null, 'the team cannot detach an ask file'
);
select throws_ok(
  $$ update public.lender_room_activity set action = 'zip_downloaded' $$,
  '42501', null, 'activity cannot be rewritten'
);
select throws_ok(
  $$ delete from public.lender_room_activity $$,
  '42501', null, 'activity cannot be erased'
);
select throws_ok(
  $$ insert into public.lender_room (account_id, deal_id, name, private_folder_id)
     values (tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Poached', '1e000000-0000-0000-0000-00000000f00c') $$,
  '42501', null, 'the team cannot create a room on another account''s deal under its own account'
);

-- ---- A new room starts invited, expires 60 days out, and stays ----
select lives_ok(
  $$ insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
     values ('1e000000-0000-0000-0000-0000000000c0', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', 'Lender C', '1e000000-0000-0000-0000-00000000f00c') $$,
  'the team creates a room on its own deal'
);
select is(
  (select status::text from public.lender_room where id = '1e000000-0000-0000-0000-0000000000c0'),
  'invited',
  'a new room starts as invited'
);
select is(
  (select expires_at from public.lender_room where id = '1e000000-0000-0000-0000-0000000000c0'),
  now() + interval '60 days',
  'a new room expires 60 days after creation'
);
select throws_ok(
  $$ delete from public.lender_room where id = '1e000000-0000-0000-0000-0000000000c0' $$,
  '42501', null, 'the team cannot delete a room'
);

-- ---- Outsider: none of it ----
select tests.login_as('lr_outsider');

select is_empty('select 1 from public.lender_room', 'an outsider sees no rooms');
select is_empty('select 1 from public.my_lender_rooms()', 'an outsider lists no rooms');
select is_empty(
  $$ select 1 from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  'an outsider gets nothing for room A'
);
select ok(
  not public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d001'),
  'an outsider learns nothing about what room A shows'
);
select is_empty('select 1 from public.lender_room_member', 'an outsider sees no members');
select is_empty('select 1 from public.lender_person', 'a stranger reads no lender''s name');
select is_empty('select 1 from public.lender_ask', 'an outsider sees no asks');
select is_empty('select 1 from public.lender_ask_message', 'an outsider sees no messages');
select is_empty('select 1 from public.lender_ask_file', 'an outsider sees no ask files');
select is_empty('select 1 from public.lender_room_activity', 'an outsider sees no activity');
select is_empty('select 1 from public.lender_room_hidden', 'an outsider sees nothing hidden');
select is_empty('select 1 from public.lender_package', 'an outsider sees no package row');
select is_empty('select 1 from public.lender_form_signature', 'an outsider sees no signature envelopes');
select is_empty(
  $$ select 1 from public.lender_form_signature_status('1e000000-0000-0000-0000-00000000a5a0') $$,
  'an outsider gets nothing about where a signature request stands'
);
select is_empty('select 1 from public.lender_oversize_file', 'an outsider sees no too-large placeholders');
select is_empty('select 1 from public.dr_folder', 'an outsider sees no folders');
select is_empty('select 1 from public.dr_document', 'an outsider sees no documents');
select throws_ok('select 1 from public.lender_upload', '42501', null, 'an outsider cannot read upload records');
select throws_ok(
  $$ insert into public.lender_upload (room_id, folder_id, name, storage_path, uploaded_by)
     values ('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000f00a', 'theirs.pdf', 'deal/x/uploads/theirs.pdf', tests.get_uid('lr_outsider')) $$,
  '42501', null, 'an outsider cannot issue themselves a storage key'
);
select throws_ok(
  $$ update public.lender_upload set storage_path = 'deal/x/uploads/theirs.pdf' $$,
  '42501', null, 'an outsider cannot repoint an upload at another storage key'
);
select throws_ok(
  $$ delete from public.lender_upload $$,
  '42501', null, 'an outsider cannot remove an upload record'
);

-- ---- People whose only trace in a room is a request they opened or a file they uploaded ----
reset role;
insert into public.lender_ask (id, room_id, account_id, kind, title, created_by)
values ('1e000000-0000-0000-0000-00000000a5a9', '1e000000-0000-0000-0000-0000000000a0', tests.account_id('lr-acct'), 'ask', 'Opened then left', tests.get_uid('lr_lender_z'));
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, uploaded_by)
values ('1e000000-0000-0000-0000-00000000d0a9', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f0a1', 'uploaded-then-left.pdf', 'deal/x/uploaded-then-left.pdf', tests.get_uid('lr_side_dealer'));
select tests.login_as('lr_owner');
select results_eq(
  $$ select email from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') where user_id = tests.get_uid('lr_lender_z') $$,
  $$ values ('lr_lender_z@opendealbook.test') $$,
  'the team gets the email of a person whose only trace in the room is a request they opened'
);
select results_eq(
  $$ select email from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') where user_id = tests.get_uid('lr_side_dealer') $$,
  $$ values ('lr_side_dealer@opendealbook.test') $$,
  'the team gets the email of a person whose only trace in the room is a file they uploaded under its own folder'
);
reset role;
delete from public.lender_ask where id = '1e000000-0000-0000-0000-00000000a5a9';
delete from public.dr_document where id = '1e000000-0000-0000-0000-00000000d0a9';

-- ---- A person removed from a room loses it at once ----
select tests.login_as('lr_lender_a2');
select isnt_empty('select 1 from public.dr_document', 'before removal a room A colleague sees documents');

select tests.login_as('lr_owner');
delete from public.lender_room_member
where room_id = '1e000000-0000-0000-0000-0000000000a0' and user_id = tests.get_uid('lr_lender_a2');

select results_eq(
  $$ select user_id, email, invited_at, removed_at, removed_by
     from public.lender_room_removed_member where room_id = '1e000000-0000-0000-0000-0000000000a0' $$,
  $$ values (tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test', '2026-02-01'::timestamptz, now(), tests.get_uid('lr_owner')) $$,
  'removing a person leaves the team one record of who, when they were invited, when they left and who removed them'
);
select results_eq(
  $$ select email from public.lender_room_people('1e000000-0000-0000-0000-0000000000a0') where user_id = tests.get_uid('lr_lender_a2') $$,
  $$ values ('lr_lender_a2@opendealbook.test') $$,
  'the team still gets the email of a person removed from the room'
);
select results_eq(
  $$ select name from public.lender_person where user_id = tests.get_uid('lr_lender_a2') $$,
  $$ values ('Ash Two') $$,
  'the team still reads the name of a person removed from its room'
);
select throws_ok(
  $$ insert into public.lender_room_removed_member (room_id, user_id, email, invited_at)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_a'), 'lr_lender_a@opendealbook.test', now()) $$,
  '42501', null, 'the team cannot write a removal record directly'
);
select throws_ok(
  $$ update public.lender_room_removed_member set removed_at = '2020-01-01' $$,
  '42501', null, 'the team cannot rewrite a removal record'
);
select throws_ok(
  $$ delete from public.lender_room_removed_member $$,
  '42501', null, 'the team cannot erase a removal record'
);

select tests.login_as('lr_lender_a');
select is_empty('select 1 from public.lender_room_removed_member', 'a member reads nothing about who was removed from their room');
select tests.login_as('lr_owner_2');
select is_empty('select 1 from public.lender_room_removed_member', 'another account''s team reads nothing about who was removed');

select tests.login_as('lr_lender_a2');
select is_empty(
  $$ select 1 from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  'a removed person gets nothing for the room'
);
select is_empty('select 1 from public.my_lender_rooms()', 'a removed person lists no rooms');
select is_empty('select 1 from public.dr_folder', 'a removed person sees no folders');
select is_empty('select 1 from public.dr_document', 'a removed person sees no documents');
select is_empty('select 1 from public.lender_ask', 'a removed person sees no asks');
select is_empty('select 1 from public.lender_room_member', 'a removed person sees no members');
select is_empty('select 1 from public.lender_room_removed_member', 'a removed person reads nothing about their own removal');
select results_eq(
  'select name from public.lender_person',
  $$ values ('Ash Two') $$,
  'a person removed from their only room still reads their own name and no one else''s'
);
select ok(
  not public.is_lender_room_member('1e000000-0000-0000-0000-0000000000a0'),
  'a removed person is no member of the room'
);

select tests.login_as('lr_owner');
insert into public.lender_room_member (room_id, user_id, email)
values ('1e000000-0000-0000-0000-0000000000a0', tests.get_uid('lr_lender_a2'), 'lr_lender_a2@opendealbook.test');
select is(
  (select count(*)::int from public.lender_room_member
   where room_id = '1e000000-0000-0000-0000-0000000000a0' and user_id = tests.get_uid('lr_lender_a2')),
  1,
  'a person invited again after removal is in the room once'
);
select is(
  (select count(*)::int from public.lender_room_removed_member
   where room_id = '1e000000-0000-0000-0000-0000000000a0' and user_id = tests.get_uid('lr_lender_a2')),
  1,
  'the earlier removal stays on record after the person is invited again'
);

-- ---- Closed room: the member can still name it and sees nothing inside ----
select tests.login_as_service_role();
update public.lender_room set closed_at = now() where id = '1e000000-0000-0000-0000-0000000000a0';

select tests.login_as('lr_lender_a');
select is(
  public.lender_open_room_deal_ids(),
  '{}'::uuid[],
  'a closed room is none of a member''s open rooms'
);
select results_eq(
  $$ select name, is_open, deal_name from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('Lender A', false, 'Target Co') $$,
  'a member of a closed room still gets the room and deal name, marked not open'
);
select tests.login_as_service_role();
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'deal',
  '1e000000-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('code_name', 'Project Harbor'), null, 'service');
select tests.login_as('lr_lender_a');
select results_eq(
  $$ select deal_name from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('Project Harbor') $$,
  'a lender sees the deal''s code name in place of its business name'
);
select results_eq(
  $$ select deal_name from public.my_lender_rooms() $$,
  $$ values ('Project Harbor') $$,
  'a lender''s rooms list names the deal by its code name'
);
select tests.login_as_service_role();
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'deal',
  '1e000000-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('code_name', null), null, 'service');
select tests.login_as('lr_lender_a');
select set_eq(
  'select id from public.my_lender_rooms()',
  array['1e000000-0000-0000-0000-0000000000a0'::uuid],
  'a member of a closed room still lists it'
);
select results_eq(
  $$ select private_folder_id, master_folder_id, welcome_note from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values (null::uuid, null::uuid, null::text) $$,
  'a closed room gives out neither its folders nor its welcome note'
);
select results_eq(
  $$ select private_folder_id, master_folder_id, welcome_note from public.my_lender_rooms() $$,
  $$ values (null::uuid, null::uuid, null::text) $$,
  'a closed room in the rooms list gives out neither its folders nor its welcome note'
);
select is_empty('select 1 from public.dr_folder', 'a closed room shows no folders');
select is_empty('select 1 from public.dr_document', 'a closed room shows no documents');
select is_empty('select 1 from public.lender_ask', 'a closed room shows no asks');
select is_empty('select 1 from public.lender_ask_message', 'a closed room shows no messages');
select is_empty('select 1 from public.lender_ask_file', 'a closed room shows no ask files');
select is_empty('select 1 from public.lender_oversize_file', 'a closed room shows no too-large placeholders');
select ok(
  not public.lender_room_shows_document('1e000000-0000-0000-0000-0000000000a0', '1e000000-0000-0000-0000-00000000d00a'),
  'a member of a closed room learns nothing about what it shows'
);

select tests.login_as_service_role();
select set_eq(
  $$ select room_id, user_id, email from public.lender_document_recipients('1e000000-0000-0000-0000-00000000d001') $$,
  $$ values
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_b'), 'lr_lender_b@opendealbook.test'),
       ('1e000000-0000-0000-0000-0000000000b0'::uuid, tests.get_uid('lr_lender_ab'), 'lr_lender_ab@opendealbook.test') $$,
  'the members of a closed room are told about nothing'
);
select is_empty(
  $$ select 1 from public.lender_visible_documents(tests.get_uid('lr_lender_a'), array[
       '1e000000-0000-0000-0000-00000000d001'::uuid, '1e000000-0000-0000-0000-00000000d00a'::uuid]) $$,
  'a closed room yields no documents a person can open'
);

select tests.login_as('lr_owner');
select results_eq(
  $$ select private_folder_id, master_folder_id, welcome_note from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('1e000000-0000-0000-0000-00000000f00a'::uuid, '1e000000-0000-0000-0000-00000000f001'::uuid, 'Welcome') $$,
  'the team still gets the folders and welcome note of a closed room'
);

-- ---- Expired room: same as closed ----
select tests.login_as_service_role();
update public.lender_room set closed_at = null, expires_at = now() - interval '1 second'
where id = '1e000000-0000-0000-0000-0000000000a0';

select tests.login_as('lr_lender_a');
select results_eq(
  $$ select name, is_open from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values ('Lender A', false) $$,
  'a member of an expired room still gets the room name, marked not open'
);
select is_empty('select 1 from public.dr_folder', 'an expired room shows no folders');
select is_empty('select 1 from public.dr_document', 'an expired room shows no documents');
select is_empty('select 1 from public.lender_ask', 'an expired room shows no asks');
select is_empty('select 1 from public.lender_ask_message', 'an expired room shows no messages');
select is_empty('select 1 from public.lender_ask_file', 'an expired room shows no ask files');
select is_empty('select 1 from public.lender_oversize_file', 'an expired room shows no too-large placeholders');

-- ---- Selected with no expiry stays readable ----
select tests.login_as_service_role();
update public.lender_room set status = 'selected', expires_at = null
where id = '1e000000-0000-0000-0000-0000000000a0';

select tests.login_as('lr_lender_a');
select results_eq(
  $$ select is_open from public.lender_room_view('1e000000-0000-0000-0000-0000000000a0') $$,
  $$ values (true) $$,
  'a room with no expiry is open'
);
select isnt_empty(
  $$ select 1 from public.dr_document where id = '1e000000-0000-0000-0000-00000000d001' $$,
  'a selected room with no expiry shows the master package'
);
select isnt_empty('select 1 from public.lender_ask', 'a selected room with no expiry shows its asks');

-- ---- A deal rebuild deletes documents and puts them back under the same ids ----
reset role;
delete from public.dr_document where id = '1e000000-0000-0000-0000-00000000d003';
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values ('1e000000-0000-0000-0000-00000000d003', tests.account_id('lr-acct'), '1e000000-0000-0000-0000-0000000000d1', '1e000000-0000-0000-0000-00000000f001', 'hidden-for-a.pdf', 'deal/x/hidden-for-a.pdf');

select tests.login_as('lr_lender_a');
select is_empty(
  $$ select 1 from public.dr_document
     where id in ('1e000000-0000-0000-0000-00000000d003', '1e000000-0000-0000-0000-00000000d103') $$,
  'a document hidden from room A stays hidden after it is rebuilt'
);

reset role;
select lives_ok(
  $$ delete from public.dr_document where id = '1e000000-0000-0000-0000-00000000d00c' $$,
  'a document that was attached to an ask and previewed can still be deleted'
);
select lives_ok(
  $$ delete from public.dr_folder where id = '1e000000-0000-0000-0000-00000000f0a1' $$,
  'a folder that was opened in a room can still be deleted'
);
select is(
  (select count(*)::int from public.lender_room_activity
   where dr_document_id = '1e000000-0000-0000-0000-00000000d00c' or dr_folder_id = '1e000000-0000-0000-0000-00000000f0a1'),
  2,
  'activity history outlives the document and folder it names'
);

-- ---- A package that names another deal's folder as its master ----
set local session_replication_role = replica;
update public.lender_package set master_folder_id = '1e000000-0000-0000-0000-00000000f001'
where deal_id = '1e000000-0000-0000-0000-0000000000d2';
set local session_replication_role = origin;
select is(
  public.lender_package_folder_count('1e000000-0000-0000-0000-0000000000d2'),
  0,
  'a package whose master folder belongs to another deal counts none of that deal''s folders'
);

select tests.login_as('lr_lender_z');
select set_eq(
  'select id from public.dr_folder',
  array['1e000000-0000-0000-0000-00000000f20a'::uuid],
  'a package pointing at another deal''s folder shows none of that deal''s folders'
);
select is_empty('select 1 from public.dr_document', 'a package pointing at another deal''s folder shows none of its documents');


-- ---- A room that had members can still be deleted ----
select tests.login_as_service_role();
select lives_ok(
  $$ delete from public.lender_room where id = '1e000000-0000-0000-0000-0000000000e1' $$,
  'a room is deleted along with its members'
);

-- ---- A lender's rooms list: what is new, whose turn, and in what order ----
-- Account LL owns deals l1 and l2. Lender LL is in four rooms: One (visited
-- two days ago, with a new file, an older file, the lender's own upload, a
-- new team answer and an answered request), Two (never visited, with one
-- file), Four (opened a day ago, quiet), and Three (closed, ten days old).
select tests.create_user('ll_owner');
select tests.create_user('ll_lender');
select tests.login_as_service_role();
select public.create_team_account('LL Buyers', tests.get_uid('ll_owner'), 'll-acct');
select public.append_deal_event('1e0000ff-0000-0000-0000-0000000000d1', 'deal',
  '1e0000ff-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ll-acct'), 'firm_id', tests.create_firm(tests.account_id('ll-acct')), 'owner_user_id', tests.get_uid('ll_owner'),
    'description', 'List deal one'), null, 'service');
select public.append_deal_event('1e0000ff-0000-0000-0000-0000000000d2', 'deal',
  '1e0000ff-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ll-acct'), 'firm_id', tests.create_firm(tests.account_id('ll-acct')), 'owner_user_id', tests.get_uid('ll_owner'),
    'description', 'List deal two'), null, 'service');
reset role;

set local session_replication_role = replica;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('1e0000ff-0000-0000-0000-00000000f001', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', null, 'Room One'),
  ('1e0000ff-0000-0000-0000-00000000f002', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d2', null, 'Room Two'),
  ('1e0000ff-0000-0000-0000-00000000f003', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', null, 'Room Three'),
  ('1e0000ff-0000-0000-0000-00000000f004', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d2', null, 'Room Four');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id, created_at, closed_at)
values
  ('1e0000ff-0000-0000-0000-0000000000a1', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', 'Bank One', '1e0000ff-0000-0000-0000-00000000f001', now() - interval '20 days', null),
  ('1e0000ff-0000-0000-0000-0000000000a2', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d2', 'Bank Two', '1e0000ff-0000-0000-0000-00000000f002', now() - interval '3 days', null),
  ('1e0000ff-0000-0000-0000-0000000000a3', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', 'Bank Three', '1e0000ff-0000-0000-0000-00000000f003', now() - interval '10 days', now()),
  ('1e0000ff-0000-0000-0000-0000000000a4', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d2', 'Bank Four', '1e0000ff-0000-0000-0000-00000000f004', now() - interval '1 day', null);
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path, version, created_at)
values
  ('1e0000ff-0000-0000-0000-00000000d001', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', '1e0000ff-0000-0000-0000-00000000f001', 'old.pdf', 'll/old.pdf', 1, now() - interval '3 days'),
  ('1e0000ff-0000-0000-0000-00000000d002', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', '1e0000ff-0000-0000-0000-00000000f001', 'new.pdf', 'll/new.pdf', 1, now() - interval '1 day'),
  ('1e0000ff-0000-0000-0000-00000000d003', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', '1e0000ff-0000-0000-0000-00000000f001', 'mine.pdf', 'll/mine.pdf', 1, now() - interval '1 day'),
  ('1e0000ff-0000-0000-0000-00000000d004', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d2', '1e0000ff-0000-0000-0000-00000000f002', 'two.pdf', 'll/two.pdf', 1, now() - interval '5 days'),
  ('1e0000ff-0000-0000-0000-00000000d005', tests.account_id('ll-acct'), '1e0000ff-0000-0000-0000-0000000000d1', '1e0000ff-0000-0000-0000-00000000f003', 'closed.pdf', 'll/closed.pdf', 1, now() - interval '9 days');
set local session_replication_role = origin;

insert into public.lender_room_member (room_id, user_id, email, invited_by)
select r, tests.get_uid('ll_lender'), 'll_lender@opendealbook.test', tests.get_uid('ll_owner')
from unnest(array[
  '1e0000ff-0000-0000-0000-0000000000a1', '1e0000ff-0000-0000-0000-0000000000a2',
  '1e0000ff-0000-0000-0000-0000000000a3', '1e0000ff-0000-0000-0000-0000000000a4'
]::uuid[]) r;
insert into public.lender_upload (room_id, deal_id, folder_id, name, storage_path, uploaded_by, registered_at, document_ids)
values ('1e0000ff-0000-0000-0000-0000000000a1', '1e0000ff-0000-0000-0000-0000000000d1', '1e0000ff-0000-0000-0000-00000000f001',
  'mine.pdf', 'll/upload/mine.pdf', tests.get_uid('ll_lender'), now(), array['1e0000ff-0000-0000-0000-00000000d003'::uuid]);
insert into public.lender_room_activity (room_id, account_id, user_id, side, action, created_at)
values
  ('1e0000ff-0000-0000-0000-0000000000a1', tests.account_id('ll-acct'), tests.get_uid('ll_lender'), 'lender', 'room_opened', now() - interval '4 days'),
  ('1e0000ff-0000-0000-0000-0000000000a1', tests.account_id('ll-acct'), tests.get_uid('ll_lender'), 'lender', 'room_opened', now() - interval '2 days'),
  ('1e0000ff-0000-0000-0000-0000000000a4', tests.account_id('ll-acct'), tests.get_uid('ll_lender'), 'lender', 'room_opened', now() - interval '1 day');
insert into public.lender_ask (id, room_id, account_id, kind, title, status)
values
  ('1e0000ff-0000-0000-0000-0000000000b1', '1e0000ff-0000-0000-0000-0000000000a1', tests.account_id('ll-acct'), 'ask', 'Tax returns', 'answered'),
  ('1e0000ff-0000-0000-0000-0000000000b2', '1e0000ff-0000-0000-0000-0000000000a1', tests.account_id('ll-acct'), 'ask', 'Lease', 'open'),
  ('1e0000ff-0000-0000-0000-0000000000b3', '1e0000ff-0000-0000-0000-0000000000a3', tests.account_id('ll-acct'), 'ask', 'Closed room ask', 'answered');
insert into public.lender_ask_message (ask_id, author_user_id, side, body, created_at)
values
  ('1e0000ff-0000-0000-0000-0000000000b1', tests.get_uid('ll_lender'), 'lender', 'Send the returns', now() - interval '3 days'),
  ('1e0000ff-0000-0000-0000-0000000000b1', tests.get_uid('ll_owner'), 'internal', 'Here they are', now() - interval '12 hours'),
  ('1e0000ff-0000-0000-0000-0000000000b2', tests.get_uid('ll_lender'), 'lender', 'And the lease', now() - interval '6 hours');

select tests.login_as('ll_lender');

select results_eq(
  $$ select (room).name, new_count, your_turn_count from public.my_lender_room_list() $$,
  $$ values ('Bank One', 2, 1), ('Bank Two', 1, 0), ('Bank Four', 0, 0), ('Bank Three', 0, 0) $$,
  'a lender''s rooms count files and team answers since the last visit and requests answered back to them, those needing attention first, then the most recent'
);
select results_eq(
  $$ select last_activity_at from public.my_lender_room_list() where (room).name = 'Bank One' $$,
  $$ values (now() - interval '12 hours') $$,
  'a room''s latest activity is its latest file or team answer'
);
select results_eq(
  $$ select last_activity_at from public.my_lender_room_list() where (room).name = 'Bank Four' $$,
  $$ values (now() - interval '1 day') $$,
  'a quiet room''s latest activity is when it was made'
);

select tests.login_as('ll_owner');
select is_empty('select 1 from public.my_lender_room_list()', 'the team lists none of its rooms as its own');

select * from finish();
rollback;
