begin;
select no_plan();

select tests.create_user('bn_owner');
select tests.create_user('bn_member');

select tests.login_as_service_role();
select public.create_team_account('BN Team', tests.get_uid('bn_owner'), 'bn-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('bn-team'), tests.get_uid('bn_member'), 'member');

select tests.login_as('bn_member');

select lives_ok(
  $$ insert into public.firm (id, account_id, name, status) values
       ('b5000000-0000-0000-0000-00000000f001', tests.account_id('bn-team'), 'Member Plumbing', 'deal_created') $$,
  'a member who may create deals may create the deal''s business'
);

reset role;

select ok(
  (select count(*) >= 30 from public.industry
   where account_id = tests.account_id('bn-team') and parent_id is null),
  'a new team starts with the standard industry list'
);

select ok(
  (select bool_and(n in (select name from public.industry where account_id = tests.account_id('bn-team')))
   from unnest(array['HVAC', 'Plumbing', 'Electrical', 'Dental', 'Accounting & Bookkeeping', 'Landscaping', 'Home Health Care', 'IT Services']) n),
  'the standard industries cover common small businesses'
);

select is(
  (select count(*)::int from public.industry where account_id = tests.get_uid('bn_owner')),
  0,
  'a personal account gets no industries'
);

select is(
  (select name_confirmed from public.firm where id = 'b5000000-0000-0000-0000-00000000f001'),
  true,
  'a business named on create needs no confirming'
);

select tests.login_as_service_role();

select public.append_deal_event('b5000000-0000-0000-0000-0000000000d1', 'deal',
  'b5000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', tests.create_firm(tests.account_id('bn-team')), 'description', 'Coastal HVAC: profitable shop'),
  null, 'service');
select public.append_deal_event('b5000000-0000-0000-0000-0000000000d2', 'deal',
  'b5000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', tests.create_firm(tests.account_id('bn-team')), 'description', 'Summit Dental; two offices'),
  null, 'service');
select public.append_deal_event('b5000000-0000-0000-0000-0000000000d3', 'deal',
  'b5000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', tests.create_firm(tests.account_id('bn-team')), 'description', 'Brightwave Marketing. Agency in Austin! Growing.'),
  null, 'service');
select public.append_deal_event('b5000000-0000-0000-0000-0000000000d4', 'deal',
  'b5000000-0000-0000-0000-0000000000d4', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', tests.create_firm(tests.account_id('bn-team')), 'description', 'Main St. Bakery'),
  null, 'service');
select public.append_deal_event('b5000000-0000-0000-0000-0000000000d6', 'deal',
  'b5000000-0000-0000-0000-0000000000d6', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', tests.create_firm(tests.account_id('bn-team'))),
  null, 'service');
select public.append_deal_event('b5000000-0000-0000-0000-0000000000d5', 'deal',
  'b5000000-0000-0000-0000-0000000000d5', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('bn-team'), 'firm_id', 'b5000000-0000-0000-0000-00000000f001',
    'description', 'Already named: keep it'),
  null, 'service');

reset role;

select results_eq(
  $$ select name, sort_order from public.dr_folder
     where deal_id = 'b5000000-0000-0000-0000-0000000000d1' order by sort_order $$,
  $$ values ('Financials', 0), ('Legal', 1), ('Operations', 2), ('Tax', 3), ('Other', 4) $$,
  'a new deal starts with the default data room folders'
);

select is(
  (select count(*)::int from public.dr_folder
   where deal_id = 'b5000000-0000-0000-0000-0000000000d1' and parent_id is null),
  5,
  'the default folders sit at the data room root'
);

delete from public.dr_folder where deal_id in ('b5000000-0000-0000-0000-0000000000d2', 'b5000000-0000-0000-0000-0000000000d3');
insert into public.dr_folder (account_id, deal_id, name) values
  (tests.account_id('bn-team'), 'b5000000-0000-0000-0000-0000000000d3', 'Custom');

-- Deals from before every deal had a business: no firm, and a deal.created
-- that never named one.
alter table public.deal alter column firm_id drop not null;
update public.deal set firm_id = null
where id in ('b5000000-0000-0000-0000-0000000000d1', 'b5000000-0000-0000-0000-0000000000d2',
  'b5000000-0000-0000-0000-0000000000d3', 'b5000000-0000-0000-0000-0000000000d4',
  'b5000000-0000-0000-0000-0000000000d6');
update public.deal_event set payload = payload - 'firm_id'
where event_type = 'deal.created'
  and deal_id in ('b5000000-0000-0000-0000-0000000000d1', 'b5000000-0000-0000-0000-0000000000d2',
    'b5000000-0000-0000-0000-0000000000d3', 'b5000000-0000-0000-0000-0000000000d4',
    'b5000000-0000-0000-0000-0000000000d6');

select public.backfill_deal_defaults();

select lives_ok(
  $$ alter table public.deal alter column firm_id set not null $$,
  'after the backfill every deal has a firm'
);

select results_eq(
  $$ select d.id::text, f.name::text, f.name_confirmed, f.status from public.deal d join public.firm f on f.id = d.firm_id
     where d.id in ('b5000000-0000-0000-0000-0000000000d1', 'b5000000-0000-0000-0000-0000000000d2',
       'b5000000-0000-0000-0000-0000000000d3', 'b5000000-0000-0000-0000-0000000000d4',
       'b5000000-0000-0000-0000-0000000000d5', 'b5000000-0000-0000-0000-0000000000d6')
     order by d.id $$,
  $$ values ('b5000000-0000-0000-0000-0000000000d1', 'Coastal HVAC', false, 'deal_created'),
            ('b5000000-0000-0000-0000-0000000000d2', 'Summit Dental', false, 'deal_created'),
            ('b5000000-0000-0000-0000-0000000000d3', 'Brightwave Marketing', false, 'deal_created'),
            ('b5000000-0000-0000-0000-0000000000d4', 'Main St', false, 'deal_created'),
            ('b5000000-0000-0000-0000-0000000000d5', 'Member Plumbing', true, 'deal_created'),
            ('b5000000-0000-0000-0000-0000000000d6', 'Untitled deal', false, 'deal_created') $$,
  'a deal with no business is named from its description up to the first colon, semicolon or sentence end, or Untitled deal without one, pending confirmation'
);

select public.replay_deal('b5000000-0000-0000-0000-0000000000d1');

select is(
  (select f.name::text from public.deal d join public.firm f on f.id = d.firm_id
   where d.id = 'b5000000-0000-0000-0000-0000000000d1'),
  'Coastal HVAC',
  'the backfilled business survives a replay of the deal'
);

select results_eq(
  $$ select name from public.dr_folder
     where deal_id = 'b5000000-0000-0000-0000-0000000000d2' order by sort_order $$,
  $$ values ('Financials'), ('Legal'), ('Operations'), ('Tax'), ('Other') $$,
  'a deal with no folders gets the default folders'
);

select results_eq(
  $$ select name from public.dr_folder where deal_id = 'b5000000-0000-0000-0000-0000000000d3' $$,
  $$ values ('Custom') $$,
  'a deal that already has folders keeps only its own'
);

select * from finish();
rollback;
