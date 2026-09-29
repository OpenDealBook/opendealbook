begin;
select no_plan();

-- Build a 1536-dim unit vector that is 1 at `pos` and 0 elsewhere, so cosine
-- distance between two distinct positions is 1 and between equal positions 0.
create function pg_temp.unitvec(pos int)
  returns extensions.vector
  language sql as $$
  select ('[' || string_agg(case when g = pos then '1' else '0' end, ',') || ']')::extensions.vector
  from generate_series(1, 1536) g;
$$;

grant execute on function pg_temp.unitvec(int) to authenticated, service_role;

-- ---- Schema shape ----
select has_type('public', 'verification_severity', 'verification_severity enum exists');
select enum_has_labels('public', 'verification_severity',
  array['info', 'warning', 'error'], 'verification_severity carries its three labels');
select has_type('public', 'verification_run_status', 'verification_run_status enum exists');
select enum_has_labels('public', 'verification_run_status',
  array['queued', 'running', 'done', 'failed'], 'verification_run_status carries its four labels');
select has_type('public', 'verification_finding_status', 'verification_finding_status enum exists');
select enum_has_labels('public', 'verification_finding_status',
  array['open', 'resolved', 'dismissed'], 'verification_finding_status carries its three labels');

select has_table('public', 'verification_run', 'verification_run table exists');
select has_table('public', 'verification_finding', 'verification_finding table exists');
select col_default_is('public', 'verification_finding', 'status', 'open',
  'verification_finding.status defaults to open');
select has_column('public', 'llm_endpoint', 'chat_model',
  'llm_endpoint carries chat_model for the generation model');
select has_function('public', 'verification_finding_counts', array['uuid'],
  'verification_finding_counts(uuid) exists');
select has_function('public', 'match_document_chunks',
  array['uuid', 'extensions.vector', 'integer'], 'match_document_chunks RPC exists');

-- ---- Fixtures: two accounts, one deal on A, an external participant on A ----
select tests.create_user('vr_a_owner');
select tests.create_user('vr_b_owner');
select tests.create_user('vr_ext');

select tests.login_as_service_role();
select public.create_team_account('VR Acct A', tests.get_uid('vr_a_owner'), 'vr-acct-a');
select public.create_team_account('VR Acct B', tests.get_uid('vr_b_owner'), 'vr-acct-b');

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000a1', 'deal',
  'cccccccc-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('vr-acct-a'),
    'owner_user_id', tests.get_uid('vr_a_owner'), 'description', 'VR Deal A'), null, 'service');

insert into public.dr_folder (id, account_id, deal_id, name)
values ('cccccccc-0000-0000-0000-0000000000f1', tests.account_id('vr-acct-a'),
  'cccccccc-0000-0000-0000-0000000000a1', 'Root');

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000a1', 'dr_document',
  'cccccccc-0000-0000-0000-0000000000d1', 'dr_document.added',
  jsonb_build_object('folder_id', 'cccccccc-0000-0000-0000-0000000000f1', 'name', 'financials.pdf',
    'storage_path', 'deals/a/financials.pdf'), null, 'service');

insert into public.document_chunk (id, account_id, deal_id, document_id, chunk_index, content, embedding)
values
  ('cccccccc-0000-0000-0000-0000000000c1', tests.account_id('vr-acct-a'),
    'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000d1', 0, 'near chunk', pg_temp.unitvec(1)),
  ('cccccccc-0000-0000-0000-0000000000c2', tests.account_id('vr-acct-a'),
    'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000d1', 1, 'far chunk', pg_temp.unitvec(2));

select public.append_deal_event('cccccccc-0000-0000-0000-0000000000a1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('vr_ext'), 'party', 'buyer', 'scope', 'deal', 'permission', 'view'), null, 'service');

-- service_role produces the run and its findings (the verification runner path).
select lives_ok(
  $$ insert into public.verification_run (id, account_id, deal_id, status, trigger)
     values ('cccccccc-0000-0000-0000-000000000011', tests.account_id('vr-acct-a'),
       'cccccccc-0000-0000-0000-0000000000a1', 'done', 'on_demand') $$,
  'service_role writes a verification_run');

select lives_ok(
  $$ insert into public.verification_finding (account_id, deal_id, run_id, check_key, severity)
     values
       (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000011', 'payroll_tax_vs_w2', 'error'),
       (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000011', 'payroll_tax_vs_w2', 'error'),
       (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000011', 'revenue_vs_dd_financials', 'warning'),
       (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000011', 'revenue_vs_dd_financials', 'info') $$,
  'service_role writes verification_finding rows');

-- ---- Deal-access member reads runs, findings, retrieves chunks ----
select tests.login_as('vr_a_owner');

select isnt_empty(
  $$ select 1 from public.verification_run where deal_id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a deal-access member reads verification_run rows on their deal');
select isnt_empty(
  $$ select 1 from public.verification_finding where deal_id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a deal-access member reads verification_finding rows on their deal');

select results_eq(
  $$ select error, warning, info from public.verification_finding_counts('cccccccc-0000-0000-0000-0000000000a1') $$,
  $$ values (2, 1, 1) $$,
  'verification_finding_counts totals findings by severity for the deal');

select throws_ok(
  $$ insert into public.verification_run (account_id, deal_id, status, trigger)
     values (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'queued', 'on_demand') $$,
  '42501', null,
  'authenticated cannot directly write a verification_run');
select throws_ok(
  $$ insert into public.verification_finding (account_id, deal_id, run_id, check_key, severity)
     values (tests.account_id('vr-acct-a'), 'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000011', 'payroll_tax_vs_w2', 'error') $$,
  '42501', null,
  'authenticated cannot directly write a verification_finding');

select is(
  (select count(*)::int from public.match_document_chunks('cccccccc-0000-0000-0000-0000000000a1', pg_temp.unitvec(1), 5)),
  2, 'match_document_chunks returns both deal chunks within match_count');
select is(
  (select id from public.match_document_chunks('cccccccc-0000-0000-0000-0000000000a1', pg_temp.unitvec(1), 5) limit 1),
  'cccccccc-0000-0000-0000-0000000000c1'::uuid,
  'match_document_chunks orders by cosine distance, nearest first');

-- ---- External participant reaches the granted deal ----
select tests.login_as('vr_ext');

select isnt_empty(
  $$ select 1 from public.verification_finding where deal_id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a deal participant reads verification_finding rows on their granted deal');
select is(
  (select count(*)::int from public.match_document_chunks('cccccccc-0000-0000-0000-0000000000a1', pg_temp.unitvec(1), 5)),
  2, 'a participant retrieves chunks on their granted deal');

-- ---- Foreign account member is denied ----
select tests.login_as('vr_b_owner');

select is_empty(
  $$ select 1 from public.verification_run where deal_id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a foreign account member cannot read another deal verification_run rows');
select is_empty(
  $$ select 1 from public.verification_finding where deal_id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a foreign account member cannot read another deal verification_finding rows');
select is(
  (select count(*)::int from public.match_document_chunks('cccccccc-0000-0000-0000-0000000000a1', pg_temp.unitvec(1), 5)),
  0, 'a foreign account member retrieves no chunks (RLS holds under security invoker)');

select * from finish();
rollback;
