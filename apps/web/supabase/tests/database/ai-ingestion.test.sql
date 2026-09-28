begin;
select no_plan();

-- Schema shape.
select has_table('public', 'embedding_job', 'embedding_job table exists');
select has_column('public', 'embedding_job', 'dr_document_id', 'embedding_job carries dr_document_id');
select has_column('public', 'embedding_job', 'status', 'embedding_job carries status');
select has_column('public', 'embedding_job', 'chunk_count', 'embedding_job carries chunk_count');
select has_column('public', 'embedding_job', 'model', 'embedding_job carries model');

-- The RAG retrieval index exists and is an ivfflat index over the embedding.
select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'document_chunk'
      and indexname = 'ix_document_chunk_embedding'
      and indexdef ilike '%ivfflat%'
  ),
  'document_chunk has an ivfflat index over embedding for RAG retrieval'
);

-- Two teams and an external participant granted on Deal A only.
select tests.create_user('ej_a_owner');
select tests.create_user('ej_b_owner');
select tests.create_user('ej_ext');

select tests.login_as_service_role();
select public.create_team_account('EJ Acct A', tests.get_uid('ej_a_owner'), 'ej-acct-a');
select public.create_team_account('EJ Acct B', tests.get_uid('ej_b_owner'), 'ej-acct-b');

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000e2', 'deal',
  'cccccccc-0000-0000-0000-0000000000e2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ej-acct-a'), 'owner_user_id', tests.get_uid('ej_a_owner'),
    'description', 'Deal A'), null, 'service');

insert into public.dr_folder (id, account_id, deal_id, name)
values ('cccccccc-0000-0000-0000-000000000fd1', tests.account_id('ej-acct-a'), 'cccccccc-0000-0000-0000-0000000000e2', 'Root');

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000e2', 'dr_document',
  'cccccccc-0000-0000-0000-000000000dc1', 'dr_document.added',
  jsonb_build_object('folder_id', 'cccccccc-0000-0000-0000-000000000fd1', 'name', 'financials.pdf',
    'storage_path', 'deals/a/financials.pdf'), null, 'service');

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000e2', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('ej_ext'), 'party', 'buyer', 'scope', 'deal', 'permission', 'view'), null, 'service');

insert into public.embedding_job (account_id, deal_id, dr_document_id, status, model)
values (tests.account_id('ej-acct-a'), 'cccccccc-0000-0000-0000-0000000000e2',
  'cccccccc-0000-0000-0000-000000000dc1', 'queued', 'text-embedding-3-small');

-- A status outside the enum is rejected.
select throws_ok(
  $$ insert into public.embedding_job (account_id, deal_id, dr_document_id, status)
     values (tests.account_id('ej-acct-a'), 'cccccccc-0000-0000-0000-0000000000e2',
       'cccccccc-0000-0000-0000-000000000dc1', 'paused') $$,
  '22P02',
  null,
  'embedding_job.status rejects a value outside its enum'
);

-- ---- Deal-access member reaches jobs on their deal (mirrors document_chunk) ----
select tests.login_as('ej_ext');
select isnt_empty(
  $$ select 1 from public.embedding_job where deal_id = 'cccccccc-0000-0000-0000-0000000000e2' $$,
  'a participant reads embedding_job rows on their granted deal'
);

select tests.login_as('ej_a_owner');
select isnt_empty(
  $$ select 1 from public.embedding_job where deal_id = 'cccccccc-0000-0000-0000-0000000000e2' $$,
  'an account member reads embedding_job rows on their own account'
);

-- ---- Foreign account member is denied ----
select tests.login_as('ej_b_owner');
select is_empty(
  $$ select 1 from public.embedding_job where deal_id = 'cccccccc-0000-0000-0000-0000000000e2' $$,
  'a foreign account member does not see another account embedding_job rows'
);

select * from finish();
rollback;
