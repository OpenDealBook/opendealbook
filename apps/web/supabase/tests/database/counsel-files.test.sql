begin;
select no_plan();

-- Team "CF Team" owns deal d1. cf_owner manages it, cf_member is on the team
-- without deals.manage, cf_buyer_law is buyer's counsel.
select tests.create_user('cf_owner');
select tests.create_user('cf_member');
select tests.create_user('cf_buyer_law');

select tests.login_as_service_role();
select public.create_team_account('CF Team', tests.get_uid('cf_owner'), 'cf-team');
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'deal',
  'cf000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cf-team'), 'owner_user_id', tests.get_uid('cf_owner'),
    'description', 'Counsel files deal'), null, 'service');
insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values (tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', 'buyer',
  tests.get_uid('cf_buyer_law'), 'cf_buyer_law@tuckin.test');

reset role;
insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('cf_member'), tests.account_id('cf-team'), 'member');

-- ---- The "Buyer's counsel" folder ----

select tests.login_as('cf_buyer_law');
select throws_ok(
  $$ select public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'counsel cannot create the uploads folder themselves'
);

select tests.login_as_service_role();
select is(
  public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1'),
  public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1'),
  'a deal has one buyer''s counsel uploads folder'
);
select results_eq(
  $$ select name, parent_id from public.dr_folder
     where id = public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Buyer''s counsel', null::uuid) $$,
  'the uploads folder is a root folder named Buyer''s counsel'
);

select tests.login_as('cf_buyer_law');
select set_eq(
  $$ select name from public.buyer_counsel_folders('cf000000-0000-0000-0000-0000000000d1') $$,
  array['Buyer''s counsel', 'Financials', 'Legal', 'Operations', 'Tax', 'Other'],
  'buyer''s counsel see their uploads folder beside the default folders in the data room'
);

select tests.login_as('cf_owner');
select throws_ok(
  $$ delete from public.dr_folder
     where deal_id = 'cf000000-0000-0000-0000-0000000000d1' and name = 'Buyer''s counsel' $$,
  '23001',
  'This folder holds buyer''s counsel uploads and cannot be deleted',
  'the team cannot delete the Buyer''s counsel folder'
);

reset role;
select throws_ok(
  $$ delete from public.dr_folder
     where id = (select folder_id from public.counsel_uploads_folder
                 where deal_id = 'cf000000-0000-0000-0000-0000000000d1') $$,
  '23001',
  'This folder holds buyer''s counsel uploads and cannot be deleted',
  'nobody deletes the Buyer''s counsel folder while its deal exists'
);

select tests.login_as_service_role();
select is(
  public.dr_folder_count_below(public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1')),
  0,
  'a new uploads folder has nothing below it'
);
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
select 'cf000000-0000-0000-0000-0000000000e1', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1',
  public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1'), 'Redlines';
insert into public.dr_folder (account_id, deal_id, parent_id, name)
select tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', 'cf000000-0000-0000-0000-0000000000e1',
  'Round ' || n from generate_series(1, 1500) n;
select is(
  public.dr_folder_count_below(public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1')),
  1501,
  'every folder at any depth below counts, past one page of rows'
);
delete from public.dr_folder where parent_id = 'cf000000-0000-0000-0000-0000000000e1';
delete from public.dr_folder where id = 'cf000000-0000-0000-0000-0000000000e1';

select tests.login_as('cf_owner');
select throws_ok(
  $$ select public.dr_folder_count_below(gen_random_uuid()) $$,
  '42501',
  null,
  'only the server counts folders'
);

-- ---- The upload ledger is the server's alone ----

select tests.login_as('cf_buyer_law');

select throws_ok(
  $$ select 1 from public.counsel_upload $$,
  '42501',
  null,
  'counsel cannot read the upload ledger'
);

-- ---- What counsel open is tracked for the team ----

select tests.login_as_service_role();
insert into public.counsel_activity (account_id, deal_id, user_id, action, dr_document_id)
values (tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', tests.get_uid('cf_buyer_law'),
  'document_downloaded', gen_random_uuid());

select tests.login_as('cf_owner');
select results_eq(
  $$ select user_id, action::text from public.counsel_activity $$,
  $$ values (tests.get_uid('cf_buyer_law'), 'document_downloaded') $$,
  'the deal manager sees what counsel downloaded'
);

select tests.login_as('cf_member');
select is_empty(
  $$ select 1 from public.counsel_activity $$,
  'a team member without deals.manage does not'
);

select tests.login_as('cf_buyer_law');
select is_empty(
  $$ select 1 from public.counsel_activity $$,
  'counsel do not read the tracking'
);
select throws_ok(
  $$ insert into public.counsel_activity (account_id, deal_id, user_id, action, dr_document_id)
     values (tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', tests.get_uid('cf_buyer_law'),
       'document_downloaded', gen_random_uuid()) $$,
  '42501',
  null,
  'counsel cannot write the tracking'
);

-- ---- Files attached to seller questions ----

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name) values
  ('cf000000-0000-0000-0000-0000000000f1', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', null, 'Financials'),
  ('cf000000-0000-0000-0000-0000000000f2', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', null, 'Bank');
insert into public.lender_room (account_id, deal_id, name, private_folder_id)
values (tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', 'Bank', 'cf000000-0000-0000-0000-0000000000f2');
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path) values
  ('cf000000-0000-0000-0000-0000000000c1', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1',
    'cf000000-0000-0000-0000-0000000000f1', 'customers.xlsx', 'cf/customers.xlsx'),
  ('cf000000-0000-0000-0000-0000000000c2', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1',
    'cf000000-0000-0000-0000-0000000000f2', 'bank-only.pdf', 'cf/bank-only.pdf');

select tests.login_as('cf_owner');
select public.ensure_seller_room('cf000000-0000-0000-0000-0000000000d1');

reset role;
insert into public.seller_room_question (id, room_id, account_id, title)
select 'cf000000-0000-0000-0000-0000000000a1', r.id, tests.account_id('cf-team'), 'Customer list?'
from public.seller_room r where r.deal_id = 'cf000000-0000-0000-0000-0000000000d1';
insert into public.seller_room_question_file (question_id, dr_document_id, side) values
  ('cf000000-0000-0000-0000-0000000000a1', 'cf000000-0000-0000-0000-0000000000c1', 'seller'),
  ('cf000000-0000-0000-0000-0000000000a1', 'cf000000-0000-0000-0000-0000000000c2', 'internal');

select tests.login_as('cf_buyer_law');
select results_eq(
  $$ select question_id, dr_document_id, name from public.buyer_counsel_seller_question_files('cf000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('cf000000-0000-0000-0000-0000000000a1'::uuid, 'cf000000-0000-0000-0000-0000000000c1'::uuid, 'customers.xlsx') $$,
  'buyer''s counsel see the files on seller questions, except any in a lender room''s own folder'
);

select tests.login_as('cf_member');
select is_empty(
  $$ select 1 from public.buyer_counsel_seller_question_files('cf000000-0000-0000-0000-0000000000d1') $$,
  'only buyer''s counsel read through this function'
);

-- ---- Counsel folders never reach a seller room ----

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
select 'cf000000-0000-0000-0000-0000000000e2', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1',
  public.ensure_counsel_uploads_folder('cf000000-0000-0000-0000-0000000000d1'), 'Markups';

select tests.login_as('cf_owner');
select throws_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select r.id, f.id
     from public.seller_room r
     join public.dr_folder f on f.deal_id = r.deal_id and f.name = 'Buyer''s counsel'
     where r.deal_id = 'cf000000-0000-0000-0000-0000000000d1' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'the team cannot share the Buyer''s counsel folder into the seller room'
);
select throws_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select r.id, 'cf000000-0000-0000-0000-0000000000e2'
     from public.seller_room r where r.deal_id = 'cf000000-0000-0000-0000-0000000000d1' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'nor a folder inside it'
);
select lives_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select r.id, 'cf000000-0000-0000-0000-0000000000f1'
     from public.seller_room r where r.deal_id = 'cf000000-0000-0000-0000-0000000000d1' $$,
  'other data room folders still share into the seller room'
);

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name) values
  ('cf000000-0000-0000-0000-0000000000f3', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1', null, 'Legal'),
  ('cf000000-0000-0000-0000-0000000000f4', tests.account_id('cf-team'), 'cf000000-0000-0000-0000-0000000000d1',
    'cf000000-0000-0000-0000-0000000000f1', 'Shared below');

select tests.login_as('cf_owner');
select throws_ok(
  $$ update public.dr_folder set parent_id = 'cf000000-0000-0000-0000-0000000000f1'
     where deal_id = 'cf000000-0000-0000-0000-0000000000d1' and name = 'Buyer''s counsel' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'the Buyer''s counsel folder cannot move under a folder the seller sees'
);
select throws_ok(
  $$ update public.dr_folder set parent_id = 'cf000000-0000-0000-0000-0000000000f4'
     where id = 'cf000000-0000-0000-0000-0000000000e2' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'nor a folder inside it, at any depth below the shared folder'
);
select lives_ok(
  $$ update public.dr_folder set parent_id = 'cf000000-0000-0000-0000-0000000000f3'
     where deal_id = 'cf000000-0000-0000-0000-0000000000d1' and name = 'Buyer''s counsel' $$,
  'the Buyer''s counsel folder moves under a folder the seller does not see'
);
select throws_ok(
  $$ update public.dr_folder set parent_id = 'cf000000-0000-0000-0000-0000000000f1'
     where id = 'cf000000-0000-0000-0000-0000000000f3' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'a folder holding the Buyer''s counsel folder cannot move under a folder the seller sees'
);
select throws_ok(
  $$ update public.dr_folder set parent_id = (
       select uploads_folder_id from public.seller_room where deal_id = 'cf000000-0000-0000-0000-0000000000d1')
     where deal_id = 'cf000000-0000-0000-0000-0000000000d1' and name = 'Buyer''s counsel' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'the Buyer''s counsel folder cannot move into the seller room''s own uploads folder'
);

select * from finish();
rollback;
