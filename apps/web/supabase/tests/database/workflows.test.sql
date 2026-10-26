begin;
select no_plan();

select tests.create_user('wf_owner');
select tests.create_user('wf_admin');
select tests.create_user('wf_member');
select tests.create_user('wf_outsider');
select tests.create_user('wf_dealer');
select tests.create_user('wf_flow');

select tests.login_as_service_role();
select public.create_team_account('WF Co', tests.get_uid('wf_owner'), 'wf-co');
select public.create_team_account('WF Other', tests.get_uid('wf_outsider'), 'wf-other');

reset role;

insert into public.roles (name, hierarchy_level) values ('wf_deal_manager', 50), ('wf_flow_manager', 51);
insert into public.role_permissions (role, permission) values
  ('wf_deal_manager', 'deals.manage'),
  ('wf_flow_manager', 'workflows.manage');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('wf-co'), tests.get_uid('wf_admin'), 'admin'),
  (tests.account_id('wf-co'), tests.get_uid('wf_member'), 'member'),
  (tests.account_id('wf-co'), tests.get_uid('wf_dealer'), 'wf_deal_manager'),
  (tests.account_id('wf-co'), tests.get_uid('wf_flow'), 'wf_flow_manager');

insert into public.firm (id, account_id, name)
values ('f1000000-0000-0000-0000-0000000000f1', tests.account_id('wf-co'), 'Acme Plumbing');

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model)
values ('f1000000-0000-0000-0000-0000000000f2', tests.account_id('wf-co'),
  'f1000000-0000-0000-0000-0000000000f1', true, array['Inside the deal box'], 'gpt-test');

insert into public.workflow (id, account_id, name)
values ('f1000000-0000-0000-0000-0000000000a9', tests.account_id('wf-other'), 'Other team flow');

select ok(public.has_permission(tests.get_uid('wf_owner'), tests.account_id('wf-co'), 'workflows.manage'),
  'an owner manages workflows');
select ok(public.has_permission(tests.get_uid('wf_admin'), tests.account_id('wf-co'), 'workflows.manage'),
  'an admin manages workflows');
select ok(not public.has_permission(tests.get_uid('wf_member'), tests.account_id('wf-co'), 'workflows.manage'),
  'a member does not manage workflows');

insert into public.outreach_setting (account_id, daily_cap) values (tests.account_id('wf-co'), 10);

select is(
  (select row(lookup_monthly_cap, ai_monthly_cap)::text from public.outreach_setting
   where account_id = tests.account_id('wf-co')),
  '(0,0)',
  'lookup and AI monthly caps default to zero'
);

select tests.login_as('wf_member');

select throws_ok(
  $$ insert into public.workflow (account_id, name) values (tests.account_id('wf-co'), 'Sneaky') $$,
  '42501', null,
  'a member cannot create a workflow'
);

select tests.login_as('wf_owner');

insert into public.workflow (id, account_id, name)
values ('f1000000-0000-0000-0000-0000000000a1', tests.account_id('wf-co'), 'Nudge quiet lenders');

select is(
  (select enabled from public.workflow where id = 'f1000000-0000-0000-0000-0000000000a1'),
  false,
  'a new workflow starts disabled'
);

select throws_ok(
  $$ insert into public.workflow (account_id, name, system_key) values (tests.account_id('wf-co'), 'Fake', 'lender_nudge') $$,
  '42501', null,
  'a person cannot mark a workflow as a system job'
);

select throws_ok(
  $$ update public.workflow set enabled = true where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'a workflow with no published version cannot be enabled'
);

reset role;
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph)
values ('f1000000-0000-0000-0000-0000000000b1', tests.account_id('wf-co'),
  'f1000000-0000-0000-0000-0000000000a1', 1,
  '{"nodes": [{"id": "approve", "type": "approval"}, {"id": "vet", "type": "decision_model"}]}');

select throws_ok(
  $$ insert into public.workflow_version (account_id, workflow_id, schema_version, graph)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1', 1, '{}') $$,
  '23505', null,
  'a workflow has one draft at a time'
);
select tests.login_as('wf_owner');

select throws_ok(
  $$ update public.workflow_version set published_at = now(), published_by = tests.get_uid('wf_admin')
     where id = 'f1000000-0000-0000-0000-0000000000b1' $$,
  '42501', null,
  'a person publishes only under their own name'
);

reset role;
update public.workflow_version set published_at = now(), published_by = tests.get_uid('wf_owner')
where id = 'f1000000-0000-0000-0000-0000000000b1';
select tests.login_as('wf_owner');

reset role;
select throws_ok(
  $$ update public.workflow_version set graph = '{"nodes": [1]}' where id = 'f1000000-0000-0000-0000-0000000000b1' $$,
  '55000', null,
  'a published version cannot change'
);
select tests.login_as('wf_owner');

select is_empty(
  $$ delete from public.workflow_version where id = 'f1000000-0000-0000-0000-0000000000b1' returning id $$,
  'a published version cannot be deleted'
);

select lives_ok(
  $$ select public.save_workflow_draft('f1000000-0000-0000-0000-0000000000a1', '{"nodes": ["next"], "edges": []}', '{}') $$,
  'a new draft can follow a published version'
);

reset role;
update public.workflow_version set id = 'f1000000-0000-0000-0000-0000000000b2'
where workflow_id = 'f1000000-0000-0000-0000-0000000000a1' and published_at is null;
select tests.login_as('wf_owner');

select lives_ok(
  $$ update public.workflow set enabled = true where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  'a workflow with a published version can be enabled'
);

select throws_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'start', 'event') $$,
  '23514', null,
  'an event trigger names its event type'
);

select throws_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind, event_type)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'start', 'schedule', 'deal.created') $$,
  '23514', null,
  'only an event trigger names an event type'
);

select throws_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind, temporal_schedule_id)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'start', 'manual', 'sched-1') $$,
  '23514', null,
  'only a schedule trigger names a Temporal schedule'
);

select throws_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b2', 'start', 'manual') $$,
  '23514', null,
  'triggers derive only from a published version'
);

select lives_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind, event_type, filter)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'start', 'event', 'deal.created', '{"stage": "loi"}') $$,
  'a manager adds an event trigger to a published version'
);

select throws_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-1', 'start') $$,
  '42501', null,
  'runs are written only by the service role'
);

select tests.login_as('wf_member');

select throws_ok(
  $$ insert into public.workflow_trigger (account_id, workflow_id, version_id, node_id, kind)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'other', 'manual') $$,
  '42501', null,
  'a member cannot add a trigger'
);

select is_empty(
  $$ update public.workflow set name = 'Renamed' where id = 'f1000000-0000-0000-0000-0000000000a1' returning id $$,
  'a member cannot change a workflow'
);

select is((select count(*)::int from public.workflow), 1, 'a member reads only the team''s workflows');
select is((select count(*)::int from public.workflow_version), 2, 'a member reads the team''s versions');
select is((select count(*)::int from public.workflow_trigger), 1, 'a member reads the team''s triggers');

select tests.login_as_service_role();

select throws_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b2', 'manual', 'click-0', 'start') $$,
  '23514', null,
  'only a published version runs'
);

select throws_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a9',
       'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-x', 'start') $$,
  '23503', null,
  'a run cannot name another team''s workflow'
);

insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values ('f1000000-0000-0000-0000-0000000000c1', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
  'f1000000-0000-0000-0000-0000000000b1', 'event', 'deal_event:41', 'start');

select is_empty(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'event', 'deal_event:41', 'start')
     on conflict (workflow_id, trigger_ref) do nothing returning id $$,
  'the same trigger starts a workflow once'
);

select throws_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
       'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-9') $$,
  '23502', null,
  'a run names the trigger node that started it'
);

select is(
  (select trigger_node_id from public.workflow_run where id = 'f1000000-0000-0000-0000-0000000000c1'),
  'start',
  'a run records the trigger node that started it'
);

select is(
  (select status::text from public.workflow_run where id = 'f1000000-0000-0000-0000-0000000000c1'),
  'running',
  'a run starts running'
);

select throws_ok(
  $$ update public.workflow_run set version_id = 'f1000000-0000-0000-0000-0000000000b2'
     where id = 'f1000000-0000-0000-0000-0000000000c1' $$,
  '55000', null,
  'a run stays on the version it started on'
);

select throws_ok(
  $$ update public.workflow_run set status = 'succeeded' where id = 'f1000000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'a finished run records when it finished'
);

select throws_ok(
  $$ update public.workflow_run set finished_at = now() where id = 'f1000000-0000-0000-0000-0000000000c1' $$,
  '23514', null,
  'an unfinished run has no finish time'
);

insert into public.workflow_step_run (id, account_id, run_id, node_id, attempt, status, input, output, idempotency_key, started_at, finished_at, waiting_on)
values
  ('f1000000-0000-0000-0000-0000000000d1', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1',
   'lookup', 1, 'succeeded', '{"firm": 1}', '{"email": "a@b.test"}', 'run-c1:lookup:1',
   now() - interval '91 days', now() - interval '91 days', null),
  ('f1000000-0000-0000-0000-0000000000d2', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1',
   'send', 1, 'succeeded', '{"to": "a@b.test"}', '{"sent": true}', 'run-c1:send:1',
   now() - interval '89 days', now() - interval '89 days', null),
  ('f1000000-0000-0000-0000-0000000000d3', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1',
   'approve', 1, 'waiting', '{}', null, 'run-c1:approve:1', now(), null, 'decision'),
  ('f1000000-0000-0000-0000-0000000000d4', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1',
   'approve', 1, 'waiting', '{}', null, 'run-c1:approve:2', now(), null, 'cap'),
  ('f1000000-0000-0000-0000-0000000000d5', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1',
   'vet', 1, 'waiting', '{}', null, 'run-c1:vet:1', now(), null, 'decision');

select throws_ok(
  $$ insert into public.workflow_step_run (account_id, run_id, node_id, attempt, status, idempotency_key)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c1', 'send', 2, 'running', 'run-c1:send:1') $$,
  '23505', null,
  'a step''s side effect is recorded once per idempotency key'
);

insert into public.workflow_step_log (id, account_id, step_run_id, level, message, created_at)
values
  ('f1000000-0000-0000-0000-0000000000e1', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000d1',
   'info', 'found one email', now() - interval '91 days'),
  ('f1000000-0000-0000-0000-0000000000e2', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000d2',
   'warn', 'sent', now() - interval '89 days');

select is(
  (select details from public.workflow_step_log where id = 'f1000000-0000-0000-0000-0000000000e2'),
  '{}'::jsonb,
  'a log line without details carries an empty object'
);

select throws_ok(
  $$ insert into public.workflow_step_log (account_id, step_run_id, message)
     values (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000d1', 'no level') $$,
  '23502', null,
  'a log line names its level'
);

insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id, status, finished_at)
values
  ('f1000000-0000-0000-0000-0000000000c2', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-2', 'start', 'failed', now()),
  ('f1000000-0000-0000-0000-0000000000c3', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-3', 'start', 'cancelled', now()),
  ('f1000000-0000-0000-0000-0000000000c4', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-4', 'start', 'succeeded', now()),
  ('f1000000-0000-0000-0000-0000000000c5', tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-0000000000b1', 'manual', 'click-5', 'start', 'running', null);

insert into public.workflow_step_run (account_id, run_id, node_id, status, idempotency_key, finished_at)
values
  (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c5', 'done', 'succeeded', 'run-c5:done:1', now() - interval '1 hour'),
  (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c5', 'busy', 'running', 'run-c5:busy:1', null),
  (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000c5', 'held', 'waiting', 'run-c5:held:1', null);

update public.workflow_run set status = 'cancelled', finished_at = now() where id = 'f1000000-0000-0000-0000-0000000000c5';

select results_eq(
  $$ select node_id, status::text, finished_at is not null from public.workflow_step_run
     where run_id = 'f1000000-0000-0000-0000-0000000000c5' order by node_id $$,
  $$ values ('busy', 'cancelled', true), ('done', 'succeeded', true), ('held', 'cancelled', true) $$,
  'cancelling a run cancels its running and waiting steps'
);

select throws_ok(
  $$ update public.workflow_run set status = 'running', finished_at = null
     where id = 'f1000000-0000-0000-0000-0000000000c4' $$,
  '55000', null,
  'a succeeded run is final'
);

select lives_ok(
  $$ update public.workflow_run set status = 'running', finished_at = null
     where id = 'f1000000-0000-0000-0000-0000000000c2' $$,
  'a failed run is retried'
);

select throws_ok(
  $$ update public.workflow_run set status = 'running', finished_at = null
     where id = 'f1000000-0000-0000-0000-0000000000c3' $$,
  '55000', null,
  'a cancelled run is final'
);

insert into public.paid_lookup (account_id, firm_id, kind, provider, cost_cents, outcome, result, created_at)
values
  (tests.account_id('wf-co'), 'f1000000-0000-0000-0000-0000000000f1', 'email_lookup', 'apify', 4, 'found',
   '{"emails": 1}', date_trunc('month', now() at time zone 'utc') at time zone 'utc' - interval '1 second'),
  (tests.account_id('wf-co'), null, 'registry', 'opencorporates', 10, 'not_found', '{"found": false}', now());

select throws_ok(
  $$ insert into public.paid_lookup (account_id, kind, provider, cost_cents, result)
     values (tests.account_id('wf-co'), 'email_lookup', 'apify', 4, '{}') $$,
  '23502', null,
  'a paid lookup records its outcome'
);

update public.outreach_setting set lookup_monthly_cap = 2 where account_id = tests.account_id('wf-co');

select ok(not public.lookup_cap_reached(tests.account_id('wf-co')),
  'lookups from last UTC month do not count toward this month''s cap');

insert into public.paid_lookup (account_id, kind, provider, cost_cents, outcome, result)
values (tests.account_id('wf-co'), 'email_lookup', 'apify', 4, 'failed', '{"error": "timeout"}');

select ok(public.lookup_cap_reached(tests.account_id('wf-co')), 'a team at its lookup cap has reached it');
select ok(public.lookup_cap_reached(tests.account_id('wf-other')), 'a team with no lookup cap set has reached it');

select throws_ok(
  $$ insert into public.paid_lookup (account_id, kind, provider, cost_cents, outcome, result)
     values (tests.account_id('wf-co'), 'letters', 'lob', 100, 'found', '{}') $$,
  '23514', null,
  'a letter is not a lookup'
);

select throws_ok(
  $$ update public.workflow_step_log set message = 'rewritten' $$,
  '42501', null,
  'step logs are append-only'
);


select tests.login_as('wf_member');

select is((select count(*)::int from public.workflow_run), 5, 'a member reads the team''s runs');
select is((select count(*)::int from public.workflow_step_run), 8, 'a member reads the team''s steps');
select is((select count(*)::int from public.workflow_step_log), 2, 'a member reads the team''s step logs');

select throws_ok(
  $$ update public.workflow_step_run set status = 'failed' $$,
  '42501', null,
  'a member cannot write steps'
);

select is((select count(*)::int from public.paid_lookup), 3, 'a member reads the team''s paid lookups');

select throws_ok(
  $$ insert into public.paid_lookup (account_id, kind, provider, cost_cents, outcome, result)
     values (tests.account_id('wf-co'), 'email_lookup', 'apify', 0, 'found', '{}') $$,
  '42501', null,
  'paid lookups are recorded only by the service role'
);

select throws_ok(
  $$ select public.lookup_cap_reached(tests.account_id('wf-co')) $$,
  '42501', null,
  'a person does not query the lookup cap'
);

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d3', tests.account_id('wf-co'), true) $$,
  '42501', null,
  'a member cannot decide an approval'
);

select tests.login_as('wf_outsider');

select is((select count(*)::int from public.workflow_run), 0, 'another team reads none of the runs');
select is((select count(*)::int from public.workflow_step_log), 0, 'another team reads none of the step logs');

select is((select count(*)::int from public.paid_lookup), 0, 'another team reads none of the paid lookups');

select tests.login_as('wf_flow');

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d3', tests.account_id('wf-co'), true) $$,
  '42501', null,
  'a workflow manager who is not a deal manager cannot decide an approval'
);

select tests.login_as('wf_dealer');

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d1', tests.account_id('wf-co'), true) $$,
  '42501', null,
  'only a waiting step can be decided'
);

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d4', tests.account_id('wf-co'), true) $$,
  '42501', null,
  'an approval step parked under a monthly cap cannot be decided'
);

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d5', tests.account_id('wf-co'), true) $$,
  '42501', null,
  'a decision model step is not decided through this table'
);

select lives_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d3', tests.account_id('wf-co'), true) $$,
  'a deal manager approves a waiting step while another branch keeps its run running'
);

select is(
  (select decided_by from public.workflow_approval where step_run_id = 'f1000000-0000-0000-0000-0000000000d3'),
  tests.get_uid('wf_dealer'),
  'an approval names who gave it'
);

select throws_ok(
  $$ insert into public.workflow_approval (step_run_id, account_id, approved)
     values ('f1000000-0000-0000-0000-0000000000d3', tests.account_id('wf-co'), false) $$,
  '23505', null,
  'a step is decided once'
);

select throws_ok(
  $$ update public.workflow_approval set approved = false $$,
  '42501', null,
  'a decision cannot be changed'
);

select throws_ok(
  $$ select public.prune_workflow_step_data() $$,
  '42501', null,
  'a person cannot prune step data'
);

select tests.login_as_service_role();

select public.prune_workflow_step_data();
select public.prune_workflow_step_data();

select results_eq(
  $$ select node_id, input, output from public.workflow_step_run where node_id in ('lookup', 'send') order by node_id $$,
  $$ values ('lookup', null::jsonb, null::jsonb), ('send', '{"to": "a@b.test"}'::jsonb, '{"sent": true}'::jsonb) $$,
  'step input and output older than 90 days are dropped and newer ones kept'
);

select results_eq(
  $$ select id from public.workflow_step_log where account_id = tests.account_id('wf-co') $$,
  $$ values ('f1000000-0000-0000-0000-0000000000e2'::uuid) $$,
  'step logs older than 90 days are deleted and newer ones kept'
);

select is(
  (select count(*)::int from public.workflow_run where account_id = tests.account_id('wf-co')),
  5,
  'pruning keeps the run summaries'
);

select tests.login_as('wf_owner');

select lives_ok(
  $$ insert into public.firm_verdict_approval (verdict_id, account_id)
     values ('f1000000-0000-0000-0000-0000000000f2', tests.account_id('wf-co')) $$,
  'a deal manager approves a firm'
);

select throws_ok(
  $$ insert into public.account_event (account_id, event_type) values (tests.account_id('wf-co'), 'firm.approved') $$,
  '42501', null,
  'a person cannot write team events'
);

select tests.login_as('wf_member');

select results_eq(
  $$ select event_type, payload from public.account_event $$,
  $$ values ('firm.approved', jsonb_build_object(
       'firm_id', 'f1000000-0000-0000-0000-0000000000f1'::uuid,
       'verdict_id', 'f1000000-0000-0000-0000-0000000000f2'::uuid,
       'approved_by', tests.get_uid('wf_owner'))) $$,
  'approving a firm records a firm approved team event'
);

select ok((select global_seq from public.account_event) is not null, 'a team event has a global sequence');

select tests.login_as('wf_outsider');

select is_empty($$ select 1 from public.account_event $$, 'another team reads none of the team events');

select tests.login_as_service_role();

select throws_ok(
  $$ insert into public.account_event (account_id, event_type) values (tests.account_id('wf-co'), 'firm.approved') $$,
  '42501', null,
  'team events are written only by their source tables'
);

select tests.login_as('wf_owner');

select throws_ok(
  $$ update public.workflow set archived_at = now() where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'an enabled workflow is disabled when archived'
);

select lives_ok(
  $$ update public.workflow set enabled = false, archived_at = now() where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  'a manager archives a workflow'
);

select throws_ok(
  $$ update public.workflow set enabled = true where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  '23514', null,
  'an archived workflow cannot be enabled'
);

select lives_ok(
  $$ update public.workflow set archived_at = null where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  'a manager unarchives a workflow'
);

select is(
  (select enabled from public.workflow where id = 'f1000000-0000-0000-0000-0000000000a1'),
  false,
  'an unarchived workflow returns disabled'
);

select throws_ok(
  $$ delete from public.workflow where id = 'f1000000-0000-0000-0000-0000000000a1' $$,
  '23503', null,
  'a workflow with runs cannot be deleted'
);

select * from finish();
rollback;
