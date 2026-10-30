begin;
select no_plan();

select tests.create_user('dd_owner');
select tests.create_user('dd_member');
select tests.create_user('dd_outsider');

select tests.login_as_service_role();
select public.create_team_account('DD Co', tests.get_uid('dd_owner'), 'dd-co');
select public.create_team_account('DD Other', tests.get_uid('dd_outsider'), 'dd-other');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('dd-co'), tests.get_uid('dd_member'), 'member');

select tests.login_as('dd_owner');
select public.append_deal_event('d4000000-0000-0000-0000-0000000000d1', 'deal',
  'd4000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dd-co'), 'firm_id', tests.create_firm(tests.account_id('dd-co')), 'description', 'Harbor Bakery'));
select public.append_deal_event('d4000000-0000-0000-0000-0000000000d2', 'deal',
  'd4000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dd-co'), 'firm_id', tests.create_firm(tests.account_id('dd-co')), 'description', 'Summit Welding'));

select tests.login_as('dd_outsider');
select public.append_deal_event('d4000000-0000-0000-0000-0000000000d9', 'deal',
  'd4000000-0000-0000-0000-0000000000d9', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dd-other'), 'firm_id', tests.create_firm(tests.account_id('dd-other')), 'description', 'Other deal'));

reset role;

insert into public.workflow (id, account_id, name)
values ('d4000000-0000-0000-0000-0000000000a1', tests.account_id('dd-co'), 'Background search');

insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('d4000000-0000-0000-0000-0000000000b1', tests.account_id('dd-co'),
  'd4000000-0000-0000-0000-0000000000a1', 2, '{"nodes": [], "edges": []}', now(), tests.get_uid('dd_owner'));

insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values
  ('d4000000-0000-0000-0000-0000000000c1', tests.account_id('dd-co'), 'd4000000-0000-0000-0000-0000000000a1',
   'd4000000-0000-0000-0000-0000000000b1', 'manual', 'click-1', 'start'),
  ('d4000000-0000-0000-0000-0000000000c2', tests.account_id('dd-co'), 'd4000000-0000-0000-0000-0000000000a1',
   'd4000000-0000-0000-0000-0000000000b1', 'manual', 'click-2', 'start');

-- ---- The runner records runs, findings and reports ----
select tests.login_as_service_role();

select lives_ok(
  $$ insert into public.diligence_run (id, account_id, deal_id, workflow_run_id) values
       ('d4000000-0000-0000-0000-0000000000e1', tests.account_id('dd-co'),
        'd4000000-0000-0000-0000-0000000000d1', 'd4000000-0000-0000-0000-0000000000c1'),
       ('d4000000-0000-0000-0000-0000000000e2', tests.account_id('dd-co'),
        'd4000000-0000-0000-0000-0000000000d1', 'd4000000-0000-0000-0000-0000000000c2') $$,
  'the service role starts two runs on one deal'
);

select throws_ok(
  $$ insert into public.diligence_run (account_id, deal_id, workflow_run_id)
     values (tests.account_id('dd-co'), 'd4000000-0000-0000-0000-0000000000d1', 'd4000000-0000-0000-0000-0000000000c1') $$,
  '23505', null,
  'a retried step cannot start a second run for the same workflow run and deal'
);

select throws_ok(
  $$ insert into public.diligence_run (account_id, deal_id, workflow_run_id)
     values (tests.account_id('dd-co'), 'd4000000-0000-0000-0000-0000000000d1', null) $$,
  '23502', null,
  'a run always names its workflow run'
);

select throws_ok(
  $$ insert into public.diligence_run (account_id, deal_id, workflow_run_id)
     values (tests.account_id('dd-co'), 'd4000000-0000-0000-0000-0000000000d9', 'd4000000-0000-0000-0000-0000000000c1') $$,
  '42501', 'rows cannot link across teams',
  'a run cannot sit on another team''s deal'
);

select is(
  (select r.status::text from public.diligence_run d
   join public.workflow_run r on r.id = d.workflow_run_id
   where d.id = 'd4000000-0000-0000-0000-0000000000e1'),
  'running',
  'a run reads its status from its workflow run'
);

select lives_ok(
  $$ insert into public.diligence_finding
       (id, run_id, deal_id, account_id, subject_kind, subject_name, subject_key, source, title, summary, source_url, occurred_on, raw)
     values
       ('d4000000-0000-0000-0000-0000000000f1', 'd4000000-0000-0000-0000-0000000000e1',
        'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'),
        'business', 'Harbor Bakery LLC', 'business:harbor-bakery', 'courts',
        'Lien filed', 'A supplier filed a lien.', 'https://courts.example/1', '2025-03-01', '{"case": "1"}'),
       ('d4000000-0000-0000-0000-0000000000f2', 'd4000000-0000-0000-0000-0000000000e1',
        'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'),
        'person', 'Dana Field', 'person:dana-field', 'news',
        'Award', 'Local award.', 'https://news.example/1', null, '{}') $$,
  'findings land unrated, with or without a date'
);

select is(
  (select count(*)::int from public.diligence_finding
   where severity is null
     and id in ('d4000000-0000-0000-0000-0000000000f1', 'd4000000-0000-0000-0000-0000000000f2')),
  2,
  'a new finding has no severity until the report rates it'
);

select throws_ok(
  $$ insert into public.diligence_finding
       (run_id, deal_id, account_id, subject_kind, subject_name, subject_key, source, title, summary, source_url, raw)
     values ('d4000000-0000-0000-0000-0000000000e1', 'd4000000-0000-0000-0000-0000000000d2', tests.account_id('dd-co'),
       'business', 'Harbor Bakery LLC', 'business:harbor-bakery', 'sanctions', 'Hit', 'Hit.', 'https://s.example', '{}') $$,
  '23503', null,
  'a finding belongs to its run''s deal'
);

select lives_ok(
  $$ update public.diligence_finding set severity = 'red' where id = 'd4000000-0000-0000-0000-0000000000f1' $$,
  'the report step rates a finding'
);

select throws_ok(
  $$ update public.diligence_finding set severity = 'green' where id = 'd4000000-0000-0000-0000-0000000000f1' $$,
  '55000', null,
  'a rated finding keeps its severity'
);

select lives_ok(
  $$ update public.diligence_finding set severity = 'amber', severity_reason = 'Possible match, review.'
     where id = 'd4000000-0000-0000-0000-0000000000f2' $$,
  'the report step rates a finding with its reason'
);

select throws_ok(
  $$ update public.diligence_finding set severity_reason = 'Changed' where id = 'd4000000-0000-0000-0000-0000000000f2' $$,
  '55000', null,
  'a rated finding keeps its reason'
);

select throws_ok(
  $$ update public.diligence_finding set title = 'Changed' where id = 'd4000000-0000-0000-0000-0000000000f2' $$,
  '42501', null,
  'a finding is never edited beyond its severity'
);

select throws_ok(
  $$ delete from public.diligence_finding where id = 'd4000000-0000-0000-0000-0000000000f2' $$,
  '42501', null,
  'a finding is never deleted'
);

select lives_ok(
  $$ insert into public.diligence_report (id, run_id, deal_id, account_id, summary, model) values
       ('d4000000-0000-0000-0000-000000000011', 'd4000000-0000-0000-0000-0000000000e1',
        'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'), 'One lien.', 'gpt-test'),
       ('d4000000-0000-0000-0000-000000000012', 'd4000000-0000-0000-0000-0000000000e2',
        'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'), 'No background findings', null) $$,
  'each run adds its own report'
);

select is(
  (select count(*)::int from public.diligence_report where deal_id = 'd4000000-0000-0000-0000-0000000000d1'),
  2,
  'running again keeps the earlier report'
);

select is(
  (select model from public.diligence_report where id = 'd4000000-0000-0000-0000-000000000012'),
  null,
  'a report written without AI names no model'
);

select isnt(
  (select created_at from public.diligence_report where id = 'd4000000-0000-0000-0000-000000000011'),
  null,
  'a report records when it was written'
);

select throws_ok(
  $$ insert into public.diligence_report (run_id, deal_id, account_id, summary, model) values
       ('d4000000-0000-0000-0000-0000000000e1', 'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'), 'Again.', 'gpt-test') $$,
  '23505', null,
  'a run has one report'
);

select throws_ok(
  $$ update public.diligence_report set summary = 'Edited' where id = 'd4000000-0000-0000-0000-000000000011' $$,
  '42501', null,
  'a report is never edited'
);

select throws_ok(
  $$ delete from public.diligence_report where id = 'd4000000-0000-0000-0000-000000000011' $$,
  '42501', null,
  'a report is never deleted'
);

-- ---- The team reads; nobody else does, and nobody but the runner writes ----
select tests.login_as('dd_member');

select is(
  (select row(
     (select count(*) from public.diligence_run),
     (select count(*) from public.diligence_finding),
     (select count(*) from public.diligence_report))::text),
  '(2,2,2)',
  'a team member reads runs, findings and reports'
);

select throws_ok(
  $$ insert into public.diligence_report (run_id, deal_id, account_id, summary, model) values
       ('d4000000-0000-0000-0000-0000000000e2', 'd4000000-0000-0000-0000-0000000000d1', tests.account_id('dd-co'), 'Mine.', 'me') $$,
  '42501', null,
  'a team member cannot write a report'
);

select tests.login_as('dd_outsider');

select is(
  (select row(
     (select count(*) from public.diligence_run),
     (select count(*) from public.diligence_finding),
     (select count(*) from public.diligence_report))::text),
  '(0,0,0)',
  'another team reads nothing'
);

-- ---- A red report opens a checklist item linked to it ----
select tests.login_as('dd_owner');
select public.append_deal_event('d4000000-0000-0000-0000-0000000000d1', 'checklist_item',
  'd4000000-0000-0000-0000-000000000021', 'checklist_item.added',
  jsonb_build_object('title', 'Review background report', 'artifact_type', 'diligence_report',
    'artifact_id', 'd4000000-0000-0000-0000-000000000011'));

select is(
  (select row(artifact_type, artifact_id)::text from public.checklist_item
   where id = 'd4000000-0000-0000-0000-000000000021'),
  '(diligence_report,d4000000-0000-0000-0000-000000000011)',
  'an added checklist item keeps the artifact it links to'
);

select * from finish();
rollback;
