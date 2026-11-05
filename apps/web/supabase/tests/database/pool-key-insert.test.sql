begin;
select no_plan();

select tests.create_user('pool_key_owner');

select tests.login_as_service_role();
select public.create_team_account('Pool Key Team', tests.get_uid('pool_key_owner'), 'pool-key-team');
select public.create_team_account('Pool Key Gone', tests.get_uid('pool_key_owner'), 'pool-key-gone');

select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id(d.slug), 'firm_id', tests.create_firm(tests.account_id(d.slug)),
    'owner_user_id', tests.get_uid('pool_key_owner'), 'description', d.slug), null, 'service')
from (values
  ('d7000000-0000-0000-0000-000000000001'::uuid, 'pool-key-team'),
  ('d7000000-0000-0000-0000-000000000002'::uuid, 'pool-key-gone')) as d (id, slug);

create temp table gone_team as select tests.account_id('pool-key-gone') as id;
delete from public.accounts where slug = 'pool-key-gone';

select is(
  public.insert_activity_pool_key('PK-A1', 'd7000000-0000-0000-0000-000000000001', tests.account_id('pool-key-team'), 'fp'),
  true,
  'insert_activity_pool_key reports a key written while the team exists'
);
select is(
  (select account_id from public.activity_pool_key where pseudonym = 'PK-A1'),
  tests.account_id('pool-key-team'),
  'the activity key links the pseudonym to the team'
);
select is(
  public.insert_activity_pool_key('PK-A2', 'd7000000-0000-0000-0000-000000000002', (select id from gone_team), 'fp'),
  false,
  'insert_activity_pool_key reports no key once the team is gone'
);
select is_empty(
  $$ select 1 from public.activity_pool_key where pseudonym = 'PK-A2' $$,
  'no activity key is written once the team is gone'
);

select is(
  public.insert_comp_pool_key('PK-C1', 'd7000000-0000-0000-0000-000000000001', tests.account_id('pool-key-team'), 'fp'),
  true,
  'insert_comp_pool_key reports a key written while the team exists'
);
select is(
  (select account_id from public.comp_pool_key where pseudonym = 'PK-C1'),
  tests.account_id('pool-key-team'),
  'the comp key links the pseudonym to the team'
);
select is(
  public.insert_comp_pool_key('PK-C2', 'd7000000-0000-0000-0000-000000000002', (select id from gone_team), 'fp'),
  false,
  'insert_comp_pool_key reports no key once the team is gone'
);
select is_empty(
  $$ select 1 from public.comp_pool_key where pseudonym = 'PK-C2' $$,
  'no comp key is written once the team is gone'
);

select tests.login_as('pool_key_owner');
select throws_ok(
  $$ select public.insert_activity_pool_key('PK-X1', 'd7000000-0000-0000-0000-000000000001', tests.account_id('pool-key-team'), 'fp') $$,
  '42501',
  null,
  'authenticated cannot call insert_activity_pool_key'
);
select throws_ok(
  $$ select public.insert_comp_pool_key('PK-X2', 'd7000000-0000-0000-0000-000000000001', tests.account_id('pool-key-team'), 'fp') $$,
  '42501',
  null,
  'authenticated cannot call insert_comp_pool_key'
);

select tests.logout();
select throws_ok(
  $$ select public.insert_activity_pool_key('PK-X3', 'd7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'fp') $$,
  '42501',
  null,
  'anon cannot call insert_activity_pool_key'
);
select throws_ok(
  $$ select public.insert_comp_pool_key('PK-X4', 'd7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'fp') $$,
  '42501',
  null,
  'anon cannot call insert_comp_pool_key'
);

select * from finish();
rollback;
