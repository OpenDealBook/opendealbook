begin;
select no_plan();

select tests.create_user('mc_owner');
select tests.create_user('mc_lead');
select tests.create_user('mc_member');

select tests.login_as_service_role();
select public.create_team_account('Monthly Caps Co', tests.get_uid('mc_owner'), 'monthly-caps-co');

insert into public.accounts_memberships (user_id, account_id, account_role)
values
  (tests.get_uid('mc_lead'), tests.account_id('monthly-caps-co'), 'deal_lead'),
  (tests.get_uid('mc_member'), tests.account_id('monthly-caps-co'), 'member');

insert into public.outreach_setting (account_id, daily_cap)
values (tests.account_id('monthly-caps-co'), 25);

insert into public.ai_call_log (account_id, model)
values (tests.account_id('monthly-caps-co'), 'claude-opus-5-5');

select lives_ok(
  $$ update public.outreach_setting
     set letter_monthly_cap = 0, lookup_monthly_cap = 100000, ai_monthly_cap = 100000
     where account_id = tests.account_id('monthly-caps-co') $$,
  'caps of 0 and 100,000 are accepted'
);

select throws_ok(
  $$ update public.outreach_setting set letter_monthly_cap = 100001
     where account_id = tests.account_id('monthly-caps-co') $$,
  '23514',
  null,
  'a letter cap over 100,000 is refused'
);
select throws_ok(
  $$ update public.outreach_setting set lookup_monthly_cap = -1
     where account_id = tests.account_id('monthly-caps-co') $$,
  '23514',
  null,
  'a negative lookup cap is refused'
);
select throws_ok(
  $$ update public.outreach_setting set ai_monthly_cap = 100001
     where account_id = tests.account_id('monthly-caps-co') $$,
  '23514',
  null,
  'an AI cap over 100,000 is refused'
);

select tests.login_as('mc_lead');
select isnt_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('monthly-caps-co') $$,
  'a deal lead with deals.manage reads the team ai_call_log rows'
);

select tests.login_as('mc_member');
select is_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('monthly-caps-co') $$,
  'a member without deals.manage or settings.manage cannot read ai_call_log rows'
);

select * from finish();
rollback;
