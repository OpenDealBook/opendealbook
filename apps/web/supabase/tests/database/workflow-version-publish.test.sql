begin;
select no_plan();

select tests.create_user('wp_owner');
select tests.create_user('wp_member');

select tests.login_as_service_role();
select public.create_team_account('WP Co', tests.get_uid('wp_owner'), 'wp-co');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('wp-co'), tests.get_uid('wp_member'), 'member');

select tests.login_as('wp_owner');

insert into public.workflow (id, account_id, name)
values ('f3000000-0000-0000-0000-0000000000a1', tests.account_id('wp-co'), 'Publish flow');

select is(
  public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":[],"edges":[]}', '{}'),
  now(),
  'saving with no draft starts one'
);

select is(
  public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":["second"],"edges":[]}', '{"direction":"DOWN"}'),
  now(),
  'saving again updates the draft'
);

select is(
  (select array_agg(graph -> 'nodes' ->> 0) from public.workflow_version
   where workflow_id = 'f3000000-0000-0000-0000-0000000000a1'),
  array['second'],
  'a workflow keeps one draft, holding the latest save'
);

select throws_ok(
  $$ update public.workflow_version set published_at = now(), published_by = tests.get_uid('wp_owner')
     where workflow_id = 'f3000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a workflows manager cannot publish directly'
);

select throws_ok(
  $$ update public.workflow_version set published_by = tests.get_uid('wp_owner')
     where workflow_id = 'f3000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a workflows manager cannot name a publisher directly'
);

select throws_ok(
  $$ update public.workflow_version set schema_version = 99
     where workflow_id = 'f3000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a workflows manager cannot change the schema version directly'
);

select throws_ok(
  $$ insert into public.workflow_version (account_id, workflow_id, schema_version, graph)
     values (tests.account_id('wp-co'), 'f3000000-0000-0000-0000-0000000000a1', 99, '{}') $$,
  '42501', null,
  'a workflows manager cannot insert a version with its own schema version'
);

reset role;
update public.workflow_version set schema_version = 1
where workflow_id = 'f3000000-0000-0000-0000-0000000000a1';
select tests.login_as('wp_owner');

select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":[],"edges":[]}', '{}');

select is(
  (select schema_version from public.workflow_version where workflow_id = 'f3000000-0000-0000-0000-0000000000a1'),
  2,
  'saving a draft sets the current schema version'
);

reset role;
select is(
  (select schema_version from public.workflow_version where workflow_id = 'f3000000-0000-0000-0000-0000000000a1'),
  tuckin.current_workflow_schema_version(),
  'saving stamps the named current schema version'
);
select tests.login_as('wp_owner');

select is(
  has_any_column_privilege('authenticated', 'public.workflow_version', 'UPDATE'),
  false,
  'people never update versions directly'
);

select is_empty(
  $$ select 1 from pg_policies where tablename = 'workflow_version' and cmd in ('INSERT', 'UPDATE') $$,
  'no insert or update policy is left on versions'
);

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":{}}', '{}') $$,
  '22023', 'A workflow needs nodes and edges lists',
  'a graph without node and edge lists is refused'
);

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":[],"edges":[]}', '[]') $$,
  '22023', 'A workflow layout must be an object',
  'a layout that is not an object is refused'
);

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1',
       jsonb_build_object('nodes', (select jsonb_agg(jsonb_build_object('id', n)) from generate_series(1, 201) n), 'edges', '[]'::jsonb),
       '{}') $$,
  '22023', 'A workflow can have at most 200 steps',
  'more than 200 steps is refused'
);

select lives_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1',
       jsonb_build_object('nodes', (select jsonb_agg(jsonb_build_object('id', n)) from generate_series(1, 200) n), 'edges', '[]'::jsonb),
       '{}') $$,
  '200 steps is allowed'
);

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1',
       jsonb_build_object('nodes', jsonb_build_array(repeat('x', 1048576)), 'edges', '[]'::jsonb),
       '{}') $$,
  '54000', 'A workflow is too large to save',
  'a draft over 1 MB is refused'
);

select throws_ok(
  $$ update public.workflow_version set saved_at = now() - interval '1 day'
     where workflow_id = 'f3000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a workflows manager cannot backdate a save'
);

select throws_ok(
  $$ update public.workflow_version set graph = '{"nodes":[],"edges":[]}', layout = '{"direction":"RIGHT"}'
     where workflow_id = 'f3000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'a workflows manager cannot edit the draft graph or layout directly'
);

reset role;
update public.workflow set archived_at = now() where id = 'f3000000-0000-0000-0000-0000000000a1';
select tests.login_as('wp_owner');

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{"nodes":[],"edges":[]}', '{}') $$,
  '55000', 'Unarchive this workflow first',
  'an archived workflow cannot be saved'
);

select isnt(
  public.create_workflow(tests.account_id('wp-co'), 'Created flow', '{"nodes":[{"id":"run-now"}],"edges":[]}'),
  null,
  'a workflows manager creates a workflow'
);

reset role;
select is(
  (select row(w.enabled, v.schema_version, v.graph -> 'nodes' -> 0 ->> 'id', v.layout, v.published_at is null)::text
   from public.workflow w join public.workflow_version v on v.workflow_id = w.id
   where w.name = 'Created flow'),
  row(false, tuckin.current_workflow_schema_version(), 'run-now', '{}'::jsonb, true)::text,
  'a new workflow is disabled with one draft holding the given graph'
);
select tests.login_as('wp_owner');

select throws_ok(
  $$ select public.create_workflow(tests.account_id('wp-co'), 'Bad flow', '{"nodes":{}}') $$,
  '22023', 'A workflow needs nodes and edges lists',
  'a workflow whose draft is refused is not created'
);

select is_empty(
  $$ select 1 from public.workflow where name = 'Bad flow' $$,
  'no workflow is left without its draft'
);

select tests.login_as('wp_member');

select throws_ok(
  $$ select public.save_workflow_draft('f3000000-0000-0000-0000-0000000000a1', '{}', '{}') $$,
  '42501', null,
  'a member cannot save a draft'
);

select throws_ok(
  $$ select public.create_workflow(tests.account_id('wp-co'), 'Sneaky', '{"nodes":[],"edges":[]}') $$,
  '42501', null,
  'a member cannot create a workflow'
);

select is(
  has_any_column_privilege('authenticated', 'public.workflow_version', 'INSERT'),
  false,
  'people never insert versions directly; drafts are saved through save_workflow_draft'
);

select * from finish();
rollback;
