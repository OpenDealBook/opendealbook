begin;
select no_plan();

-- Team "CRT Team" owns deal d1 with an APA at version v1, under review.
select tests.create_user('crt_owner');

select tests.login_as_service_role();
select public.create_team_account('CRT Team', tests.get_uid('crt_owner'), 'crt-team');
select public.append_deal_event('c8000000-0000-0000-0000-0000000000d1', 'deal',
  'c8000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('crt-team'), 'firm_id', tests.create_firm(tests.account_id('crt-team')), 'owner_user_id', tests.get_uid('crt_owner'),
    'description', 'Reviewed deal'), null, 'service');

reset role;

insert into public.contract (id, deal_id, account_id, type, current_version)
values ('c8000000-0000-0000-0000-0000000000c1', 'c8000000-0000-0000-0000-0000000000d1', tests.account_id('crt-team'), 'apa', 1);

insert into public.contract_version (id, contract_id, account_id, version, source, party)
values ('c8000000-0000-0000-0000-0000000000a1', 'c8000000-0000-0000-0000-0000000000c1', tests.account_id('crt-team'), 1, 'upload', 'buyer');

insert into public.contract_review_request (id, account_id, contract_version_id, requested_by)
values ('c8000000-0000-0000-0000-0000000000f1', tests.account_id('crt-team'), 'c8000000-0000-0000-0000-0000000000a1', tests.get_uid('crt_owner'));

insert into public.personal_todo (id, account_id, user_id, title)
values
  ('c8000000-0000-0000-0000-00000000e001', tests.account_id('crt-team'), tests.get_uid('crt_owner'), 'Waiting A'),
  ('c8000000-0000-0000-0000-00000000e002', tests.account_id('crt-team'), tests.get_uid('crt_owner'), 'Waiting B');

-- ---- One waiting-on-counsel to-do per version, side and teammate ----
select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.contract_review_todo (contract_version_id, side, user_id, request_id, stage, todo_id)
     values ('c8000000-0000-0000-0000-0000000000a1', 'seller', tests.get_uid('crt_owner'),
       'c8000000-0000-0000-0000-0000000000f1', 'share', 'c8000000-0000-0000-0000-00000000e001') $$,
  'the job links a teammate''s to-do to a version and side'
);
select lives_ok(
  $$ insert into public.contract_review_todo (contract_version_id, side, user_id, request_id, stage, todo_id)
     values ('c8000000-0000-0000-0000-0000000000a1', 'buyer', tests.get_uid('crt_owner'),
       'c8000000-0000-0000-0000-0000000000f1', 'waiting', 'c8000000-0000-0000-0000-00000000e002') $$,
  'the other side has its own link'
);
select throws_ok(
  $$ insert into public.contract_review_todo (contract_version_id, side, user_id, request_id, stage, todo_id)
     values ('c8000000-0000-0000-0000-0000000000a1', 'seller', tests.get_uid('crt_owner'),
       'c8000000-0000-0000-0000-0000000000f1', 'waiting', null) $$,
  '23505', null, 'a teammate has one to-do per version and side'
);
select throws_ok(
  $$ update public.contract_review_todo set todo_id = null $$,
  '42501', null, 'a link is not edited'
);

select tests.login_as('crt_owner');
select throws_ok(
  $$ select 1 from public.contract_review_todo $$,
  '42501', null, 'signed-in users reach the table by no route'
);

reset role;
delete from public.personal_todo where id = 'c8000000-0000-0000-0000-00000000e001';
select results_eq(
  $$ select todo_id from public.contract_review_todo
     where contract_version_id = 'c8000000-0000-0000-0000-0000000000a1' and side = 'seller' $$,
  $$ values (null::uuid) $$,
  'a to-do deleted by hand leaves its link, so it is not made again'
);
delete from public.contract_review_request where id = 'c8000000-0000-0000-0000-0000000000f1';
select is_empty(
  $$ select 1 from public.contract_review_todo
     where contract_version_id = 'c8000000-0000-0000-0000-0000000000a1' $$,
  'links go with the request they were made for'
);
select ok(
  exists (select 1 from odb.billing_lock_exempt_tables where table_name = 'contract_review_todo'),
  'the table names why a locked team may still have it'
);

select * from finish();
rollback;
