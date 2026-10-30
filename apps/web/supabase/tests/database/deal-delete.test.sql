begin;
select no_plan();

-- Team "DD Team" belongs to dd_owner. dd_cohost holds the owner role without
-- being the primary owner. dd_lender, dd_seller and dd_buyer_law are outside
-- parties on deal d1; dd_seller_law is seller's counsel on d3 and d4.
select tests.create_user('dd_owner');
select tests.create_user('dd_cohost');
select tests.create_user('dd_lender');
select tests.create_user('dd_seller');
select tests.create_user('dd_buyer_law');
select tests.create_user('dd_seller_law');
select tests.create_user('dd_stranger');

select tests.login_as_service_role();
select public.create_team_account('DD Team', tests.get_uid('dd_owner'), 'dd-team');

reset role;
update public.accounts set timezone = 'America/New_York' where id = tests.account_id('dd-team');
insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('dd_cohost'), tests.account_id('dd-team'), 'owner');

insert into public.firm (id, account_id, name) values
  ('de000000-0000-0000-0000-00000000f001', tests.account_id('dd-team'), 'Harbor Plumbing'),
  ('de000000-0000-0000-0000-00000000f002', tests.account_id('dd-team'), 'Live Bakery'),
  ('de000000-0000-0000-0000-00000000f003', tests.account_id('dd-team'), 'Recent Dental'),
  ('de000000-0000-0000-0000-00000000f004', tests.account_id('dd-team'), 'Old Dental');

select tests.login_as_service_role();
select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dd-team'), 'firm_id', d.firm_id,
    'owner_user_id', tests.get_uid('dd_owner'), 'description', 'Deal to delete'), null, 'service')
from (values
  ('de000000-0000-0000-0000-0000000000d1'::uuid, 'de000000-0000-0000-0000-00000000f001'::uuid),
  ('de000000-0000-0000-0000-0000000000d2'::uuid, 'de000000-0000-0000-0000-00000000f002'::uuid),
  ('de000000-0000-0000-0000-0000000000d3'::uuid, 'de000000-0000-0000-0000-00000000f003'::uuid),
  ('de000000-0000-0000-0000-0000000000d4'::uuid, 'de000000-0000-0000-0000-00000000f004'::uuid)
) as d (id, firm_id);

select public.append_deal_event(d.id, 'deal', d.id, 'deal.archived', '{}'::jsonb, null, 'service')
from unnest(array['de000000-0000-0000-0000-0000000000d1', 'de000000-0000-0000-0000-0000000000d3',
  'de000000-0000-0000-0000-0000000000d4']::uuid[]) as d (id);

reset role;
update public.deal set code_name = 'Project Pipe' where id = 'de000000-0000-0000-0000-0000000000d1';
update public.deal set archived_at = '2027-01-15 12:00:00+00' where id = 'de000000-0000-0000-0000-0000000000d3';
update public.deal set archived_at = now() - interval '2 years' where id = 'de000000-0000-0000-0000-0000000000d4';

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('de000000-0000-0000-0000-0000000000a1', tests.account_id('dd-team'),
  'de000000-0000-0000-0000-0000000000d1', null, 'Lender private');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('de000000-0000-0000-0000-0000000000b1', tests.account_id('dd-team'),
  'de000000-0000-0000-0000-0000000000d1', 'First Bank', 'de000000-0000-0000-0000-0000000000a1');
insert into public.lender_room_member (room_id, user_id, email)
values ('de000000-0000-0000-0000-0000000000b1', tests.get_uid('dd_lender'), 'dd_lender@opendealbook.test');

select tests.login_as('dd_owner');
select public.ensure_seller_room('de000000-0000-0000-0000-0000000000d1');
reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('dd_seller'), 'dd_seller@opendealbook.test', 'Sam Seller'
from public.seller_room where deal_id = 'de000000-0000-0000-0000-0000000000d1';

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('dd_buyer_law'), 'dd_buyer_law@opendealbook.test', 'Bea Law'),
  (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d3', 'seller',
    tests.get_uid('dd_seller_law'), 'dd_seller_law@opendealbook.test', 'Owen Law'),
  (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d4', 'seller',
    tests.get_uid('dd_seller_law'), 'dd_seller_law@opendealbook.test', 'Owen Law');

insert into storage.objects (bucket_id, name) values
  ('data-room', 'deal/de000000-0000-0000-0000-0000000000d1/1-p-and-l.pdf'),
  ('data-room', 'deal/de000000-0000-0000-0000-0000000000d2/1-kept.pdf'),
  ('meeting-recordings', 'deal/de000000-0000-0000-0000-0000000000d1/2-call.mp3'),
  ('seller-counsel-thread', 'de000000-0000-0000-0000-0000000000d1/m1/memo.pdf');

insert into public.contract (id, deal_id, account_id, type)
values ('de000000-0000-0000-0000-0000000000c1', 'de000000-0000-0000-0000-0000000000d1', tests.account_id('dd-team'), 'loi');
-- Version 2 and the second generated document carry paths planted under
-- another team's folder; the delete must never hand those back for removal.
insert into public.contract_version (contract_id, account_id, version, source, party, docx_path, docx_bucket, pdf_path, pdf_bucket)
values
  ('de000000-0000-0000-0000-0000000000c1', tests.account_id('dd-team'), 1, 'generated', 'buyer',
    tests.account_id('dd-team') || '/gen-1/loi.docx', 'generated', tests.account_id('dd-team') || '/c1/v1.pdf', 'contracts'),
  ('de000000-0000-0000-0000-0000000000c1', tests.account_id('dd-team'), 2, 'upload', 'buyer',
    'ffffffff-0000-0000-0000-000000000001/other/v1.docx', 'contracts', 'ffffffff-0000-0000-0000-000000000001/other/v1.pdf', 'contracts');
insert into public.generated_document (account_id, deal_id, docx_path, pdf_path)
values
  (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d1', tests.account_id('dd-team') || '/gen-1/loi.docx', null),
  (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d1',
    'ffffffff-0000-0000-0000-000000000001/gen-9/apa.docx', 'deal/de000000-0000-0000-0000-0000000000d1/apa.pdf');

insert into public.workflow (id, account_id, name)
values ('de000000-0000-0000-0000-0000000000e1', tests.account_id('dd-team'), 'Deal follow-up');
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('de000000-0000-0000-0000-0000000000e2', tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000e1', 2,
  '{"nodes": [], "edges": []}', now(), tests.get_uid('dd_owner'));
insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id,
  trigger_output, status, finished_at)
values
  ('de000000-0000-0000-0000-000000000ea1', tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000e1',
    'de000000-0000-0000-0000-0000000000e2', 'manual', 'live', 'start',
    '{"dealId": "de000000-0000-0000-0000-0000000000d1"}', 'waiting', null),
  ('de000000-0000-0000-0000-000000000ea2', tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000e1',
    'de000000-0000-0000-0000-0000000000e2', 'manual', 'done', 'start',
    '{"dealId": "de000000-0000-0000-0000-0000000000d1"}', 'succeeded', now()),
  ('de000000-0000-0000-0000-000000000ea3', tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000e1',
    'de000000-0000-0000-0000-0000000000e2', 'manual', 'search', 'start', '{}', 'running', null),
  ('de000000-0000-0000-0000-000000000ea4', tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000e1',
    'de000000-0000-0000-0000-0000000000e2', 'manual', 'other-deal', 'start',
    '{"dealId": "de000000-0000-0000-0000-0000000000d2"}', 'running', null);
insert into public.diligence_run (account_id, deal_id, workflow_run_id)
values (tests.account_id('dd-team'), 'de000000-0000-0000-0000-0000000000d1', 'de000000-0000-0000-0000-000000000ea3');

-- ---- Refusals ----

select tests.login_as('dd_stranger');
select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d1', 'Harbor Plumbing') $$,
  'ODB02', 'This deal no longer exists.',
  'someone off the team probing a real deal id learns nothing about it'
);

select tests.login_as('dd_cohost');
select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d1', 'Harbor Plumbing') $$,
  'ODB02', 'Only the team owner can delete deals.',
  'a member holding the owner role is not the team owner'
);

select tests.login_as('dd_owner');
select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d9', 'Gone Bakery') $$,
  'ODB02', 'This deal no longer exists.',
  'a deal that is already gone is refused'
);

select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d2', 'Live Bakery') $$,
  'ODB02', 'Archive the deal before deleting it.',
  'a deal that is not archived is refused'
);

select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d1', 'harbor plumbing') $$,
  'ODB02', 'The name you typed does not match this deal.',
  'a typed name that does not match the deal name is refused'
);

select throws_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d3', 'Recent Dental') $$,
  'ODB02', 'Seller''s counsel can read this deal until January 15, 2028. You can delete it after that.',
  'an open seller''s counsel read window is refused with the date it ends'
);

-- ---- The delete ----

-- Inviting a lender, seller or counsel writes their member row at once; until
-- they first sign in that row is their pending invitation.
reset role;
update auth.users set last_sign_in_at = now() where id = tests.get_uid('dd_seller');
select is(
  (select count(*)::int from auth.users
   where id in (tests.get_uid('dd_lender'), tests.get_uid('dd_buyer_law')) and last_sign_in_at is null),
  2,
  'the lender and buyer''s counsel were invited and never signed in'
);
select tests.login_as('dd_owner');

create temp table dd_result as
select public.delete_deal('de000000-0000-0000-0000-0000000000d1', 'Harbor Plumbing') as result;

reset role;

select is(
  (select count(*)::int from public.deal where id = 'de000000-0000-0000-0000-0000000000d1'),
  0,
  'the deal is gone'
);

select is(
  (select count(*)::int from public.deal_event where deal_id = 'de000000-0000-0000-0000-0000000000d1'),
  0,
  'its events went with it'
);

select is(
  (select count(*)::int from public.firm where id = 'de000000-0000-0000-0000-00000000f001'),
  1,
  'its firm is kept'
);

select bag_eq(
  $$ select f ->> 'bucket' as bucket, f ->> 'path' as path
     from dd_result, jsonb_array_elements(result -> 'files') f $$,
  $$ values
       ('data-room', 'deal/de000000-0000-0000-0000-0000000000d1/1-p-and-l.pdf'),
       ('meeting-recordings', 'deal/de000000-0000-0000-0000-0000000000d1/2-call.mp3'),
       ('seller-counsel-thread', 'de000000-0000-0000-0000-0000000000d1/m1/memo.pdf'),
       ('generated', tests.account_id('dd-team') || '/gen-1/loi.docx'),
       ('contracts', tests.account_id('dd-team') || '/c1/v1.pdf') $$,
  'it returns every stored file of the deal once each, and no path outside the team''s own folder'
);

select bag_eq(
  $$ select r::uuid from dd_result, jsonb_array_elements_text(result -> 'run_ids') r $$,
  $$ values ('de000000-0000-0000-0000-000000000ea1'::uuid), ('de000000-0000-0000-0000-000000000ea3'::uuid) $$,
  'it returns the deal''s unfinished workflow and diligence runs'
);

select bag_eq(
  $$ select r ->> 'user_id' as user_id, r ->> 'email' as email, r ->> 'deal_name' as deal_name
     from dd_result, jsonb_array_elements(result -> 'recipients') r $$,
  $$ values
       (tests.get_uid('dd_lender')::text, 'dd_lender@opendealbook.test', 'Project Pipe'),
       (tests.get_uid('dd_seller')::text, 'dd_seller@opendealbook.test', 'Harbor Plumbing'),
       (tests.get_uid('dd_buyer_law')::text, 'dd_buyer_law@opendealbook.test', 'Project Pipe') $$,
  'it returns the lenders, sellers and counsel to tell, each with the name they know the deal by'
);

select is(
  (select result - 'files' - 'run_ids' - 'recipients' from dd_result),
  jsonb_build_object(
    'account_id', tests.account_id('dd-team'),
    'deal_id', 'de000000-0000-0000-0000-0000000000d1',
    'team_name', 'DD Team'),
  'it returns the team and deal it deleted from'
);

select results_eq(
  $$ select event_type, payload from public.account_event
     where account_id = tests.account_id('dd-team') and event_type = 'deal.deleted' $$,
  $$ values ('deal.deleted', jsonb_build_object(
       'deal_id', 'de000000-0000-0000-0000-0000000000d1',
       'deal_name', 'Harbor Plumbing',
       'deleted_by', tests.get_uid('dd_owner'))) $$,
  'the team log keeps a tombstone naming the deal and who deleted it'
);

select tests.login_as('dd_owner');
select lives_ok(
  $$ select public.delete_deal('de000000-0000-0000-0000-0000000000d4', 'Old Dental') $$,
  'a deal whose seller''s counsel read window has closed can be deleted'
);

-- ---- Cleanup that failed after the delete ----

select throws_ok(
  $$ select public.record_deal_delete_cleanup_failed(tests.account_id('dd-team'),
       'de000000-0000-0000-0000-0000000000d1', '{}'::jsonb) $$,
  '42501', null,
  'a signed-in user cannot write to the team log'
);

select tests.login_as_service_role();
select public.record_deal_delete_cleanup_failed(tests.account_id('dd-team'),
  'de000000-0000-0000-0000-0000000000d1',
  jsonb_build_object('files', jsonb_build_array(jsonb_build_object('bucket', 'data-room', 'path', 'deal/x/a.pdf'))));
reset role;

select results_eq(
  $$ select payload from public.account_event
     where account_id = tests.account_id('dd-team') and event_type = 'deal.delete_cleanup_failed' $$,
  $$ values (jsonb_build_object(
       'deal_id', 'de000000-0000-0000-0000-0000000000d1',
       'files', jsonb_build_array(jsonb_build_object('bucket', 'data-room', 'path', 'deal/x/a.pdf')))) $$,
  'the server records what it could not clean up after a delete'
);

select * from finish();
rollback;
