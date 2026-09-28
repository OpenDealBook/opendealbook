begin;
select no_plan();

-- Two independent teams, plus an external participant granted on Deal A only.
select tests.create_user('rs_a_owner');
select tests.create_user('rs_b_owner');
select tests.create_user('rs_ext');

select tests.login_as_service_role();
select public.create_team_account('RS Acct A', tests.get_uid('rs_a_owner'), 'rs-acct-a');
select public.create_team_account('RS Acct B', tests.get_uid('rs_b_owner'), 'rs-acct-b');

-- A deal in each account. Deal A carries an asking_price so the revenue gate is
-- observable in the pipeline analytics.
insert into public.deal (id, account_id, owner_user_id, description, asking_price)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), tests.get_uid('rs_a_owner'), 'Deal A', 1000000),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), tests.get_uid('rs_b_owner'), 'Deal B', 500000);

-- One row per new deal-scoped table under each deal.
insert into public.meeting_series (id, deal_id, account_id, status)
values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'active'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'active');

insert into public.meeting (id, deal_id, account_id, series_id, type, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000a01', 'aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'aaaaaaaa-0000-0000-0000-0000000000f1', 'weekly', 'held'),
  ('aaaaaaaa-0000-0000-0000-000000000a02', 'aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'aaaaaaaa-0000-0000-0000-0000000000f1', 'weekly', 'skipped'),
  ('bbbbbbbb-0000-0000-0000-000000000a01', 'bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'bbbbbbbb-0000-0000-0000-0000000000f1', 'weekly', 'held');

insert into public.meeting_action_item (meeting_id, deal_id, account_id, description, owner_is_seller)
values
  ('aaaaaaaa-0000-0000-0000-000000000a01', 'aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'Send financials', false),
  ('bbbbbbbb-0000-0000-0000-000000000a01', 'bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'Send financials', false);

insert into public.hr_audit_engagement (deal_id, account_id, provider)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'third_party'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'internal');

insert into public.employee (deal_id, account_id, name)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'Jordan Lee'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'Sam Doe');

insert into public.client_transition (deal_id, account_id, client_name)
values
  ('aaaaaaaa-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-a'), 'Acme LLC'),
  ('bbbbbbbb-0000-0000-0000-0000000000e1', tests.account_id('rs-acct-b'), 'Beta LLC');

-- The external participant reaches Deal A through a deal_participant grant.
insert into public.deal_participant (deal_id, user_id, party, scope, permission)
values ('aaaaaaaa-0000-0000-0000-0000000000e1', tests.get_uid('rs_ext'), 'buyer', 'deal', 'view');

-- ---- Deal-scoped visibility: a participant sees their granted deal ----
select tests.login_as('rs_ext');

select isnt_empty(
  $$ select 1 from public.meeting_series where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees meeting_series on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.meeting where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees meetings on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.meeting_action_item where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees meeting action items on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.hr_audit_engagement where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees the hr audit engagement on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.employee where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees employees on their granted deal'
);
select isnt_empty(
  $$ select 1 from public.client_transition where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a participant sees client transitions on their granted deal'
);

-- The same participant has no grant on Deal B and sees none of its rows.
select is_empty(
  $$ select 1 from public.meeting where deal_id = 'bbbbbbbb-0000-0000-0000-0000000000e1' $$,
  'a participant cannot see meetings on a deal they have no grant on'
);
select is_empty(
  $$ select 1 from public.employee where deal_id = 'bbbbbbbb-0000-0000-0000-0000000000e1' $$,
  'a participant cannot see employees on a deal they have no grant on'
);

-- ---- Foreign account denial: a member of B cannot see A's rows ----
select tests.login_as('rs_b_owner');

select is_empty(
  $$ select 1 from public.meeting_action_item where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a foreign account member cannot see another account meeting action items'
);
select is_empty(
  $$ select 1 from public.hr_audit_engagement where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a foreign account member cannot see another account hr audit engagement'
);
select is_empty(
  $$ select 1 from public.client_transition where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000e1' $$,
  'a foreign account member cannot see another account client transitions'
);

-- ---- Analytics: account-scoped aggregates, revenue gate, foreign denial ----
select tests.login_as('rs_a_owner');

select isnt_empty(
  $$ select 1 from public.analytics_pipeline_by_stage(tests.account_id('rs-acct-a'), true) where deal_count > 0 $$,
  'a member gets pipeline aggregates for their own account'
);
select is(
  (select total_revenue from public.analytics_pipeline_by_stage(tests.account_id('rs-acct-a'), true) where stage = 'sourced'),
  1000000::numeric,
  'pipeline analytics reports revenue when include_revenue is true'
);
select is(
  (select total_revenue from public.analytics_pipeline_by_stage(tests.account_id('rs-acct-a'), false) where stage = 'sourced'),
  0::numeric,
  'pipeline analytics zeroes revenue when include_revenue is false'
);

select tests.login_as('rs_b_owner');
select is_empty(
  $$ select 1 from public.analytics_pipeline_by_stage(tests.account_id('rs-acct-a'), true) $$,
  'a foreign account gets no rows from another account pipeline analytics'
);

select * from finish();
rollback;
