begin;
select no_plan();

-- One team, its owner, an external user used as a notification recipient.
select tests.create_user('es_owner');
select tests.create_user('es_other');

select tests.login_as_service_role();
select public.create_team_account('ES Acct', tests.get_uid('es_owner'), 'es-acct');

-- Deals are born of the log now that direct DML is revoked; each deal.created
-- is the deal's deal_seq 1. A data-room folder is not evented and is seeded
-- directly.
select tests.login_as('es_owner');
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal',
  'd1d1d1d1-0000-0000-0000-000000000001', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('es-acct'), 'description', 'Deal One'));
select public.append_deal_event('d2d2d2d2-0000-0000-0000-000000000002', 'deal',
  'd2d2d2d2-0000-0000-0000-000000000002', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('es-acct'), 'description', 'Deal Two'));
select public.append_deal_event('d3d3d3d3-0000-0000-0000-000000000003', 'deal',
  'd3d3d3d3-0000-0000-0000-000000000003', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('es-acct'), 'description', 'Deal Three'));
select public.append_deal_event('d4d4d4d4-0000-0000-0000-000000000004', 'deal',
  'd4d4d4d4-0000-0000-0000-000000000004', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('es-acct'), 'description', 'Deal Four'));
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('f1f1f1f1-0000-0000-0000-000000000001', tests.account_id('es-acct'), 'd1d1d1d1-0000-0000-0000-000000000001', 'Root'),
  ('f1f1f1f1-0000-0000-0000-0000000000b2', tests.account_id('es-acct'), 'd1d1d1d1-0000-0000-0000-000000000001', 'Financials');

-- ---- append + projection ----
select lives_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
       'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.added',
       '{"title":"NDA","category":"legal"}'::jsonb) $$,
  'append_deal_event accepts a checklist_item.added event'
);
select is(
  (select event_type from public.deal_event where aggregate_id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'checklist_item.added',
  'the event is written to the log'
);
select is(
  (select title from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'NDA',
  'the projector materialised the checklist_item row'
);
select is(
  (select deal_seq from public.deal_event where aggregate_id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  2::bigint,
  'the checklist_item.added is deal_seq 2 (deal.created is deal_seq 1)'
);

-- ---- gapless sequencing ----
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.status_changed', '{"status":"requested"}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.status_changed', '{"status":"received"}'::jsonb);
select is(
  (select array_agg(aggregate_seq order by aggregate_seq) from public.deal_event
     where aggregate_type = 'checklist_item' and aggregate_id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  array[1, 2, 3]::bigint[],
  'aggregate_seq is gapless across appends'
);
select is(
  (select status::text from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  'received',
  'the latest status_changed event is projected'
);

-- ---- optimistic concurrency ----
select lives_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
       'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.status_changed',
       '{"status":"reviewed"}'::jsonb, 3) $$,
  'append with a matching expected_aggregate_seq succeeds'
);
select throws_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
       'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.status_changed',
       '{"status":"reviewed"}'::jsonb, 2) $$,
  '40001',
  null,
  'a stale expected_aggregate_seq raises a serialization error'
);

-- ---- impossible states crash ----
select throws_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
       'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.frobnicate', '{}'::jsonb) $$,
  null, null,
  'an unknown event_type raises'
);
select throws_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'nonsense',
       'c1c1c1c1-0000-0000-0000-000000000001', 'nonsense.happened', '{}'::jsonb) $$,
  null, null,
  'an unknown aggregate_type raises'
);
select throws_ok(
  $$ select public.append_deal_event(
       'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
       'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.status_changed',
       '{"status":"bogus"}'::jsonb) $$,
  '22P02', null,
  'an illegal enum payload value raises on the cast'
);

-- ---- tombstone semantics ----
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-000000000001', 'checklist_item.removed', '{}'::jsonb);
select is_empty(
  $$ select 1 from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-000000000001' $$,
  'a removed checklist_item is filtered from reads'
);
select tests.login_as_service_role();
select isnt(
  (select removed_at from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-000000000001'),
  null,
  'the tombstoned row still exists with removed_at set'
);

-- ---- every-64 snapshot at aggregate and deal level ----
select tests.login_as('es_owner');
select public.append_deal_event('d2d2d2d2-0000-0000-0000-000000000002', 'checklist_item',
  'c2c2c2c2-0000-0000-0000-000000000002', 'checklist_item.added', '{"title":"Snap"}'::jsonb);
do $$
begin
  for i in 1..63 loop
    perform public.append_deal_event('d2d2d2d2-0000-0000-0000-000000000002', 'checklist_item',
      'c2c2c2c2-0000-0000-0000-000000000002', 'checklist_item.status_changed', '{"status":"requested"}'::jsonb);
  end loop;
end;
$$;
select is(
  (select count(*) from public.deal_event_snapshot
     where aggregate_type = 'checklist_item' and aggregate_id = 'c2c2c2c2-0000-0000-0000-000000000002' and through_seq = 64),
  1::bigint,
  'an aggregate snapshot is written at the 64th aggregate event'
);
select is(
  (select count(*) from public.deal_event_snapshot
     where aggregate_type = 'deal-wide' and aggregate_id = 'd2d2d2d2-0000-0000-0000-000000000002' and through_seq = 64),
  1::bigint,
  'a deal-wide snapshot is written at the 64th deal event'
);

-- ---- replay rebuilds projections ----
select public.append_deal_event('d3d3d3d3-0000-0000-0000-000000000003', 'checklist_item',
  'c3c3c3c3-0000-0000-0000-000000000003', 'checklist_item.added', '{"title":"Diligence"}'::jsonb);
select public.append_deal_event('d3d3d3d3-0000-0000-0000-000000000003', 'checklist_item',
  'c3c3c3c3-0000-0000-0000-000000000003', 'checklist_item.status_changed', '{"status":"received"}'::jsonb);
select tests.login_as_service_role();
select lives_ok(
  $$ select public.replay_deal('d3d3d3d3-0000-0000-0000-000000000003') $$,
  'replay_deal runs'
);
select is(
  (select count(*) from public.checklist_item where deal_id = 'd3d3d3d3-0000-0000-0000-000000000003'),
  1::bigint,
  'replay leaves exactly one projected row, not duplicates'
);
select is(
  (select status::text from public.checklist_item where id = 'c3c3c3c3-0000-0000-0000-000000000003'),
  'received',
  'replay rebuilds the projected state from the log'
);
select lives_ok(
  $$ select public.replay_deal('d3d3d3d3-0000-0000-0000-000000000003') $$,
  'replay_deal is idempotent'
);
select is(
  (select count(*) from public.checklist_item where deal_id = 'd3d3d3d3-0000-0000-0000-000000000003'),
  1::bigint,
  'a second replay still leaves exactly one row'
);

-- ---- batch append is atomic ----
select tests.login_as('es_owner');
select lives_ok(
  $$ select public.append_deal_events('d4d4d4d4-0000-0000-0000-000000000004',
       '[{"aggregate_type":"checklist_item","aggregate_id":"c4c4c4c4-0000-0000-0000-00000000004a","event_type":"checklist_item.added","payload":{"title":"A"}},
         {"aggregate_type":"checklist_item","aggregate_id":"c4c4c4c4-0000-0000-0000-00000000004b","event_type":"checklist_item.added","payload":{"title":"B"}}]'::jsonb) $$,
  'a batch append writes several events'
);
select is(
  (select count(*) from public.checklist_item where deal_id = 'd4d4d4d4-0000-0000-0000-000000000004'),
  2::bigint,
  'both batched events are projected'
);
select throws_ok(
  $$ select public.append_deal_events('d4d4d4d4-0000-0000-0000-000000000004',
       '[{"aggregate_type":"checklist_item","aggregate_id":"c4c4c4c4-0000-0000-0000-00000000004c","event_type":"checklist_item.added","payload":{"title":"C"}},
         {"aggregate_type":"checklist_item","aggregate_id":"c4c4c4c4-0000-0000-0000-00000000004c","event_type":"checklist_item.status_changed","payload":{"status":"bogus"}}]'::jsonb) $$,
  '22P02', null,
  'a batch with an invalid event raises'
);
select is_empty(
  $$ select 1 from public.deal_event where aggregate_id = 'c4c4c4c4-0000-0000-0000-00000000004c' $$,
  'the first event of a failed batch is rolled back with the rest'
);

-- ---- replay GUC suppresses side-effect notifications ----
-- The owner moves the stage so the participant (a different user) is the
-- recipient; counts run as service_role, which is not subject to the
-- recipient-only read policy on notifications.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal_participant',
  'aaaaaaaa-0000-0000-0000-0000000000aa', 'deal_participant.added',
  ('{"party":"buyer","user_id":"' || tests.get_uid('es_other')::text || '"}')::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal',
  'd1d1d1d1-0000-0000-0000-000000000001', 'deal.stage_changed', '{"stage":"diligence"}'::jsonb);
select tests.login_as_service_role();
select is(
  (select count(*) from public.notifications where recipient_user_id = tests.get_uid('es_other')),
  1::bigint,
  'a live stage move notifies the participant'
);
select set_config('odb.replay', 'on', true);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal',
  'd1d1d1d1-0000-0000-0000-000000000001', 'deal.stage_changed', '{"stage":"loi"}'::jsonb, null, 'service');
select is(
  (select count(*) from public.notifications where recipient_user_id = tests.get_uid('es_other')),
  1::bigint,
  'a stage move under the replay GUC emits no notification'
);
select set_config('odb.replay', 'off', true);

-- ---- every core projector materialises its row ----
select tests.login_as('es_owner');
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'approval',
  'a0000000-0000-0000-0000-0000000000a1', 'approval.requested', '{"subject":"loi"}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'approval',
  'a0000000-0000-0000-0000-0000000000a1', 'approval.decided', '{"decision":"approved"}'::jsonb);
select is(
  (select decision::text from public.approval where id = 'a0000000-0000-0000-0000-0000000000a1'),
  'approved', 'approval projector applies request then decision');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal_box',
  'b0000000-0000-0000-0000-0000000000b1', 'deal_box.set',
  '{"version":1,"criteria_json":{"min_revenue":100},"broker_summary":"s"}'::jsonb);
select is(
  (select version from public.deal_box where id = 'b0000000-0000-0000-0000-0000000000b1'),
  1, 'deal_box projector materialises the row');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'dr_document',
  'e0000000-0000-0000-0000-0000000000e1', 'dr_document.added',
  '{"folder_id":"f1f1f1f1-0000-0000-0000-000000000001","name":"cim.pdf","storage_path":"deals/d1/cim.pdf"}'::jsonb);
select is(
  (select name from public.dr_document where id = 'e0000000-0000-0000-0000-0000000000e1'),
  'cim.pdf', 'dr_document projector materialises the row');
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'dr_document',
  'e0000000-0000-0000-0000-0000000000e1', 'dr_document.removed', '{}'::jsonb);
select is_empty(
  $$ select 1 from public.dr_document where id = 'e0000000-0000-0000-0000-0000000000e1' $$,
  'a removed dr_document is filtered from reads');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting',
  '30000000-0000-0000-0000-000000000031', 'meeting.scheduled', '{"type":"weekly"}'::jsonb);
select is(
  (select type from public.meeting where id = '30000000-0000-0000-0000-000000000031'),
  'weekly', 'meeting projector materialises the row');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting_action_item',
  '40000000-0000-0000-0000-000000000041', 'meeting_action_item.added',
  '{"meeting_id":"30000000-0000-0000-0000-000000000031","description":"Send NDA"}'::jsonb);
select is(
  (select description from public.meeting_action_item where id = '40000000-0000-0000-0000-000000000041'),
  'Send NDA', 'meeting_action_item projector materialises the row');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'contract',
  '50000000-0000-0000-0000-000000000051', 'contract.created', '{"type":"loi","status":"draft"}'::jsonb);
select is(
  (select type from public.contract where id = '50000000-0000-0000-0000-000000000051'),
  'loi', 'contract projector materialises the row');

-- ---- projector update/move verbs ----
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'contract',
  '50000000-0000-0000-0000-000000000051', 'contract.version_set', '{"current_version":2,"status":"signed"}'::jsonb);
select is(
  (select current_version from public.contract where id = '50000000-0000-0000-0000-000000000051'),
  2, 'contract.version_set updates the current version');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting',
  '30000000-0000-0000-0000-000000000031', 'meeting.updated', '{"status":"held","notes":"went well"}'::jsonb);
select is(
  (select status::text from public.meeting where id = '30000000-0000-0000-0000-000000000031'),
  'held', 'meeting.updated applies the new status');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting_action_item',
  '40000000-0000-0000-0000-000000000041', 'meeting_action_item.updated', '{"status":"received"}'::jsonb);
select is(
  (select status::text from public.meeting_action_item where id = '40000000-0000-0000-0000-000000000041'),
  'received', 'meeting_action_item.updated applies the new status');
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting_action_item',
  '40000000-0000-0000-0000-000000000041', 'meeting_action_item.removed', '{}'::jsonb);
select is_empty(
  $$ select 1 from public.meeting_action_item where id = '40000000-0000-0000-0000-000000000041' $$,
  'a removed meeting_action_item is filtered from reads');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'dr_document',
  'e0000000-0000-0000-0000-0000000000e2', 'dr_document.added',
  '{"folder_id":"f1f1f1f1-0000-0000-0000-000000000001","name":"pnl.pdf","storage_path":"deals/d1/pnl.pdf"}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'dr_document',
  'e0000000-0000-0000-0000-0000000000e2', 'dr_document.moved',
  '{"folder_id":"f1f1f1f1-0000-0000-0000-0000000000b2"}'::jsonb);
select is(
  (select folder_id from public.dr_document where id = 'e0000000-0000-0000-0000-0000000000e2'),
  'f1f1f1f1-0000-0000-0000-0000000000b2'::uuid, 'dr_document.moved reparents the document');

select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal',
  'd1d1d1d1-0000-0000-0000-000000000001', 'deal.updated', '{"notes":"call the broker","asking_price":250000}'::jsonb);
select is(
  (select notes from public.deal where id = 'd1d1d1d1-0000-0000-0000-000000000001'),
  'call the broker', 'deal.updated applies editable fields');

-- ---- deal.created is authorised on the account and projected ----
select public.append_deal_event('d5d5d5d5-0000-0000-0000-000000000005', 'deal',
  'd5d5d5d5-0000-0000-0000-000000000005', 'deal.created',
  ('{"account_id":"' || tests.account_id('es-acct')::text || '","description":"Born of an event"}')::jsonb);
select tests.login_as_service_role();
select is(
  (select description from public.deal where id = 'd5d5d5d5-0000-0000-0000-000000000005'),
  'Born of an event', 'deal.created projects a new deal row');

-- ---- writes only through the RPC: no direct grant on the log ----
select tests.login_as('es_owner');
select throws_ok(
  $$ insert into public.deal_event (account_id, deal_id, aggregate_type, aggregate_id, event_type, actor_kind, deal_seq, aggregate_seq)
     values (tests.account_id('es-acct'), 'd1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
             'c1c1c1c1-0000-0000-0000-000000000099', 'checklist_item.added', 'user', 99, 99) $$,
  '42501', null,
  'a direct insert into the event log is refused');

-- ---- lossless field coverage: newly-carried projector fields ----
-- A schedule with two weeks on d1, so schedule_week_id references resolve.
select tests.login_as_service_role();
insert into public.diligence_schedule (id, deal_id, account_id) values
  ('dc000000-0000-0000-0000-0000000000d1', 'd1d1d1d1-0000-0000-0000-000000000001', tests.account_id('es-acct'));
insert into public.schedule_week (id, schedule_id, account_id, week_no) values
  ('dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000d1', tests.account_id('es-acct'), 1),
  ('dc000000-0000-0000-0000-0000000000d3', 'dc000000-0000-0000-0000-0000000000d1', tests.account_id('es-acct'), 2);
select tests.login_as('es_owner');

-- deal.created carries the financial and box fields, not only description.
select public.append_deal_event('d6d6d6d6-0000-0000-0000-000000000006', 'deal',
  'd6d6d6d6-0000-0000-0000-000000000006', 'deal.created',
  ('{"account_id":"' || tests.account_id('es-acct')::text || '","description":"Rich deal","asking_price":1250000,"revenue_ttm":800000,"sde_ttm":300000,"ebitda_ttm":250000,"notes":"hot lead","deal_box_version":2}')::jsonb);
select is(
  (select asking_price from public.deal where id = 'd6d6d6d6-0000-0000-0000-000000000006'),
  1250000::numeric, 'deal.created projects asking_price');
select is(
  (select notes from public.deal where id = 'd6d6d6d6-0000-0000-0000-000000000006'),
  'hot lead', 'deal.created projects notes');
select is(
  (select deal_box_version from public.deal where id = 'd6d6d6d6-0000-0000-0000-000000000006'),
  2, 'deal.created projects deal_box_version');

-- checklist_item.added carries priority, deal_killer, and the schedule week.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-0000000000c5', 'checklist_item.added',
  '{"title":"Prioritised","priority":7,"deal_killer":true,"schedule_week_id":"dc000000-0000-0000-0000-0000000000d2"}'::jsonb);
select is(
  (select priority from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-0000000000c5'),
  7, 'checklist_item.added projects priority');
select is(
  (select deal_killer from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-0000000000c5'),
  true, 'checklist_item.added projects deal_killer');
select is(
  (select schedule_week_id from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-0000000000c5'),
  'dc000000-0000-0000-0000-0000000000d2'::uuid, 'checklist_item.added projects schedule_week_id');

-- checklist_item.rescheduled moves the item to another week.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-0000000000c5', 'checklist_item.rescheduled',
  '{"schedule_week_id":"dc000000-0000-0000-0000-0000000000d3"}'::jsonb);
select is(
  (select schedule_week_id from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-0000000000c5'),
  'dc000000-0000-0000-0000-0000000000d3'::uuid, 'checklist_item.rescheduled updates schedule_week_id');

-- status_changed carries reviewed_by when the payload names the reviewer.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'checklist_item',
  'c1c1c1c1-0000-0000-0000-0000000000c5', 'checklist_item.status_changed',
  ('{"status":"reviewed","reviewed_by":"' || tests.get_uid('es_owner')::text || '"}')::jsonb);
select is(
  (select reviewed_by from public.checklist_item where id = 'c1c1c1c1-0000-0000-0000-0000000000c5'),
  tests.get_uid('es_owner'), 'checklist_item.status_changed carries reviewed_by');

-- meeting.scheduled carries notes.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting',
  '30000000-0000-0000-0000-000000000032', 'meeting.scheduled',
  '{"type":"weekly","notes":"kickoff agenda"}'::jsonb);
select is(
  (select notes from public.meeting where id = '30000000-0000-0000-0000-000000000032'),
  'kickoff agenda', 'meeting.scheduled projects notes');

-- meeting_action_item.added carries schedule_week_id.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'meeting_action_item',
  '40000000-0000-0000-0000-000000000042', 'meeting_action_item.added',
  '{"meeting_id":"30000000-0000-0000-0000-000000000032","description":"Prep pack","schedule_week_id":"dc000000-0000-0000-0000-0000000000d2"}'::jsonb);
select is(
  (select schedule_week_id from public.meeting_action_item where id = '40000000-0000-0000-0000-000000000042'),
  'dc000000-0000-0000-0000-0000000000d2'::uuid, 'meeting_action_item.added projects schedule_week_id');

-- deal_participant.added carries scope_id for a scoped grant.
select public.append_deal_event('d1d1d1d1-0000-0000-0000-000000000001', 'deal_participant',
  'aaaaaaaa-0000-0000-0000-0000000000ab', 'deal_participant.added',
  ('{"party":"buyer","user_id":"' || tests.get_uid('es_other')::text || '","scope_id":"f1f1f1f1-0000-0000-0000-000000000001"}')::jsonb);
select is(
  (select scope_id from public.deal_participant where id = 'aaaaaaaa-0000-0000-0000-0000000000ab'),
  'f1f1f1f1-0000-0000-0000-000000000001'::uuid, 'deal_participant.added projects scope_id');

select * from finish();
rollback;
