begin;
select no_plan();

select tests.create_user('bs_owner');
create temp table bs_seq_before_seeding as
  select nextval(pg_get_serial_sequence('public.deal_event', 'global_seq')) as seq;

select tests.login_as_service_role();
select public.create_team_account('BS Co', tests.get_uid('bs_owner'), 'bs-co');

reset role;

select is(
  (select count(*)::int from public.workflow
   where account_id = tests.account_id('bs-co') and system_key = 'background_search'),
  1,
  'a new team gets one Background search workflow'
);

select is(
  (select row(name, enabled, archived_at is null)::text from public.workflow
   where account_id = tests.account_id('bs-co') and system_key = 'background_search'),
  '("Background search",t,t)',
  'it starts switched on and not archived'
);

select is(
  (select row(v.published_by = tests.get_uid('bs_owner'), v.graph #>> '{nodes,0,config,eventType}')::text
   from public.workflow_version v
   join public.workflow w on w.id = v.workflow_id
   where w.account_id = tests.account_id('bs-co') and w.system_key = 'background_search'
     and v.published_at is not null),
  '(t,deal.loi_signed)',
  'its one version is published by the team owner and starts on a signed LOI'
);

select ok(
  (select enabled_after_deal_seq >= (select seq from bs_seq_before_seeding)
   from public.workflow
   where account_id = tests.account_id('bs-co') and system_key = 'background_search'),
  'it starts on deal events after it was seeded, so earlier signed LOIs are not searched'
);

select is(
  (select count(*)::int from public.workflow w
   join public.accounts a on a.id = w.account_id
   where a.is_personal_account and a.primary_owner_user_id = tests.get_uid('bs_owner')),
  0,
  'a personal account gets no workflow'
);

update public.workflow set enabled = false
where account_id = tests.account_id('bs-co') and system_key = 'background_search';

select public.seed_background_search_workflow(tests.account_id('bs-co'));

select is(
  (select row(count(*), bool_or(w.enabled))::text
   from public.workflow w
   join public.workflow_version v on v.workflow_id = w.id
   where w.account_id = tests.account_id('bs-co') and w.system_key = 'background_search'),
  '(1,f)',
  'seeding again adds nothing and leaves a switched off workflow off'
);

create function pg_temp.start_run(p_deal text, p_ref text, p_status public.workflow_run_status default 'running')
  returns void language sql as $$
  insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id, trigger_output, status, finished_at)
  select w.account_id, w.id, v.id, 'manual', p_ref, 'loi-signed', jsonb_build_object('dealId', p_deal), p_status,
    case when p_status in ('succeeded', 'failed', 'cancelled') then now() end
  from public.workflow w
  join public.workflow_version v on v.workflow_id = w.id
  where w.account_id = tests.account_id('bs-co') and w.system_key = 'background_search';
$$;

select pg_temp.start_run('deal-a', 'done', 'succeeded');
select lives_ok(
  $$ select pg_temp.start_run('deal-a', 'first', 'paused_cap') $$,
  'a deal with only finished searches can start another'
);
select throws_ok(
  $$ select pg_temp.start_run('deal-a', 'second') $$,
  '23505', 'A background search is already running for this deal',
  'a second unfinished search for the same deal is refused'
);
select lives_ok(
  $$ select pg_temp.start_run('deal-b', 'other-deal') $$,
  'another deal can search at the same time'
);
select lives_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id, trigger_output)
     select account_id, workflow_id, version_id, trigger_kind, 'first', trigger_node_id, trigger_output
     from public.workflow_run where trigger_ref = 'first'
     on conflict (workflow_id, trigger_ref) do nothing $$,
  'the same request arriving again finds its run instead of being refused'
);

update public.workflow_run set status = 'failed', finished_at = now() where trigger_ref = 'other-deal';
select pg_temp.start_run('deal-b', 'other-deal-again');
select throws_ok(
  $$ update public.workflow_run set status = 'running', finished_at = null where trigger_ref = 'other-deal' $$,
  '23505', 'A background search is already running for this deal',
  'a failed search cannot be retried while another search for the deal is unfinished'
);

insert into public.workflow (id, account_id, name)
values ('b5000000-0000-0000-0000-0000000000a1', tests.account_id('bs-co'), 'Deal follow-up');
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('b5000000-0000-0000-0000-0000000000b1', tests.account_id('bs-co'), 'b5000000-0000-0000-0000-0000000000a1', 2,
  '{"nodes": [], "edges": []}', now(), tests.get_uid('bs_owner'));
insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id, trigger_output)
values (tests.account_id('bs-co'), 'b5000000-0000-0000-0000-0000000000a1', 'b5000000-0000-0000-0000-0000000000b1',
  'manual', 'follow-1', 'start', '{"dealId": "deal-a"}');
select lives_ok(
  $$ insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id, trigger_output)
     values (tests.account_id('bs-co'), 'b5000000-0000-0000-0000-0000000000a1', 'b5000000-0000-0000-0000-0000000000b1',
       'manual', 'follow-2', 'start', '{"dealId": "deal-a"}') $$,
  'other workflows may run more than once for a deal at a time'
);

delete from public.workflow_run where account_id = tests.account_id('bs-co');

select tests.login_as('bs_owner');

select throws_ok(
  $$ select public.seed_background_search_workflow(tests.account_id('bs-co')) $$,
  '42501', null,
  'a person cannot seed the workflow'
);

select throws_ok(
  $$ delete from public.workflow where account_id = tests.account_id('bs-co') and system_key = 'background_search' $$,
  '55000', 'Background search can''t be deleted. Archive it instead.',
  'a team cannot delete the Background search workflow'
);

select lives_ok(
  $$ update public.workflow set archived_at = now(), enabled = false
     where account_id = tests.account_id('bs-co') and system_key = 'background_search' $$,
  'a team can archive the Background search workflow'
);

select lives_ok(
  $$ delete from public.workflow where id = 'b5000000-0000-0000-0000-0000000000a1' $$,
  'a team can still delete its other workflows'
);

reset role;

create temp table bs_workflow as
select id from public.workflow where account_id = tests.account_id('bs-co') and system_key = 'background_search';

delete from public.accounts where id = tests.account_id('bs-co');

select is(
  (select count(*)::int from public.workflow where id in (select id from bs_workflow)),
  0,
  'deleting the team deletes its Background search workflow'
);

select tests.create_user('bs_keeper');
select tests.create_user('bs_publisher');
select tests.login_as_service_role();
select public.create_team_account('BS Kept', tests.get_uid('bs_keeper'), 'bs-kept');
reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('bs-kept'), tests.get_uid('bs_publisher'), 'admin');

insert into public.workflow (id, account_id, name)
values ('b5000000-0000-0000-0000-0000000000a2', tests.account_id('bs-kept'), 'Published by an admin');
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('b5000000-0000-0000-0000-0000000000b2', tests.account_id('bs-kept'), 'b5000000-0000-0000-0000-0000000000a2', 2,
  '{"nodes": [], "edges": []}', now(), tests.get_uid('bs_publisher'));

select lives_ok(
  $$ delete from auth.users where id = tests.get_uid('bs_publisher') $$,
  'a user who published a workflow version can be deleted'
);

select is(
  (select row(published_at is not null, published_by is null)::text
   from public.workflow_version where id = 'b5000000-0000-0000-0000-0000000000b2'),
  '(t,t)',
  'the version they published stays published with its publisher cleared'
);

select throws_ok(
  $$ insert into public.workflow_version (account_id, workflow_id, schema_version, graph, published_by)
     values (tests.account_id('bs-kept'), 'b5000000-0000-0000-0000-0000000000a2', 2, '{"nodes": [], "edges": []}', tests.get_uid('bs_keeper')) $$,
  '23514', null,
  'a draft still has no publisher'
);

select throws_ok(
  $$ update public.workflow_version set published_by = tests.get_uid('bs_keeper') where id = 'b5000000-0000-0000-0000-0000000000b2' $$,
  '55000', null,
  'a published version cannot be given another publisher'
);

select * from finish();

rollback;
