begin;
select no_plan();

select tests.create_user('defaults_owner');
select tests.create_user('defaults_member');
select tests.create_user('defaults_outsider');
select tests.login_as_service_role();
select public.create_team_account('Defaults', tests.get_uid('defaults_owner'), 'defaults');
select public.create_team_account('Other', tests.get_uid('defaults_outsider'), 'other');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('defaults'), tests.get_uid('defaults_member'), 'member');

select tests.login_as('defaults_owner');
select lives_ok(
  $$ insert into public.deal_calc_defaults (account_id, after_standby)
     values (tests.account_id('defaults'), 'remaining_term') $$,
  'an owner sets the team default for what happens after standby'
);
select throws_ok(
  $$ update public.deal_calc_defaults set after_standby = 'interest_only'
     where account_id = tests.account_id('defaults') $$,
  '23514',
  null,
  'only remaining_term and full_term_after_standby are allowed'
);

select is(
  (select year_basis from public.deal_calc_defaults
    where account_id = tests.account_id('defaults')),
  'months_from_close',
  'a team default year basis starts as months from close'
);
select lives_ok(
  $$ update public.deal_calc_defaults set year_basis = 'fiscal_year'
     where account_id = tests.account_id('defaults') $$,
  'an owner sets the team default year basis to fiscal year'
);
select throws_ok(
  $$ update public.deal_calc_defaults set year_basis = 'calendar_year'
     where account_id = tests.account_id('defaults') $$,
  '23514',
  null,
  'only months_from_close and fiscal_year are allowed'
);

select is(
  (select scenario_paths from public.deal_calc_defaults
    where account_id = tests.account_id('defaults')),
  null,
  'a team starts without saved scenario path defaults'
);
select lives_ok(
  $$ update public.deal_calc_defaults
     set scenario_paths = '{"worst":{"revenue_loss":0.1,"growth":0,"margin_change":-0.02,"rate_shift":0.02},"great":{"revenue_loss":0,"growth":0.05,"margin_change":0.02,"rate_shift":-0.01}}'
     where account_id = tests.account_id('defaults') $$,
  'an owner saves worst and great path defaults'
);
select is(
  (select scenario_paths -> 'great' ->> 'growth' from public.deal_calc_defaults
    where account_id = tests.account_id('defaults')),
  '0.05',
  'the saved great path growth reads back'
);

select is(
  (select minimum_dscr from public.deal_calc_defaults
    where account_id = tests.account_id('defaults')),
  1.25::numeric,
  'the team minimum DSCR starts at 1.25'
);
select lives_ok(
  $$ update public.deal_calc_defaults set minimum_dscr = 1.4
     where account_id = tests.account_id('defaults') $$,
  'an owner sets the team minimum DSCR'
);

select throws_ok(
  $$ update public.deal_calc_defaults set minimum_dscr = 0
     where account_id = tests.account_id('defaults') $$,
  '23514',
  null,
  'a minimum DSCR of zero is refused'
);

select tests.login_as('defaults_member');
select is(
  (select after_standby from public.deal_calc_defaults
    where account_id = tests.account_id('defaults')),
  'remaining_term',
  'a team member reads the team default'
);

select tests.login_as('defaults_outsider');
select is_empty(
  $$ select 1 from public.deal_calc_defaults where account_id = tests.account_id('defaults') $$,
  'another account cannot read the team default'
);
select throws_ok(
  $$ insert into public.deal_calc_defaults (account_id, after_standby)
     values (tests.account_id('defaults'), 'full_term_after_standby') $$,
  '42501',
  null,
  'another account cannot write the team default'
);

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_source' and column_name = 'after_standby'),
  'YES',
  'funding_source.after_standby is nullable so old rows keep full term after standby'
);

select tests.login_as('defaults_owner');
select throws_ok(
  $$ insert into public.funding_source (account_id, calc_version_id, type, amount, after_standby)
     values (tests.account_id('defaults'), gen_random_uuid(), 'seller_financing', 1, 'interest_only') $$,
  '23514',
  null,
  'a funding source only takes the two after-standby choices'
);

select * from finish();
rollback;
