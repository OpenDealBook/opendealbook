begin;
select no_plan();

select tests.create_user('wl_owner');
select tests.create_user('wl_member');

select tests.login_as_service_role();
select public.create_team_account('WL Co', tests.get_uid('wl_owner'), 'wl-co');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('wl-co'), tests.get_uid('wl_member'), 'member');

insert into public.workflow (id, account_id, name)
values ('f2000000-0000-0000-0000-0000000000a1', tests.account_id('wl-co'), 'Layout flow');

insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph)
values ('f2000000-0000-0000-0000-0000000000b1', tests.account_id('wl-co'),
  'f2000000-0000-0000-0000-0000000000a1', 2, '{"nodes":[],"edges":[]}');

update public.workflow_version set saved_at = now() - interval '1 day'
where id = 'f2000000-0000-0000-0000-0000000000b1';

select tests.login_as('wl_owner');

select is(
  (select layout from public.workflow_version where id = 'f2000000-0000-0000-0000-0000000000b1'),
  '{}'::jsonb,
  'a version starts with an empty layout'
);

select public.save_workflow_draft('f2000000-0000-0000-0000-0000000000a1',
  '{"nodes":[],"edges":[]}', '{"direction":"RIGHT","positions":{"start":{"x":10,"y":20}}}');

select is(
  (select layout -> 'positions' -> 'start' ->> 'x' from public.workflow_version
   where id = 'f2000000-0000-0000-0000-0000000000b1'),
  '10',
  'a workflows manager saves the draft layout'
);

select is(
  (select saved_at from public.workflow_version where id = 'f2000000-0000-0000-0000-0000000000b1'),
  now(),
  'saving a draft records when it was saved'
);

reset role;

select throws_ok(
  $$ update public.workflow_version set layout = null where id = 'f2000000-0000-0000-0000-0000000000b1' $$,
  '23502', null,
  'a layout is never null'
);

update public.workflow_version set published_at = now(), published_by = tests.get_uid('wl_owner')
where id = 'f2000000-0000-0000-0000-0000000000b1';

select throws_ok(
  $$ update public.workflow_version set layout = '{}' where id = 'f2000000-0000-0000-0000-0000000000b1' $$,
  '55000', null,
  'a published layout never changes'
);

select tests.login_as('wl_member');

select is(
  (select count(*)::int from public.workflow_version where workflow_id = 'f2000000-0000-0000-0000-0000000000a1'),
  1,
  'a member reads every version'
);

select throws_ok(
  $$ select public.save_workflow_draft('f2000000-0000-0000-0000-0000000000a1', '{"nodes":[],"edges":[]}', '{}') $$,
  '42501', null,
  'a member cannot save a draft layout'
);

select * from finish();
rollback;
