begin;
select no_plan();

select tests.create_user('tw_owner');

select tests.login_as_service_role();
select public.create_team_account('TW Team', tests.get_uid('tw_owner'), 'tw-team');

reset role;

select is(
  (select trial_ends_at from public.accounts where id = tests.get_uid('tw_owner')),
  null,
  'a personal account has no trial'
);

select is(
  (select count(*)::int from public.pipeline_stage where account_id = tests.get_uid('tw_owner')),
  0,
  'a personal account has no pipeline'
);

select ok(
  (select trial_ends_at between now() + interval '29 days' and now() + interval '31 days'
   from public.accounts where id = tests.account_id('tw-team')),
  'a team''s trial starts when the team is created'
);

select is(
  (select count(*)::int from public.pipeline_stage where account_id = tests.account_id('tw-team')),
  10,
  'a new team gets the default pipeline'
);

select throws_ok(
  $$ insert into public.firm (account_id, name) values (tests.get_uid('tw_owner'), 'Personal firm') $$,
  '23514', null,
  'a personal account holds no firms'
);

select throws_ok(
  $$ insert into public.pipeline_stage (account_id, key, label, sort_order, is_terminal)
     values (tests.get_uid('tw_owner'), 'sourcing', 'Sourcing', 1, false) $$,
  '23514', null,
  'a personal account holds no pipeline stages'
);

insert into public.firm (account_id, name) values (tests.account_id('tw-team'), 'Team firm');

select throws_ok(
  $$ update public.firm set account_id = tests.get_uid('tw_owner')
     where id = (select id from public.firm where account_id = tests.account_id('tw-team') limit 1) $$,
  '23514', null,
  'a team''s row cannot move onto a personal account'
);

select tests.login_as('tw_owner');

select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal',
       '7e000000-0000-0000-0000-0000000000d1', 'deal.created',
       jsonb_build_object('account_id', tests.get_uid('tw_owner'), 'firm_id', tests.create_firm(tests.get_uid('tw_owner')), 'description', 'Personal deal')) $$,
  '23514', null,
  'a deal cannot be opened on a personal account'
);

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal',
       '7e000000-0000-0000-0000-0000000000d2', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('tw-team'), 'firm_id', tests.create_firm(tests.account_id('tw-team')), 'description', 'Team deal')) $$,
  'a deal is opened on a team'
);

select throws_ok(
  $$ insert into public.personal_todo (account_id, title) values (tests.get_uid('tw_owner'), 'Mine') $$,
  '23514', null,
  'a personal account holds no to-dos'
);

reset role;

select lives_ok(
  $$ insert into public.notifications (account_id, body, channel, type)
     values (tests.get_uid('tw_owner'), 'Hello', 'in_app', 'info') $$,
  'a personal account still receives notifications'
);

select tests.login_as_service_role();

insert into public.workflow (id, account_id, name)
values ('7e000000-0000-0000-0000-0000000000a1', tests.account_id('tw-team'), 'Flow');
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('7e000000-0000-0000-0000-0000000000b1', tests.account_id('tw-team'), '7e000000-0000-0000-0000-0000000000a1',
  1, '{}', now(), tests.get_uid('tw_owner'));
insert into public.workflow_run (account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values (tests.account_id('tw-team'), '7e000000-0000-0000-0000-0000000000a1', '7e000000-0000-0000-0000-0000000000b1',
  'manual', 'click-1', 'start');

reset role;

select lives_ok(
  $$ delete from public.accounts where id = tests.account_id('tw-team') $$,
  'a team with workflow runs can be deleted'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and not a.attisdropped and a.attname = 'account_id'
      )
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'refuse_personal_account_row'
      )
      and c.relname not in (select table_name from odb.personal_account_tables)
  $$,
  'every team table refuses personal accounts or names why a personal account may hold it'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and not a.attisdropped and a.attname in ('deal_id', 'room_id')
      )
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and not a.attisdropped and a.attname = 'account_id'
      )
      and not exists (
        select 1
        from pg_constraint k
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
        where k.conrelid = c.oid and k.contype = 'f' and a.attnotnull
          and (
            k.confrelid in ('public.lender_room'::regclass, 'public.seller_room'::regclass)
            or exists (
              select 1 from pg_trigger t
              where t.tgrelid = k.confrelid and t.tgname = 'refuse_personal_account_row'
            )
          )
      )
  $$,
  'a deal or room table without an account hangs from a team-only row'
);

select * from finish();
rollback;
