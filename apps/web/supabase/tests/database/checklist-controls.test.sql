begin;
select no_plan();

select tests.create_user('cc_owner');
select tests.create_user('cc_other');
select tests.create_user('cc_dealsonly');
select tests.create_user('cc_worker');
select tests.create_user('cc_lockowner');

select tests.login_as_service_role();
select public.create_team_account('Controls Co', tests.get_uid('cc_owner'), 'cc-team');
select public.create_team_account('Other Co', tests.get_uid('cc_other'), 'cc-other');
select public.create_team_account('Locked Co', tests.get_uid('cc_lockowner'), 'cc-locked');

reset role;
insert into public.roles (name, hierarchy_level) values ('deals_only', 99);
insert into public.role_permissions (role, permission) values ('deals_only', 'deals.manage'), ('deals_only', 'deals.work');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('cc-team'), tests.get_uid('cc_dealsonly'), 'deals_only'),
  (tests.account_id('cc-team'), tests.get_uid('cc_worker'), 'member');
update public.accounts set trial_ends_at = now() - interval '1 day' where id = tests.account_id('cc-locked');

create temp table locked_template as select id from public.checklist_template
  where account_id = tests.account_id('cc-locked') and name = 'Day 0 Takeover';
grant select on locked_template to authenticated;

select tests.login_as_service_role();
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'deal', 'cc000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cc-team'), 'firm_id', tests.create_firm(tests.account_id('cc-team')), 'owner_user_id', tests.get_uid('cc_owner'), 'description', 'One'), null, 'service');
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d2', 'deal', 'cc000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cc-team'), 'firm_id', tests.create_firm(tests.account_id('cc-team')), 'owner_user_id', tests.get_uid('cc_owner'), 'description', 'Two'), null, 'service');

-- ---- Making a template the default ----
select tests.login_as('cc_owner');

select lives_ok(
  $$ select public.set_default_checklist_template(t.id) from public.checklist_template t
     where t.account_id = tests.account_id('cc-team') and t.name = 'First 90 Days' $$,
  'the team makes another template its default'
);
select results_eq(
  $$ select name, kind from public.checklist_template where account_id = tests.account_id('cc-team') and is_default order by kind $$,
  $$ values ('Standard Closing'::text, 'closing'::text), ('Standard Diligence'::text, 'diligence'::text), ('First 90 Days'::text, 'post_close'::text) $$,
  'it replaces the default of its kind and no other'
);
select throws_ok(
  $$ select public.set_default_checklist_template((select id from locked_template)) $$,
  '42501', null, 'another team''s template cannot be made a default'
);
select tests.login_as('cc_worker');
select throws_ok(
  $$ select public.set_default_checklist_template(t.id) from public.checklist_template t
     where t.account_id = tests.account_id('cc-team') and t.name = 'Day 0 Takeover' $$,
  '42501', null, 'it needs deals.manage'
);
select tests.login_as('cc_lockowner');
select throws_ok(
  $$ select public.set_default_checklist_template((select id from locked_template)) $$,
  '42501', 'team is read-only', 'a locked team cannot change its default'
);

-- ---- Recomputing dates for anyone who may edit the deal's milestones ----
select tests.login_as('cc_owner');
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cc000000-0000-0000-0000-0000000000c1',
  'checklist_item.added', '{"title": "diligence", "kind": "diligence", "due_offset_days": 7}'::jsonb);

select tests.login_as('cc_dealsonly');
select lives_ok(
  $$ select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'deal_milestone', 'cc000000-0000-0000-0000-0000000000a1',
       'deal_milestone.set', '{"kind": "loi_signed", "actual_on": "2026-10-01"}'::jsonb) $$,
  'someone who edits milestones moves the LOI date'
);
select is(
  public.recompute_checklist_due_dates('cc000000-0000-0000-0000-0000000000d1'), 1,
  'and the checklist dates follow'
);
select is(
  (select due_at from public.checklist_item where id = 'cc000000-0000-0000-0000-0000000000c1'),
  '2026-10-08T00:00:00Z'::timestamptz, 'the date moved'
);
select is(
  (select actor_ref from public.deal_event where event_type = 'checklist_item.due_recomputed' order by deal_seq desc limit 1),
  tests.get_uid('cc_dealsonly'), 'the log records who did it'
);
select tests.login_as('cc_other');
select throws_ok(
  $$ select public.recompute_checklist_due_dates('cc000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'someone with neither permission cannot recompute'
);

-- ---- Applying a template once while its items live ----
select tests.login_as('cc_owner');
create temp table std as select id from public.checklist_template
  where account_id = tests.account_id('cc-team') and name = 'Standard Diligence';
grant select on std to authenticated, service_role;

select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), true,
  'a template is claimed for a deal'
);
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), false,
  'it is not claimed again before its items are added'
);
select public.append_deal_events('cc000000-0000-0000-0000-0000000000d1', jsonb_build_array(
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', 'cc000000-0000-0000-0000-0000000000b1', 'event_type', 'checklist_item.added',
    'payload', jsonb_build_object('title', 'From template', 'source_template_id', (select id from std))),
  jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', 'cc000000-0000-0000-0000-0000000000b2', 'event_type', 'checklist_item.added',
    'payload', jsonb_build_object('title', 'From template too', 'source_template_id', (select id from std)))
));
select is(
  (select count(*) from public.checklist_item where source_template_id = (select id from std)), 2::bigint,
  'items remember the template they came from'
);
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), false,
  'it stays claimed while its items live'
);
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cc000000-0000-0000-0000-0000000000b1', 'checklist_item.removed');
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), false,
  'one live item is enough to hold the claim'
);
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cc000000-0000-0000-0000-0000000000b2', 'checklist_item.removed');
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), true,
  'once none of its items live, it can be applied again'
);
select lives_ok(
  $$ delete from public.deal_checklist_application where deal_id = 'cc000000-0000-0000-0000-0000000000d1' $$,
  'a claim with no live items can be released'
);
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)), true,
  'and claimed again'
);
select public.append_deal_event('cc000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cc000000-0000-0000-0000-0000000000b3',
  'checklist_item.added', jsonb_build_object('title', 'Live again', 'source_template_id', (select id from std)));
delete from public.deal_checklist_application where deal_id = 'cc000000-0000-0000-0000-0000000000d1';
select is(
  (select count(*) from public.deal_checklist_application where deal_id = 'cc000000-0000-0000-0000-0000000000d1'), 1::bigint,
  'a claim with live items cannot be released'
);
select tests.login_as('cc_other');
select throws_ok(
  $$ select public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d1', (select id from std)) $$,
  '42501', null, 'another team cannot claim on this deal'
);

-- ---- The webhook claims as the service ----
select tests.login_as_service_role();
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d2', (select id from std)), true,
  'the service role claims a template'
);
select is(
  public.claim_checklist_template_application('cc000000-0000-0000-0000-0000000000d2', (select id from std)), false,
  'and is refused a second claim'
);
select lives_ok(
  $$ delete from public.deal_checklist_application where deal_id = 'cc000000-0000-0000-0000-0000000000d2' $$,
  'the service role releases its claim'
);
select is(
  (select count(*) from public.deal_checklist_application where deal_id = 'cc000000-0000-0000-0000-0000000000d2'), 0::bigint,
  'and the claim is gone'
);

-- ---- Creating a schedule and its weeks together ----
select tests.login_as('cc_owner');
select results_eq(
  $$ select created from public.create_diligence_schedule('cc000000-0000-0000-0000-0000000000d1', '2026-11-02', null, tests.get_uid('cc_owner')) $$,
  $$ values (true) $$,
  'a schedule is created'
);
select results_eq(
  $$ select week_no, starts_on, theme from public.schedule_week w join public.diligence_schedule s on s.id = w.schedule_id
     where s.deal_id = 'cc000000-0000-0000-0000-0000000000d1' order by week_no $$,
  $$ values
       (1, '2026-11-02'::date, 'financials/returns'::text),
       (2, '2026-11-09'::date, 'client list/revenue'::text),
       (3, '2026-11-16'::date, 'staff/HR'::text),
       (4, '2026-11-23'::date, 'systems/leases/licenses/insurance'::text),
       (5, '2026-11-30'::date, 'follow-ups'::text),
       (6, '2026-12-07'::date, 'open items/APA schedules'::text) $$,
  'with its six weeks'
);
select results_eq(
  $$ select schedule_id, created from public.create_diligence_schedule('cc000000-0000-0000-0000-0000000000d1', '2027-01-04', null, tests.get_uid('cc_owner')) $$,
  $$ select id, false from public.diligence_schedule where deal_id = 'cc000000-0000-0000-0000-0000000000d1' $$,
  'asking again returns the existing schedule, not created'
);
select is(
  (select count(*) from public.schedule_week w join public.diligence_schedule s on s.id = w.schedule_id where s.deal_id = 'cc000000-0000-0000-0000-0000000000d1'),
  6::bigint, 'and adds no weeks'
);
select tests.login_as('cc_other');
select throws_ok(
  $$ select * from public.create_diligence_schedule('cc000000-0000-0000-0000-0000000000d2', '2026-11-02', null, null) $$,
  '42501', null, 'another team cannot create a schedule'
);
select tests.login_as_service_role();
select results_eq(
  $$ select created from public.create_diligence_schedule('cc000000-0000-0000-0000-0000000000d2', '2026-11-02', null, null) $$,
  $$ values (true) $$,
  'the service role creates one'
);
select results_eq(
  $$ select created from public.create_diligence_schedule(p_deal_id => 'cc000000-0000-0000-0000-0000000000d2', p_start_date => '2026-11-02') $$,
  $$ values (false) $$,
  'the template and the creator may be left out'
);

select * from finish();
rollback;
