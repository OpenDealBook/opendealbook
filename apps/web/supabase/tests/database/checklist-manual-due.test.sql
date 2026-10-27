begin;
select no_plan();

select tests.create_user('md_owner');
select tests.create_user('md_outsider');

select tests.login_as_service_role();
select public.create_team_account('Manual Due Co', tests.get_uid('md_owner'), 'md-manual');

select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'deal',
  '5d000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('md-manual'), 'firm_id', tests.create_firm(tests.account_id('md-manual')), 'owner_user_id', tests.get_uid('md_owner'),
    'description', 'Manual due'), null, 'service');

select tests.login_as('md_owner');

select public.append_deal_events('5d000000-0000-0000-0000-0000000000d1', jsonb_build_array(
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5d000000-0000-0000-0000-0000000000c1', 'event_type', 'checklist_item.added',
    'payload', '{"title": "manual", "kind": "diligence", "due_offset_days": 7}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5d000000-0000-0000-0000-0000000000c2', 'event_type', 'checklist_item.added',
    'payload', '{"title": "anchored", "kind": "diligence", "due_offset_days": 7}'::jsonb)
));

select is(
  (select due_set_manually from public.checklist_item where id = '5d000000-0000-0000-0000-0000000000c2'),
  false, 'a new item''s due date is not set by hand'
);

select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
  '5d000000-0000-0000-0000-0000000000c1', 'checklist_item.details_set', '{"due_at": "2026-12-01T00:00:00Z"}'::jsonb);
select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5d000000-0000-0000-0000-0000000000a1', 'deal_milestone.set', '{"kind": "loi_signed", "actual_on": "2026-10-01"}'::jsonb);
select public.recompute_checklist_due_dates('5d000000-0000-0000-0000-0000000000d1');

select results_eq(
  $$ select title, due_at, review_due_at from public.checklist_item where deal_id = '5d000000-0000-0000-0000-0000000000d1' order by title $$,
  $$ values
       ('anchored'::varchar, '2026-10-08T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz),
       ('manual'::varchar, '2026-12-01T00:00:00Z'::timestamptz, '2026-12-04T00:00:00Z'::timestamptz) $$,
  'a later anchor moves anchored dates and leaves a hand-set due date and its review date'
);

select tests.login_as_service_role();
select public.replay_deal('5d000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select title, due_at, review_due_at, due_set_manually from public.checklist_item where deal_id = '5d000000-0000-0000-0000-0000000000d1' order by title $$,
  $$ values
       ('anchored'::varchar, '2026-10-08T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz, false),
       ('manual'::varchar, '2026-12-01T00:00:00Z'::timestamptz, '2026-12-04T00:00:00Z'::timestamptz, true) $$,
  'replay keeps the hand-set date'
);

-- ---- Back to the scheduled date ----
select tests.login_as('md_owner');
select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
  '5d000000-0000-0000-0000-0000000000c1', 'checklist_item.details_set', '{"use_scheduled_date": true}'::jsonb);
select is(
  (select due_set_manually from public.checklist_item where id = '5d000000-0000-0000-0000-0000000000c1'),
  false, 'using the scheduled date drops the hand-set mark'
);
select public.recompute_checklist_due_dates('5d000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select due_at, review_due_at from public.checklist_item where id = '5d000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('2026-10-08T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz) $$,
  'and the item follows its anchor again'
);

-- ---- Owners come from the deal's team ----
select lives_ok(
  $$ select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
       '5d000000-0000-0000-0000-0000000000c1', 'checklist_item.details_set',
       jsonb_build_object('owner_user_id', tests.get_uid('md_owner'))) $$,
  'a team member can own an item'
);
select throws_ok(
  $$ select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
       '5d000000-0000-0000-0000-0000000000c1', 'checklist_item.details_set',
       jsonb_build_object('owner_user_id', tests.get_uid('md_outsider'))) $$,
  '23514', null, 'someone off the team cannot own an item'
);
select throws_ok(
  $$ select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
       '5d000000-0000-0000-0000-0000000000c9', 'checklist_item.added',
       jsonb_build_object('title', 'outside', 'owner_user_id', tests.get_uid('md_outsider'))) $$,
  '23514', null, 'nor be given a new item'
);
select lives_ok(
  $$ select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'checklist_item',
       '5d000000-0000-0000-0000-0000000000c1', 'checklist_item.details_set', '{"owner_user_id": null}'::jsonb) $$,
  'an owner can be cleared'
);

select * from finish();
rollback;
