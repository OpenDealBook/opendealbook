begin;
select no_plan();

select tests.create_user('dbl_owner');

select tests.login_as_service_role();
select public.create_team_account('Juniper Co', tests.get_uid('dbl_owner'), 'dbl-co');

select tests.login_as('dbl_owner');
select public.append_deal_event('d5000000-0000-0000-0000-0000000000d1', 'deal',
  'd5000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dbl-co'), 'firm_id', tests.create_firm(tests.account_id('dbl-co')), 'description', 'Juniper Plumbing'));

reset role;

insert into public.workflow (id, account_id, name)
values ('d5000000-0000-0000-0000-0000000000a1', tests.account_id('dbl-co'), 'Background search');

insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('d5000000-0000-0000-0000-0000000000b1', tests.account_id('dbl-co'),
  'd5000000-0000-0000-0000-0000000000a1', 2, '{"nodes": [], "edges": []}', now(), tests.get_uid('dbl_owner'));

insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values ('d5000000-0000-0000-0000-0000000000c1', tests.account_id('dbl-co'), 'd5000000-0000-0000-0000-0000000000a1',
  'd5000000-0000-0000-0000-0000000000b1', 'manual', 'click-1', 'start');

insert into public.diligence_run (id, account_id, deal_id, workflow_run_id)
values ('d5000000-0000-0000-0000-0000000000e1', tests.account_id('dbl-co'),
  'd5000000-0000-0000-0000-0000000000d1', 'd5000000-0000-0000-0000-0000000000c1');

select enum_has_labels('public', 'diligence_source',
  array['courts', 'sanctions', 'news', 'reviews', 'licenses', 'court_records'],
  'background searches can find licenses and court records');

select col_is_null('public', 'diligence_finding', 'source_url', 'a finding may have no source link');

select tests.login_as_service_role();

select lives_ok(
  $$ insert into public.diligence_finding
       (run_id, deal_id, account_id, subject_kind, subject_name, subject_key, source, title, summary, source_url, raw)
     values
       ('d5000000-0000-0000-0000-0000000000e1', 'd5000000-0000-0000-0000-0000000000d1', tests.account_id('dbl-co'),
        'business', 'Juniper Plumbing', 'business:juniper plumbing', 'licenses', 'Plumbing license P-1', 'Active', null, '{}'),
       ('d5000000-0000-0000-0000-0000000000e1', 'd5000000-0000-0000-0000-0000000000d1', tests.account_id('dbl-co'),
        'business', 'Juniper Plumbing', 'business:juniper plumbing', 'court_records', 'UCC filing 42', 'Open', null, '{"source": "middesk"}') $$,
  'a license or court record finding may have no source link'
);

reset role;

select lives_ok(
  $$ insert into public.workflow_step_run (account_id, run_id, node_id, status, idempotency_key, wake_at, waiting_on)
     values (tests.account_id('dbl-co'), 'd5000000-0000-0000-0000-0000000000c1', 'search', 'waiting',
             'dbl-search-1', now() + interval '5 minutes', 'poll') $$,
  'a step can park to poll a source again'
);

select tests.login_as_service_role();

select lives_ok(
  $$ insert into public.diligence_broker_check (run_id, subject_key, broker)
     values ('d5000000-0000-0000-0000-0000000000e1', 'business:juniper plumbing', 'middesk') $$,
  'the runner records a run''s first broker check for a subject'
);

select ok(
  (select started_at = now() and state = '{}'::jsonb from public.diligence_broker_check
   where run_id = 'd5000000-0000-0000-0000-0000000000e1'),
  'the first check starts the clock with no broker state yet'
);

select lives_ok(
  $$ update public.diligence_broker_check set state = '{"searchId": "srch_1", "step": "search"}'
     where run_id = 'd5000000-0000-0000-0000-0000000000e1' and subject_key = 'business:juniper plumbing' $$,
  'the runner saves the broker state to resume from'
);

select throws_ok(
  $$ insert into public.diligence_broker_check (run_id, subject_key, broker)
     values ('d5000000-0000-0000-0000-0000000000e1', 'business:juniper plumbing', 'middesk') $$,
  '23505', null,
  'a run holds one broker check per subject'
);

select throws_ok(
  $$ insert into public.diligence_broker_check (run_id, subject_key, broker)
     values ('d5000000-0000-0000-0000-0000000000e1', 'business:other', 'acme') $$,
  '23514', null,
  'a broker check names Baselayer or Middesk'
);

select lives_ok(
  $$ update public.diligence_broker_check
     set broker = 'baselayer', state = '{"step": "search"}', started_at = now(), claimed_at = now()
     where run_id = 'd5000000-0000-0000-0000-0000000000e1' and subject_key = 'business:juniper plumbing' $$,
  'the runner restarts a check with another broker and claims it before a paid broker call'
);

select lives_ok(
  $$ insert into public.diligence_search_check (run_id, source, subject_key, notes)
     values ('d5000000-0000-0000-0000-0000000000e1', 'licenses', 'business:juniper plumbing',
             array['License data is not available for OR']) $$,
  'a finished license search keeps the notes on what it could not check'
);

select col_is_null('public', 'diligence_search_check', 'notes', 'a finished search may have no notes');

select tests.login_as('dbl_owner');

select throws_ok(
  $$ select * from public.diligence_broker_check $$,
  '42501', null,
  'a team member cannot read broker checks'
);

select * from finish();
rollback;
