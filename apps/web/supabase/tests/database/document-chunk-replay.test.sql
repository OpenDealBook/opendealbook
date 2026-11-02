begin;
select no_plan();

-- Deal r1 on account A holds one live document added through the event log,
-- with an indexed chunk and a finished embedding job.
select tests.create_user('dcr_owner');

select tests.login_as_service_role();
select public.create_team_account('DCR Acct', tests.get_uid('dcr_owner'), 'dcr-acct');

select public.append_deal_event('dcb00000-0000-0000-0000-0000000000d1', 'deal',
  'dcb00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dcr-acct'), 'firm_id', tests.create_firm(tests.account_id('dcr-acct')),
    'owner_user_id', tests.get_uid('dcr_owner'), 'description', 'Replay deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, name)
values ('dcb00000-0000-0000-0000-00000000f001', tests.account_id('dcr-acct'), 'dcb00000-0000-0000-0000-0000000000d1', 'Root');

select public.append_deal_event('dcb00000-0000-0000-0000-0000000000d1', 'dr_document',
  'dcb00000-0000-0000-0000-00000000d001', 'dr_document.added',
  jsonb_build_object('folder_id', 'dcb00000-0000-0000-0000-00000000f001', 'name', 'cim.pdf',
    'storage_path', 'deal/dcb00000-0000-0000-0000-0000000000d1/cim.pdf'), null, 'service');

insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content)
values (tests.account_id('dcr-acct'), 'dcb00000-0000-0000-0000-0000000000d1', 'dcb00000-0000-0000-0000-00000000d001', 0, 'cim');

insert into public.embedding_job (account_id, deal_id, dr_document_id, status)
values (tests.account_id('dcr-acct'), 'dcb00000-0000-0000-0000-0000000000d1', 'dcb00000-0000-0000-0000-00000000d001', 'done');

select public.replay_deal('dcb00000-0000-0000-0000-0000000000d1');

select results_eq(
  $$ select content from public.document_chunk where deal_id = 'dcb00000-0000-0000-0000-0000000000d1' $$,
  array['cim'],
  'a deal replay keeps the stored text of its documents'
);

select results_eq(
  $$ select dr_document_id from public.embedding_job where deal_id = 'dcb00000-0000-0000-0000-0000000000d1' $$,
  array['dcb00000-0000-0000-0000-00000000d001'::uuid],
  'a deal replay keeps the embedding jobs of its documents'
);

-- A chunk and a job whose document id has no dr_document row.
insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content)
values (tests.account_id('dcr-acct'), 'dcb00000-0000-0000-0000-0000000000d1', 'dcb00000-0000-0000-0000-00000000d0ff', 0, 'orphan');

insert into public.embedding_job (account_id, deal_id, dr_document_id, status)
values (tests.account_id('dcr-acct'), 'dcb00000-0000-0000-0000-0000000000d1', 'dcb00000-0000-0000-0000-00000000d0ff', 'done');

select tests.login_as('dcr_owner');
select results_eq(
  $$ select content from public.document_chunk $$,
  array['cim'],
  'the team reads the replayed document text and nothing of a missing document'
);

reset role;
select public.purge_removed_document_text();

select results_eq(
  $$ select document_id from public.document_chunk where deal_id = 'dcb00000-0000-0000-0000-0000000000d1' $$,
  array['dcb00000-0000-0000-0000-00000000d001'::uuid],
  'the purge deletes chunks of a missing document and keeps live ones'
);

select results_eq(
  $$ select dr_document_id from public.embedding_job where deal_id = 'dcb00000-0000-0000-0000-0000000000d1' $$,
  array['dcb00000-0000-0000-0000-00000000d001'::uuid],
  'the purge deletes embedding jobs of a missing document and keeps live ones'
);

select * from finish();
rollback;
