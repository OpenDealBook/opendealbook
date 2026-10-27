begin;
select no_plan();

select tests.create_user('te_owner');

select tests.login_as_service_role();
select public.create_team_account('TE Team', tests.get_uid('te_owner'), 'te-team');
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal',
  '7e200000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('te-team'), 'firm_id', tests.create_firm(tests.account_id('te-team')), 'owner_user_id', tests.get_uid('te_owner'),
    'description', 'Signed by e-sign'), null, 'service');
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal',
  '7e200000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('te-team'), 'firm_id', tests.create_firm(tests.account_id('te-team')), 'owner_user_id', tests.get_uid('te_owner'),
    'description', 'Signed on paper later'), null, 'service');

-- ---- deal.loi_signed ----

select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-02"}'::jsonb, null, 'service', 'esign');

select tests.login_as('te_owner');

select results_eq(
  $$ select event_type, payload from public.deal_event
     where deal_id = '7e200000-0000-0000-0000-0000000000d1' and event_type = 'deal.loi_signed' $$,
  $$ values ('deal.loi_signed', '{"milestone_id": "7e200000-0000-0000-0000-0000000000c1", "signed_on": "2026-10-02"}'::jsonb) $$,
  'setting the LOI signed date records that the LOI was signed'
);

select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-03"}'::jsonb);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": null}'::jsonb);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-04"}'::jsonb);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c1', 'deal_milestone.removed', '{}'::jsonb);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c9', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-05"}'::jsonb);

select is(
  (select count(*)::int from public.deal_event
   where deal_id = '7e200000-0000-0000-0000-0000000000d1' and event_type = 'deal.loi_signed'),
  1,
  'changing, clearing, re-setting or re-adding the LOI signed date never records the signing again'
);

select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c2', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": "2026-10-10", "actual_on": null}'::jsonb);

select is(
  (select count(*)::int from public.deal_event
   where deal_id = '7e200000-0000-0000-0000-0000000000d2' and event_type = 'deal.loi_signed'),
  0,
  'a planned LOI signing date alone is not a signing'
);

select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c2', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": "2026-10-10", "actual_on": "2026-10-09"}'::jsonb);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c3', 'deal_milestone.set',
  '{"kind": "apa_signing", "target_on": null, "actual_on": "2026-10-09"}'::jsonb);

select results_eq(
  $$ select payload from public.deal_event
     where deal_id = '7e200000-0000-0000-0000-0000000000d2' and event_type = 'deal.loi_signed' $$,
  $$ values ('{"milestone_id": "7e200000-0000-0000-0000-0000000000c2", "signed_on": "2026-10-09"}'::jsonb) $$,
  'filling in the actual date of a planned LOI signing records the signing, and other milestones do not'
);

select tests.login_as_service_role();
select public.replay_deal('7e200000-0000-0000-0000-0000000000d1');

select is(
  (select count(*)::int from public.deal_event
   where deal_id = '7e200000-0000-0000-0000-0000000000d1' and event_type = 'deal.loi_signed'),
  1,
  'replaying a signed deal records nothing new'
);

-- ---- deal.loi_signed keeps the log's snapshots ----

select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id('te-team'), 'firm_id', tests.create_firm(tests.account_id('te-team')), 'owner_user_id', tests.get_uid('te_owner'),
    'description', 'Snapshot deal'), null, 'service')
from (values ('7e200000-0000-0000-0000-0000000000d3'::uuid), ('7e200000-0000-0000-0000-0000000000d4'::uuid)) d(id);
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d3', 'deal',
  '7e200000-0000-0000-0000-0000000000d3', 'deal.updated', jsonb_build_object('notes', n::text), null, 'service')
from generate_series(1, 61) n;
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d4', 'deal',
  '7e200000-0000-0000-0000-0000000000d4', 'deal.updated', jsonb_build_object('notes', n::text), null, 'service')
from generate_series(1, 62) n;
select public.append_deal_event(d.id, 'deal_milestone', gen_random_uuid(), 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-02"}'::jsonb, null, 'service')
from (values ('7e200000-0000-0000-0000-0000000000d3'::uuid), ('7e200000-0000-0000-0000-0000000000d4'::uuid)) d(id);

select results_eq(
  $$ select deal_id, aggregate_type, through_seq from public.deal_event_snapshot
     where deal_id in ('7e200000-0000-0000-0000-0000000000d3', '7e200000-0000-0000-0000-0000000000d4')
     order by deal_id, aggregate_type $$,
  $$ values ('7e200000-0000-0000-0000-0000000000d3'::uuid, 'deal-wide', 64::bigint),
            ('7e200000-0000-0000-0000-0000000000d4'::uuid, 'deal', 64::bigint),
            ('7e200000-0000-0000-0000-0000000000d4'::uuid, 'deal-wide', 64::bigint) $$,
  'an LOI signing that lands on a 64th event writes the snapshot an append would'
);

-- ---- relaying settled events ----

reset role;

select is(
  (select count(*)::int from public.settled_trigger_events('deal', '0'::xid8, 0, array['deal.loi_signed'], 100000) e
   where e.deal_id = '7e200000-0000-0000-0000-0000000000d1'),
  0,
  'an event of a transaction still running is not relayed yet'
);

select ok(
  (select bool_and(e.xid::xid8 < pg_snapshot_xmin(pg_current_snapshot()))
   from public.settled_trigger_events('deal', '0'::xid8, 0, array['deal.created'], 50) e),
  'only events of finished transactions are relayed'
);

select tests.login_as('te_owner');

select throws_ok(
  $$ select * from public.settled_trigger_events('deal', '0'::xid8, 0, array['deal.created'], 1) $$,
  '42501',
  null,
  'a person cannot read the relay feed'
);

-- ---- workflow event marks ----

select tests.login_as_service_role();

insert into public.workflow (id, account_id, name)
values ('7e200000-0000-0000-0000-0000000000f1', tests.account_id('te-team'), 'On signing');
insert into public.workflow_version (account_id, workflow_id, schema_version, graph, published_at, published_by)
values (tests.account_id('te-team'), '7e200000-0000-0000-0000-0000000000f1', 2, '{"nodes": [], "edges": []}',
  now(), tests.get_uid('te_owner'));

select results_eq(
  $$ select enabled_after_deal_seq, enabled_after_account_seq from public.workflow
     where id = '7e200000-0000-0000-0000-0000000000f1' $$,
  $$ values (null::bigint, null::bigint) $$,
  'a workflow never enabled has no marks'
);

update public.workflow set enabled = true where id = '7e200000-0000-0000-0000-0000000000f1';
reset role;

select results_eq(
  $$ select enabled_after_deal_seq, enabled_after_account_seq from public.workflow
     where id = '7e200000-0000-0000-0000-0000000000f1' $$,
  $$ select pg_sequence_last_value(pg_get_serial_sequence('public.deal_event', 'global_seq')),
            coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.account_event', 'global_seq')), 0) $$,
  'enabling a workflow marks how far each event log had reached'
);

create temp table first_marks as
  select enabled_after_deal_seq from public.workflow where id = '7e200000-0000-0000-0000-0000000000f1';

select tests.login_as_service_role();
select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e200000-0000-0000-0000-0000000000c3', 'deal_milestone.removed', '{}'::jsonb, null, 'service');
update public.workflow set enabled = true, name = 'On signing again' where id = '7e200000-0000-0000-0000-0000000000f1';
reset role;

select is(
  (select enabled_after_deal_seq from public.workflow where id = '7e200000-0000-0000-0000-0000000000f1'),
  (select enabled_after_deal_seq from first_marks),
  'saving a workflow that stays enabled keeps its marks'
);

select tests.login_as_service_role();
update public.workflow set enabled = false where id = '7e200000-0000-0000-0000-0000000000f1';
update public.workflow set enabled = true where id = '7e200000-0000-0000-0000-0000000000f1';
reset role;

select cmp_ok(
  (select enabled_after_deal_seq from public.workflow where id = '7e200000-0000-0000-0000-0000000000f1'),
  '>',
  (select enabled_after_deal_seq from first_marks),
  're-enabling a workflow moves its marks to the newer events'
);

select hasnt_column('public', 'workflow', 'enabled_at', 'the marks replaced the enable time');

select tests.login_as('te_owner');

select throws_ok(
  $$ update public.workflow set enabled_after_deal_seq = 0 where id = '7e200000-0000-0000-0000-0000000000f1' $$,
  '42501',
  null,
  'a person cannot move how far a workflow has seen'
);

select throws_ok(
  $$ select public.append_deal_event('7e200000-0000-0000-0000-0000000000d2', 'deal',
       '7e200000-0000-0000-0000-0000000000d2', 'deal.loi_signed', '{}'::jsonb) $$,
  '42501',
  null,
  'a person cannot record an LOI signing directly'
);

select * from finish();
rollback;
