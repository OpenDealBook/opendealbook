begin;
select no_plan();

select tests.create_user('rf_owner');
select tests.create_user('rf_other');

select tests.login_as_service_role();
select public.create_team_account('RF Team', tests.get_uid('rf_owner'), 'rf-team');
select public.create_team_account('RF Other', tests.get_uid('rf_other'), 'rf-other');

insert into public.firm (id, account_id, name) values
  ('af000000-0000-0000-0000-00000000f001', tests.account_id('rf-team'), 'Harbor Plumbing'),
  ('af000000-0000-0000-0000-00000000f002', tests.account_id('rf-team'), 'Idle Bakery'),
  ('af000000-0000-0000-0000-00000000f003', tests.account_id('rf-other'), 'Elsewhere Dental');

select col_not_null('public', 'deal', 'firm_id', 'every deal has a firm');

select tests.login_as('rf_owner');

select throws_ok(
  $$ select public.append_deal_event('af000000-0000-0000-0000-0000000000d9', 'deal',
       'af000000-0000-0000-0000-0000000000d9', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('rf-team'), 'description', 'No business')) $$,
  '23514', 'a new deal needs a firm',
  'a deal created without a firm is refused'
);

select throws_ok(
  $$ select public.append_deal_event('af000000-0000-0000-0000-0000000000d8', 'deal',
       'af000000-0000-0000-0000-0000000000d8', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('rf-team'),
         'firm_id', 'af000000-0000-0000-0000-00000000f003', 'description', 'Borrowed business')) $$,
  '42501', 'rows cannot link across teams',
  'a deal created with another team''s firm is refused'
);

select lives_ok(
  $$ select public.append_deal_event('af000000-0000-0000-0000-0000000000d1', 'deal',
       'af000000-0000-0000-0000-0000000000d1', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('rf-team'),
         'firm_id', 'af000000-0000-0000-0000-00000000f001', 'description', 'Harbor deal')) $$,
  'a deal created with its team''s firm is accepted'
);

select throws_ok(
  $$ delete from public.firm where id = 'af000000-0000-0000-0000-00000000f001' $$,
  '23503', 'Move or delete its deals first',
  'a firm that still has deals cannot be deleted'
);

select lives_ok(
  $$ delete from public.firm where id = 'af000000-0000-0000-0000-00000000f002' $$,
  'a firm with no deals can be deleted'
);

reset role;

select lives_ok(
  $$ delete from public.accounts where id = tests.account_id('rf-team') $$,
  'deleting a team still removes its firms and deals'
);

select is(
  (select count(*)::int from public.deal where id = 'af000000-0000-0000-0000-0000000000d1'),
  0,
  'the team''s deal went with it'
);

select * from finish();
rollback;
