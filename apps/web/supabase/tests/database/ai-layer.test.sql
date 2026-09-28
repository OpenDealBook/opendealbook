begin;
select no_plan();

-- Schema shape: the account flag and the vector column exist.
select has_column('public', 'accounts', 'ai_redaction_enabled', 'accounts carries ai_redaction_enabled');
select has_column('public', 'document_chunk', 'embedding', 'document_chunk carries an embedding column');
select has_table('public', 'llm_endpoint', 'llm_endpoint table exists');
select has_table('public', 'ai_call_log', 'ai_call_log table exists');

-- meeting.status is constrained to the meeting_status enum with its four labels.
select has_type('public', 'meeting_status', 'meeting_status enum type exists');
select enum_has_labels(
  'public', 'meeting_status',
  array['scheduled', 'held', 'skipped', 'cancelled'],
  'meeting_status carries the four scheduling labels'
);
select col_type_is('public', 'meeting', 'status', 'meeting_status', 'meeting.status uses the meeting_status enum');

-- Two teams and an external participant granted on Deal A only.
select tests.create_user('ai_a_owner');
select tests.create_user('ai_b_owner');
select tests.create_user('ai_ext');

select tests.login_as_service_role();
select public.create_team_account('AI Acct A', tests.get_uid('ai_a_owner'), 'ai-acct-a');
select public.create_team_account('AI Acct B', tests.get_uid('ai_b_owner'), 'ai-acct-b');

select is(
  (select ai_redaction_enabled from public.accounts where slug = 'ai-acct-a'),
  false,
  'ai_redaction_enabled defaults to false on a new account'
);

insert into public.deal (id, account_id, owner_user_id, description)
values ('aaaaaaaa-0000-0000-0000-0000000000e2', tests.account_id('ai-acct-a'), tests.get_uid('ai_a_owner'), 'Deal A');

insert into public.dr_folder (id, account_id, deal_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000fd1', tests.account_id('ai-acct-a'), 'aaaaaaaa-0000-0000-0000-0000000000e2', 'Root');

insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values ('aaaaaaaa-0000-0000-0000-000000000dc1', tests.account_id('ai-acct-a'), 'aaaaaaaa-0000-0000-0000-0000000000e2',
  'aaaaaaaa-0000-0000-0000-000000000fd1', 'financials.pdf', 'deals/a/financials.pdf');

insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content)
values (tests.account_id('ai-acct-a'), 'aaaaaaaa-0000-0000-0000-0000000000e2',
  'aaaaaaaa-0000-0000-0000-000000000dc1', 0, 'quarterly financials workpapers');

insert into public.deal_participant (deal_id, user_id, party, scope, permission)
values ('aaaaaaaa-0000-0000-0000-0000000000e2', tests.get_uid('ai_ext'), 'buyer', 'deal', 'view');

-- A status outside the enum is rejected.
select throws_ok(
  $$ insert into public.meeting (deal_id, account_id, type, status)
     values ('aaaaaaaa-0000-0000-0000-0000000000e2', tests.account_id('ai-acct-a'), 'weekly', 'postponed') $$,
  '22P02',
  null,
  'meeting.status rejects a value outside the meeting_status enum'
);

-- Calls are logged server-side; service_role writes the audit row.
select lives_ok(
  $$ insert into public.ai_call_log (account_id, model, prompt_tokens, completion_tokens)
     values (tests.account_id('ai-acct-a'), 'claude-opus-4-8', 120, 40) $$,
  'service_role can write an ai_call_log entry'
);

-- ---- Owner (settings.manage) configures an endpoint and reads the audit ----
select tests.login_as('ai_a_owner');

select lives_ok(
  $$ insert into public.llm_endpoint (account_id, provider, model)
     values (tests.account_id('ai-acct-a'), 'anthropic', 'claude-opus-4-8') $$,
  'an owner with settings.manage can create an llm_endpoint'
);
select throws_ok(
  $$ insert into public.ai_call_log (account_id, model, prompt_tokens, completion_tokens)
     values (tests.account_id('ai-acct-a'), 'claude-opus-4-8', 10, 5) $$,
  '42501',
  null,
  'an authenticated member cannot write an ai_call_log entry'
);
select isnt_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('ai-acct-a') $$,
  'a settings.manage holder reads their own account ai_call_log rows'
);
select isnt_empty(
  $$ select 1 from public.llm_endpoint where account_id = tests.account_id('ai-acct-a') $$,
  'a member reads their own account llm_endpoint rows'
);
select isnt_empty(
  $$ select 1 from public.document_chunk where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e2' $$,
  'a member reads document chunks on their own deal'
);

-- ---- Foreign account member is denied ----
select tests.login_as('ai_b_owner');

select is_empty(
  $$ select 1 from public.llm_endpoint where account_id = tests.account_id('ai-acct-a') $$,
  'a foreign account member cannot read another account llm_endpoint rows'
);
select is_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('ai-acct-a') $$,
  'a foreign account member cannot read another account ai_call_log rows'
);
select is_empty(
  $$ select 1 from public.document_chunk where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e2' $$,
  'a foreign account member cannot read another account document chunks'
);
select throws_ok(
  $$ insert into public.llm_endpoint (account_id, provider, model)
     values (tests.account_id('ai-acct-a'), 'anthropic', 'claude-opus-4-8') $$,
  '42501',
  null,
  'a foreign account member cannot create an llm_endpoint on another account'
);

-- ---- Participant reaches document chunks on the granted deal ----
select tests.login_as('ai_ext');

select isnt_empty(
  $$ select 1 from public.document_chunk where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e2' $$,
  'a participant reads document chunks on their granted deal'
);
select is_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('ai-acct-a') $$,
  'a deal participant without settings.manage cannot read ai_call_log rows'
);

select * from finish();
rollback;
