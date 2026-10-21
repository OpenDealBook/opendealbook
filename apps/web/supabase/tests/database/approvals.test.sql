begin;
select no_plan();

select tests.create_user('ap_owner');
select tests.create_user('ap_member');
select tests.create_user('ap_dealer');

select tests.login_as_service_role();
select public.create_team_account('AP Co', tests.get_uid('ap_owner'), 'ap-co');

reset role;

insert into public.roles (name, hierarchy_level) values ('ap_deal_manager', 50);
insert into public.role_permissions (role, permission) values ('ap_deal_manager', 'deals.manage');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('ap-co'), tests.get_uid('ap_member'), 'member'),
  (tests.account_id('ap-co'), tests.get_uid('ap_dealer'), 'ap_deal_manager');

insert into public.firm (id, account_id, name)
values
  ('a2000000-0000-0000-0000-0000000000f1', tests.account_id('ap-co'), 'Fit Plumbing'),
  ('a2000000-0000-0000-0000-0000000000f2', tests.account_id('ap-co'), 'Unfit Roofing'),
  ('a2000000-0000-0000-0000-0000000000f3', tests.account_id('ap-co'), 'Rejected Paving');

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model)
values
  ('a2000000-0000-0000-0000-0000000000e1', tests.account_id('ap-co'),
   'a2000000-0000-0000-0000-0000000000f1', true, array['Inside the deal box'], 'gpt-test'),
  ('a2000000-0000-0000-0000-0000000000e2', tests.account_id('ap-co'),
   'a2000000-0000-0000-0000-0000000000f2', false, array['Too small'], 'gpt-test'),
  ('a2000000-0000-0000-0000-0000000000e3', tests.account_id('ap-co'),
   'a2000000-0000-0000-0000-0000000000f3', false, array['Too far'], 'gpt-test');

insert into public.workflow (id, account_id, name)
values ('a2000000-0000-0000-0000-0000000000a1', tests.account_id('ap-co'), 'Vet firms');

insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('a2000000-0000-0000-0000-0000000000b1', tests.account_id('ap-co'),
  'a2000000-0000-0000-0000-0000000000a1', 2,
  '{"nodes": [{"id": "decide", "type": "decision_model", "config": {}}, {"id": "ask", "type": "approval", "config": {}}], "edges": []}',
  now(), tests.get_uid('ap_owner'));

insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values ('a2000000-0000-0000-0000-0000000000c1', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000a1',
  'a2000000-0000-0000-0000-0000000000b1', 'manual', 'click-1', 'start');

insert into public.workflow_step_run (id, account_id, run_id, node_id, status, waiting_on, idempotency_key, output)
values
  ('a2000000-0000-0000-0000-0000000000d1', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'decide', 'waiting', 'decision', 'run-c1:decide:0', '{"verdictId": "a2000000-0000-0000-0000-0000000000e1"}'),
  ('a2000000-0000-0000-0000-0000000000d2', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'decide', 'waiting', 'decision', 'run-c1:decide:1', '{"verdictId": "a2000000-0000-0000-0000-0000000000e2"}'),
  ('a2000000-0000-0000-0000-0000000000d3', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'decide', 'waiting', 'decision', 'run-c1:decide:2', '{"verdictId": "a2000000-0000-0000-0000-0000000000e3"}'),
  ('a2000000-0000-0000-0000-0000000000d4', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'ask', 'waiting', 'decision', 'run-c1:ask:0', '{"verdictId": "a2000000-0000-0000-0000-0000000000e3"}'),
  ('a2000000-0000-0000-0000-0000000000d5', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'decide', 'running', null, 'run-c1:decide:3', '{"verdictId": "a2000000-0000-0000-0000-0000000000e3"}'),
  ('a2000000-0000-0000-0000-0000000000d6', tests.account_id('ap-co'), 'a2000000-0000-0000-0000-0000000000c1',
   'decide', 'waiting', 'cap', 'run-c1:decide:4', '{"verdictId": "a2000000-0000-0000-0000-0000000000e3"}');

update public.workflow_run set status = 'awaiting_approval' where id = 'a2000000-0000-0000-0000-0000000000c1';

select tests.login_as('ap_member');

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d1', 'a2000000-0000-0000-0000-0000000000e1', true) $$,
  '42501', null,
  'a member cannot decide a verdict'
);

select tests.login_as('ap_dealer');

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('a2000000-0000-0000-0000-0000000000d1', tests.account_id('ap-co'), true) $$,
  '42501', null,
  'a verdict step is not decided as a plain approval'
);

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d6', 'a2000000-0000-0000-0000-0000000000e3', false) $$,
  '42501', null,
  'a verdict step parked at the AI cap cannot be decided'
);

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d1', 'a2000000-0000-0000-0000-0000000000e3', false) $$,
  '22023', null,
  'a verdict can only be decided on the step that waits on it'
);

select is_empty(
  $$ select 1 from public.workflow_approval where step_run_id = 'a2000000-0000-0000-0000-0000000000d1' $$,
  'a mismatched verdict leaves the step undecided'
);

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d4', 'a2000000-0000-0000-0000-0000000000e3', false) $$,
  '22023', null,
  'a plain approval step is not decided as a verdict'
);

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d5', 'a2000000-0000-0000-0000-0000000000e3', false) $$,
  '42501', null,
  'a decision step that is not waiting cannot be decided'
);

select lives_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d1', 'a2000000-0000-0000-0000-0000000000e1', true) $$,
  'a deal manager approves a fit verdict'
);

select is(
  (select approved_by from public.firm_verdict_approval where verdict_id = 'a2000000-0000-0000-0000-0000000000e1'),
  tests.get_uid('ap_dealer'),
  'the verdict approval names the deal manager'
);

select is(
  (select row(approved, decided_by)::text from public.workflow_approval
   where step_run_id = 'a2000000-0000-0000-0000-0000000000d1'),
  row(true, tests.get_uid('ap_dealer'))::text,
  'the waiting step is decided approved by the same deal manager'
);

select throws_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d2', 'a2000000-0000-0000-0000-0000000000e2', true) $$,
  '23514', null,
  'approving a not-fit verdict without a reason is refused'
);

select is_empty(
  $$ select 1 from public.workflow_approval where step_run_id = 'a2000000-0000-0000-0000-0000000000d2' $$,
  'a refused override leaves the step undecided'
);

select lives_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d2', 'a2000000-0000-0000-0000-0000000000e2', true,
       'Owner is retiring this year') $$,
  'a deal manager overrides a not-fit verdict with a reason'
);

select is(
  (select body from public.decision_fact where verdict_id = 'a2000000-0000-0000-0000-0000000000e2'),
  'Owner is retiring this year',
  'the override reason becomes a team fact'
);

select lives_ok(
  $$ select public.decide_firm_verdict('a2000000-0000-0000-0000-0000000000d3', 'a2000000-0000-0000-0000-0000000000e3', false) $$,
  'a deal manager rejects a verdict'
);

select is(
  (select approved from public.workflow_approval where step_run_id = 'a2000000-0000-0000-0000-0000000000d3'),
  false,
  'a rejection decides the step rejected'
);

select is_empty(
  $$ select 1 from public.firm_verdict_approval where verdict_id = 'a2000000-0000-0000-0000-0000000000e3' $$,
  'a rejected verdict is not approved'
);

select lives_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('a2000000-0000-0000-0000-0000000000d4', tests.account_id('ap-co'), true) $$,
  'a deal manager decides a plain approval step waiting for a decision'
);

select * from finish();
rollback;
