begin;
select no_plan();

-- Two teams and an external party granted on team A's deal only.
select tests.create_user('t2_a_owner');
select tests.create_user('t2_b_owner');
select tests.create_user('t2_ext');

select tests.login_as_service_role();
select public.create_team_account('Tier2 A', tests.get_uid('t2_a_owner'), 'tier2-a');
select public.create_team_account('Tier2 B', tests.get_uid('t2_b_owner'), 'tier2-b');

select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal',
  'dddddddd-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tier2-a'), 'firm_id', tests.create_firm(tests.account_id('tier2-a')), 'owner_user_id', tests.get_uid('t2_a_owner'),
    'description', 'Tier2 A deal'), null, 'service');

select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('t2_ext'), 'party', 'seller', 'permission', 'view'), null, 'service');

-- ---- is_trial_active ----
select ok(
  public.is_trial_active(tests.account_id('tier2-a')),
  'a freshly provisioned account is inside its trial'
);

update public.accounts set trial_ends_at = now() - interval '1 day'
  where id = tests.account_id('tier2-b');
select ok(
  not public.is_trial_active(tests.account_id('tier2-b')),
  'an account whose trial_ends_at is past is not in trial'
);

-- ---- Workbooks: platform template is global, tenant rows are account-scoped ----
insert into public.workbook_template (scope, account_id, name, workflow_type)
values ('platform', null, 'Sourcing Platform', 'sourcing');

insert into public.workbook_template (scope, account_id, name, workflow_type)
values ('tenant', tests.account_id('tier2-a'), 'A Tenant Workflow', 'diligence');

insert into public.workbook (template_id, account_id)
select id, tests.account_id('tier2-a')
from public.workbook_template
where account_id = tests.account_id('tier2-a') limit 1;

select tests.login_as('t2_b_owner');
select isnt_empty(
  $$ select 1 from public.workbook_template where scope = 'platform' $$,
  'platform workbook templates are readable by any authenticated user'
);
select is_empty(
  $$ select 1 from public.workbook_template where account_id = tests.account_id('tier2-a') $$,
  'a foreign account cannot see a tenant workbook_template'
);
select is_empty(
  $$ select 1 from public.workbook where account_id = tests.account_id('tier2-a') $$,
  'a foreign account cannot see a workbook'
);

select tests.login_as('t2_a_owner');
select isnt_empty(
  $$ select 1 from public.workbook where account_id = tests.account_id('tier2-a') $$,
  'an account member sees their own workbook'
);

-- ---- Checklist template: apply-shape onto a deal, carrying a deal-killer ----
select tests.login_as_service_role();
insert into public.checklist_template (id, account_id, name)
values ('dddddddd-0000-0000-0000-0000000000c1', tests.account_id('tier2-a'), 'Standard DD');

insert into public.checklist_template_item (template_id, title, priority, deal_killer)
values ('dddddddd-0000-0000-0000-0000000000c1', 'Environmental clearance', 10, true);

-- Applying a template copies each item's shape (priority, deal_killer) onto the
-- deal through a checklist_item.added event per template item.
do $$
declare ti record;
begin
  for ti in
    select title, priority, deal_killer from public.checklist_template_item
    where template_id = 'dddddddd-0000-0000-0000-0000000000c1'
  loop
    perform public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'checklist_item',
      gen_random_uuid(), 'checklist_item.added',
      jsonb_build_object('title', ti.title, 'priority', ti.priority, 'deal_killer', ti.deal_killer),
      null, 'service');
  end loop;
end $$;

select tests.login_as('t2_a_owner');
select isnt_empty(
  $$ select 1 from public.checklist_template_item
     where template_id = 'dddddddd-0000-0000-0000-0000000000c1' and deal_killer and priority = 10 $$,
  'a checklist_template_item can be a deal-killer with a priority'
);
select isnt_empty(
  $$ select 1 from public.checklist_item
     where deal_id = 'dddddddd-0000-0000-0000-0000000000a1' and deal_killer and priority = 10 $$,
  'applying a template carries deal_killer and priority onto the checklist_item'
);

-- ---- Diligence schedule / week / seller question: deal-scoped visibility ----
select tests.login_as_service_role();
insert into public.diligence_schedule (id, deal_id, account_id, start_date)
values ('dddddddd-0000-0000-0000-0000000000e1', 'dddddddd-0000-0000-0000-0000000000a1', tests.account_id('tier2-a'), current_date);

insert into public.schedule_week (id, schedule_id, account_id, week_no, starts_on, theme)
values ('dddddddd-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-0000000000e1', tests.account_id('tier2-a'), 1, current_date, 'Financials');

insert into public.seller_question (deal_id, account_id, schedule_week_id, question)
values ('dddddddd-0000-0000-0000-0000000000a1', tests.account_id('tier2-a'), 'dddddddd-0000-0000-0000-0000000000f1', 'Provide trailing 12-month P&L');

select tests.login_as('t2_ext');
select is_empty(
  $$ select 1 from public.diligence_schedule where deal_id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'a deal participant cannot read the diligence_schedule on their granted deal'
);
select is_empty(
  $$ select 1 from public.schedule_week where id = 'dddddddd-0000-0000-0000-0000000000f1' $$,
  'a deal participant cannot read a schedule_week through its schedule''s deal'
);
select isnt_empty(
  $$ select 1 from public.seller_question where deal_id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'a deal participant sees seller_question on their granted deal'
);

select tests.login_as('t2_b_owner');
select is_empty(
  $$ select 1 from public.diligence_schedule where deal_id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'a foreign account cannot see the diligence_schedule'
);
select is_empty(
  $$ select 1 from public.schedule_week where id = 'dddddddd-0000-0000-0000-0000000000f1' $$,
  'a foreign account cannot see the schedule_week'
);
select is_empty(
  $$ select 1 from public.seller_question where deal_id = 'dddddddd-0000-0000-0000-0000000000a1' $$,
  'a foreign account cannot see seller_question'
);

-- ---- Contract versions: unique(contract, version) and deal-scoped access ----
select tests.login_as_service_role();
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'contract',
  'dddddddd-0000-0000-0000-000000000091', 'contract.created',
  jsonb_build_object('type', 'loi', 'status', 'draft'), null, 'service');

insert into public.contract_version (contract_id, account_id, version, source, party)
values ('dddddddd-0000-0000-0000-000000000091', tests.account_id('tier2-a'), 1, 'editor_save', 'buyer');

select throws_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party)
     values ('dddddddd-0000-0000-0000-000000000091', tests.account_id('tier2-a'), 1, 'upload', 'seller') $$,
  '23505',
  null,
  'a contract_version version must be unique within its contract'
);

select tests.login_as('t2_ext');
select is_empty(
  $$ select 1 from public.contract_version where contract_id = 'dddddddd-0000-0000-0000-000000000091' $$,
  'a deal participant cannot read contract_version through the contract''s deal'
);

select tests.login_as('t2_b_owner');
select is_empty(
  $$ select 1 from public.contract_version where contract_id = 'dddddddd-0000-0000-0000-000000000091' $$,
  'a foreign account cannot see contract_version'
);

-- ---- Legacy dates folded into the timeline ----
select hasnt_column('public', 'deal', 'close_date', 'deal.close_date is folded into the closing milestone');
select hasnt_column('public', 'diligence_schedule', 'target_apa_date',
  'diligence_schedule.target_apa_date is folded into the APA signing milestone');

select tests.login_as_service_role();
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal_milestone',
  'dddddddd-0000-0000-0000-0000000000b1', 'deal_milestone.set',
  '{"kind": "closing", "target_on": "2026-03-01", "actual_on": null}', null, 'service');

select tests.login_as('t2_a_owner');
select is(
  (select d.close_date from public.deal d where d.id = 'dddddddd-0000-0000-0000-0000000000a1'),
  '2026-03-01'::date,
  'a deal''s close_date is its closing target while the closing has no actual'
);

select tests.login_as_service_role();
select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal_milestone',
  'dddddddd-0000-0000-0000-0000000000b1', 'deal_milestone.set',
  '{"kind": "closing", "target_on": "2026-03-01", "actual_on": "2026-02-20"}', null, 'service');
select lives_ok(
  $$ select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal',
       'dddddddd-0000-0000-0000-0000000000a1', 'deal.updated', '{"close_date": "2030-01-01"}', null, 'service') $$,
  'a deal.updated event still carrying a close_date projects'
);

select tests.login_as('t2_a_owner');
select is(
  (select d.close_date from public.deal d where d.id = 'dddddddd-0000-0000-0000-0000000000a1'),
  '2026-02-20'::date,
  'a deal''s close_date is its closing actual, and a stale close_date in deal.updated does not move it'
);

select * from finish();
rollback;
