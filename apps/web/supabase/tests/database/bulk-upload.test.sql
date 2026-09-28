begin;
select no_plan();

-- Schema shape: the staging tables and their key columns exist.
select has_table('public', 'upload_batch', 'upload_batch table exists');
select has_table('public', 'upload_item', 'upload_item table exists');
select has_column('public', 'upload_batch', 'kind', 'upload_batch carries kind');
select has_column('public', 'upload_batch', 'status', 'upload_batch carries status');
select has_column('public', 'upload_batch', 'source_filename', 'upload_batch carries source_filename');
select has_column('public', 'upload_item', 'batch_id', 'upload_item carries batch_id');
select has_column('public', 'upload_item', 'storage_path', 'upload_item carries storage_path');
select has_column('public', 'upload_item', 'target_folder_id', 'upload_item carries target_folder_id');
select has_column('public', 'upload_item', 'dr_document_id', 'upload_item carries dr_document_id');

-- Two teams and an external participant granted on Deal A only.
select tests.create_user('ub_a_owner');
select tests.create_user('ub_b_owner');
select tests.create_user('ub_ext');

select tests.login_as_service_role();
select public.create_team_account('UB Acct A', tests.get_uid('ub_a_owner'), 'ub-acct-a');
select public.create_team_account('UB Acct B', tests.get_uid('ub_b_owner'), 'ub-acct-b');

select public.append_deal_event('bbbbbbbb-0000-0000-0000-0000000000e2', 'deal',
  'bbbbbbbb-0000-0000-0000-0000000000e2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ub-acct-a'), 'owner_user_id', tests.get_uid('ub_a_owner'),
    'description', 'Deal A'), null, 'service');

insert into public.dr_folder (id, account_id, deal_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000fd1', tests.account_id('ub-acct-a'), 'bbbbbbbb-0000-0000-0000-0000000000e2', 'Root');

select public.append_deal_event('bbbbbbbb-0000-0000-0000-0000000000e2', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('ub_ext'), 'party', 'buyer', 'scope', 'deal', 'permission', 'view'), null, 'service');

-- The extraction worker (service_role) stages a zip upload and one item.
insert into public.upload_batch (id, account_id, deal_id, kind, status, source_filename)
values ('bbbbbbbb-0000-0000-0000-000000000ba1', tests.account_id('ub-acct-a'),
  'bbbbbbbb-0000-0000-0000-0000000000e2', 'zip', 'pending', 'diligence.zip');

insert into public.upload_item (batch_id, storage_path, original_path)
values ('bbbbbbbb-0000-0000-0000-000000000ba1', 'staging/a/diligence.zip/1.pdf', 'financials/2023.pdf');

-- A status outside the batch enum is rejected.
select throws_ok(
  $$ insert into public.upload_batch (account_id, deal_id, kind, status)
     values (tests.account_id('ub-acct-a'), 'bbbbbbbb-0000-0000-0000-0000000000e2', 'zip', 'archived') $$,
  '22P02',
  null,
  'upload_batch.status rejects a value outside its enum'
);

-- ---- Deal-access member reaches their batch and items ----
select tests.login_as('ub_ext');
select isnt_empty(
  $$ select 1 from public.upload_batch where deal_id = 'bbbbbbbb-0000-0000-0000-0000000000e2' $$,
  'a participant reads upload_batch rows on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.upload_item where batch_id = 'bbbbbbbb-0000-0000-0000-000000000ba1' $$,
  'a participant reads upload_item rows on their granted deal'
);

-- ---- Account owner reaches their account's batch ----
select tests.login_as('ub_a_owner');
select isnt_empty(
  $$ select 1 from public.upload_batch where deal_id = 'bbbbbbbb-0000-0000-0000-0000000000e2' $$,
  'an account member reads upload_batch rows on their own account'
);

-- ---- Non-participant on a foreign account is denied ----
select tests.login_as('ub_b_owner');
select is_empty(
  $$ select 1 from public.upload_batch where deal_id = 'bbbbbbbb-0000-0000-0000-0000000000e2' $$,
  'a non-participant does not see another account upload_batch rows'
);
select is_empty(
  $$ select 1 from public.upload_item where batch_id = 'bbbbbbbb-0000-0000-0000-000000000ba1' $$,
  'a non-participant does not see another account upload_item rows'
);

select * from finish();
rollback;
