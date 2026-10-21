begin;
select no_plan();

select tests.create_user('cs_owner');
select tests.create_user('cs_other');

select tests.login_as_service_role();
select public.create_team_account('Starter Co', tests.get_uid('cs_owner'), 'cs-starter');
select public.create_team_account('Starter Two', tests.get_uid('cs_other'), 'cs-starter-2');

-- ---- Starter templates on a new team ----
select results_eq(
  $$ select name, kind, is_default, (select count(*) from public.checklist_template_item i where i.template_id = t.id)
     from public.checklist_template t where account_id = tests.account_id('cs-starter') order by name $$,
  $$ values
       ('Day 0 Takeover'::text, 'post_close'::text, true, 23::bigint),
       ('First 90 Days'::text, 'post_close'::text, false, 18::bigint),
       ('Standard Closing'::text, 'closing'::text, true, 13::bigint),
       ('Standard Diligence'::text, 'diligence'::text, true, 23::bigint) $$,
  'a new team starts with the four starter templates, defaults marked'
);
select is_empty(
  $$ select 1 from public.checklist_template where account_id = tests.get_uid('cs_owner') $$,
  'a personal account gets none'
);
select results_eq(
  $$ select i.category, i.title, i.due_offset_days
     from public.checklist_template_item i join public.checklist_template t on t.id = i.template_id
     where t.account_id = tests.account_id('cs-starter') and t.name = 'Standard Diligence'
     order by i.sort_order limit 2 $$,
  $$ values ('Financial'::text, '3 years business tax returns'::varchar, 7),
            ('Financial'::text, '3 years P&L and balance sheets, plus year-to-date'::varchar, 7) $$,
  'diligence items keep their order and count days after LOI signed'
);
select results_eq(
  $$ select i.category, i.due_offset_days
     from public.checklist_template_item i join public.checklist_template t on t.id = i.template_id
     where t.account_id = tests.account_id('cs-starter') and t.name = 'Standard Closing'
       and i.title in ('APA final and signed', 'Funds flow confirmed and wired') order by i.sort_order $$,
  $$ values ('Legal'::text, -14), ('Funds'::text, 0) $$,
  'closing items count back from the target close'
);

select results_eq(
  $$ select distinct i.review_offset_days from public.checklist_template_item i
     join public.checklist_template t on t.id = i.template_id where t.account_id = tests.account_id('cs-starter') $$,
  $$ values (3) $$,
  'every starter item allows three days to review'
);

-- ---- One default per team and kind ----
select throws_ok(
  $$ insert into public.checklist_template (account_id, name, kind, is_default)
     values (tests.account_id('cs-starter'), 'Second default', 'diligence', true) $$,
  '23505', null, 'a team has one default per kind'
);
select lives_ok(
  $$ insert into public.checklist_template (account_id, name, kind, is_default)
     values (tests.account_id('cs-starter'), 'Extra', 'diligence', false) $$,
  'other templates of the kind are not defaults'
);

-- ---- Seeding is repeatable and backfills a team that lacks templates ----
select lives_ok(
  $$ select public.seed_starter_checklist_templates(tests.account_id('cs-starter')) $$,
  'seeding a team that has the templates'
);
select is(
  (select count(*) from public.checklist_template where account_id = tests.account_id('cs-starter') and name in ('Day 0 Takeover', 'First 90 Days', 'Standard Closing', 'Standard Diligence')),
  4::bigint, 'seeding twice adds nothing'
);

delete from public.checklist_template where account_id = tests.account_id('cs-starter-2');
select lives_ok(
  $$ select public.seed_starter_checklist_templates(tests.account_id('cs-starter-2')) $$,
  'seeding a team that lacks them'
);
select is(
  (select count(*) from public.checklist_template where account_id = tests.account_id('cs-starter-2') and is_default),
  3::bigint, 'the backfilled team has its three defaults'
);

select tests.login_as('cs_owner');
select throws_ok(
  $$ select public.seed_starter_checklist_templates(tests.account_id('cs-starter')) $$,
  '42501', null, 'seeding is not open to signed-in users'
);

-- ---- Recomputing due dates from a deal's anchors ----
-- Deal d1 has an LOI signed and a closing target. Deal d2 has no anchors.
-- Each item has a due date (receive by) and a review due date (reviewed by).
select tests.login_as_service_role();
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal',
  '5c000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cs-starter'), 'owner_user_id', tests.get_uid('cs_owner'),
    'description', 'Anchored'), null, 'service');
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d2', 'deal',
  '5c000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cs-starter'), 'owner_user_id', tests.get_uid('cs_owner'),
    'description', 'Unanchored'), null, 'service');

select tests.login_as('cs_owner');

select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5c000000-0000-0000-0000-0000000000a1', 'deal_milestone.set', '{"kind": "loi_signed", "actual_on": "2026-10-01"}'::jsonb);
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5c000000-0000-0000-0000-0000000000a2', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-11-30"}'::jsonb);

select results_eq(
  $$ select due_at, review_due_at from public.checklist_anchor_dates('5c000000-0000-0000-0000-0000000000d1', 'diligence', 7, 3) $$,
  $$ values ('2026-10-08T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz) $$,
  'a new item''s dates come from the anchor plus its offsets'
);
select results_eq(
  $$ select due_at, review_due_at from public.checklist_anchor_dates('5c000000-0000-0000-0000-0000000000d1', 'post_close', 5, 3) $$,
  $$ values (null::timestamptz, null::timestamptz) $$,
  'a missing anchor gives no dates'
);

select public.append_deal_events('5c000000-0000-0000-0000-0000000000d1', jsonb_build_array(
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c1', 'event_type', 'checklist_item.added',
    'payload', '{"title": "diligence", "kind": "diligence", "due_offset_days": 7}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c2', 'event_type', 'checklist_item.added',
    'payload', '{"title": "closing", "kind": "closing", "due_offset_days": -14}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c3', 'event_type', 'checklist_item.added',
    'payload', '{"title": "post close", "kind": "post_close", "due_offset_days": 5}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c4', 'event_type', 'checklist_item.added',
    'payload', '{"title": "offer", "kind": "offer", "due_offset_days": 3}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c5', 'event_type', 'checklist_item.added',
    'payload', '{"title": "received", "kind": "diligence", "due_offset_days": 7, "status": "received", "due_at": "2026-01-01T00:00:00Z"}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c7', 'event_type', 'checklist_item.added',
    'payload', '{"title": "reviewed", "kind": "diligence", "due_offset_days": 7, "status": "reviewed", "due_at": "2026-01-01T00:00:00Z", "review_due_at": "2026-01-04T00:00:00Z"}'::jsonb),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', '5c000000-0000-0000-0000-0000000000c8', 'event_type', 'checklist_item.added',
    'payload', '{"title": "slow review", "kind": "diligence", "due_offset_days": 7, "review_offset_days": 5}'::jsonb)
));
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d2', 'checklist_item',
  '5c000000-0000-0000-0000-0000000000c6', 'checklist_item.added',
  '{"title": "stale", "kind": "diligence", "due_offset_days": 7, "due_at": "2026-02-01T00:00:00Z", "review_due_at": "2026-02-04T00:00:00Z"}'::jsonb);

select lives_ok(
  $$ select public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d1') $$,
  'a deal''s dates are recomputed'
);
select results_eq(
  $$ select title, due_at, review_due_at from public.checklist_item where deal_id = '5c000000-0000-0000-0000-0000000000d1' order by title $$,
  $$ values
       ('closing'::varchar, '2026-11-16T00:00:00Z'::timestamptz, '2026-11-19T00:00:00Z'::timestamptz),
       ('diligence'::varchar, '2026-10-08T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz),
       ('offer'::varchar, null::timestamptz, null::timestamptz),
       ('post close'::varchar, null::timestamptz, null::timestamptz),
       ('received'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-10-11T00:00:00Z'::timestamptz),
       ('reviewed'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-01-04T00:00:00Z'::timestamptz),
       ('slow review'::varchar, '2026-10-08T00:00:00Z'::timestamptz, '2026-10-13T00:00:00Z'::timestamptz) $$,
  'receive dates freeze once received, review dates once reviewed; offer items and a missing anchor are left'
);
select lives_ok(
  $$ select public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d2') $$,
  'a deal without anchors is recomputed'
);
select results_eq(
  $$ select due_at, review_due_at from public.checklist_item where id = '5c000000-0000-0000-0000-0000000000c6' $$,
  $$ values (null::timestamptz, null::timestamptz) $$,
  'an open item loses both dates when its anchor is missing'
);

select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5c000000-0000-0000-0000-0000000000a2', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-11-30", "actual_on": "2026-10-10"}'::jsonb);
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5c000000-0000-0000-0000-0000000000a1', 'deal_milestone.set', '{"kind": "loi_signed", "actual_on": "2026-10-05"}'::jsonb);
select public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select title, due_at, review_due_at from public.checklist_item where deal_id = '5c000000-0000-0000-0000-0000000000d1' order by title $$,
  $$ values
       ('closing'::varchar, '2026-11-16T00:00:00Z'::timestamptz, '2026-11-19T00:00:00Z'::timestamptz),
       ('diligence'::varchar, '2026-10-12T00:00:00Z'::timestamptz, '2026-10-15T00:00:00Z'::timestamptz),
       ('offer'::varchar, null::timestamptz, null::timestamptz),
       ('post close'::varchar, '2026-10-15T00:00:00Z'::timestamptz, '2026-10-18T00:00:00Z'::timestamptz),
       ('received'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-10-15T00:00:00Z'::timestamptz),
       ('reviewed'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-01-04T00:00:00Z'::timestamptz),
       ('slow review'::varchar, '2026-10-12T00:00:00Z'::timestamptz, '2026-10-17T00:00:00Z'::timestamptz) $$,
  'moving the anchors moves open dates; post close counts from the actual close'
);

select is(
  public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d1'), 0,
  'recomputing again changes nothing'
);

select tests.login_as_service_role();
select public.replay_deal('5c000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select title, due_at, review_due_at from public.checklist_item where deal_id = '5c000000-0000-0000-0000-0000000000d1' and title in ('diligence', 'received', 'reviewed') order by title $$,
  $$ values
       ('diligence'::varchar, '2026-10-12T00:00:00Z'::timestamptz, '2026-10-15T00:00:00Z'::timestamptz),
       ('received'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-10-15T00:00:00Z'::timestamptz),
       ('reviewed'::varchar, '2026-01-01T00:00:00Z'::timestamptz, '2026-01-04T00:00:00Z'::timestamptz) $$,
  'replay keeps the recomputed dates'
);

-- ---- The webhook path, a service role with no user ----
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '5c000000-0000-0000-0000-0000000000a1', 'deal_milestone.set', '{"kind": "loi_signed", "actual_on": "2026-10-06"}'::jsonb, null, 'service');
select cmp_ok(
  public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d1'), '>', 0,
  'the service role recomputes a deal''s dates'
);
select is(
  (select due_at from public.checklist_item where id = '5c000000-0000-0000-0000-0000000000c1'),
  '2026-10-13T00:00:00Z'::timestamptz, 'and the dates move'
);
select is(
  (select actor_kind::text from public.deal_event where deal_id = '5c000000-0000-0000-0000-0000000000d1' and event_type = 'checklist_item.due_recomputed' order by deal_seq desc limit 1),
  'service', 'the log records the service as the actor'
);

-- ---- One schedule per deal ----
select lives_ok(
  $$ insert into public.diligence_schedule (deal_id, account_id) values ('5c000000-0000-0000-0000-0000000000d1', tests.account_id('cs-starter')) $$,
  'a deal gets a diligence schedule'
);
select throws_ok(
  $$ insert into public.diligence_schedule (deal_id, account_id) values ('5c000000-0000-0000-0000-0000000000d1', tests.account_id('cs-starter')) $$,
  '23505', null, 'a deal has one diligence schedule'
);

-- ---- A template is applied once per deal ----
select tests.login_as('cs_owner');
select lives_ok(
  $$ insert into public.deal_checklist_application (deal_id, template_id, account_id)
     select '5c000000-0000-0000-0000-0000000000d1', t.id, t.account_id from public.checklist_template t
     where t.account_id = tests.account_id('cs-starter') and t.name = 'Standard Diligence' $$,
  'the team records that it applied a template'
);
select throws_ok(
  $$ insert into public.deal_checklist_application (deal_id, template_id, account_id)
     select '5c000000-0000-0000-0000-0000000000d1', t.id, t.account_id from public.checklist_template t
     where t.account_id = tests.account_id('cs-starter') and t.name = 'Standard Diligence' $$,
  '23505', null, 'the same template is not applied to a deal twice'
);
select lives_ok(
  $$ insert into public.deal_checklist_application (deal_id, template_id, account_id)
     select '5c000000-0000-0000-0000-0000000000d1', t.id, t.account_id from public.checklist_template t
     where t.account_id = tests.account_id('cs-starter') and t.name = 'Standard Closing' $$,
  'another template applies to the same deal'
);
select is(
  (select count(*) from public.deal_checklist_application where deal_id = '5c000000-0000-0000-0000-0000000000d1'), 2::bigint,
  'the team reads its applications'
);

select tests.login_as('cs_other');
select is_empty($$ select 1 from public.deal_checklist_application $$, 'another team reads none');
select throws_ok(
  $$ insert into public.deal_checklist_application (deal_id, template_id, account_id)
     select '5c000000-0000-0000-0000-0000000000d1', t.id, t.account_id from public.checklist_template t
     where t.account_id = tests.account_id('cs-starter-2') limit 1 $$,
  '42501', null, 'another team cannot record an application on this deal'
);

select tests.login_as('cs_other');
select throws_ok(
  $$ select public.recompute_checklist_due_dates('5c000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'another team cannot recompute this deal'
);

select * from finish();
rollback;
