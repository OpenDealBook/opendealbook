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

insert into public.ai_call_log (account_id, model, credits, created_at)
values
  (tests.account_id('monthly-caps-co'), 'claude-opus-5-5', 6, now()),
  (tests.account_id('monthly-caps-co'), 'claude-opus-5-5', 500,
   date_trunc('month', now() at time zone 'utc') at time zone 'utc' - interval '1 second');

select lives_ok(
  $$ update public.outreach_setting
     set letter_monthly_cap = 0, lookup_monthly_cap = 100000, ai_monthly_credit_cap = 10000000
     where account_id = tests.account_id('monthly-caps-co') $$,
  'caps of 0, 100,000 lookups and 10,000,000 AI credits are accepted'
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
  $$ update public.outreach_setting set ai_monthly_credit_cap = 10000001
     where account_id = tests.account_id('monthly-caps-co') $$,
  '23514',
  null,
  'an AI credit cap over 10,000,000 is refused'
);

update public.outreach_setting set ai_monthly_credit_cap = 10
where account_id = tests.account_id('monthly-caps-co');

select is(
  public.ai_credits_used_this_month(tests.account_id('monthly-caps-co')),
  6.0000,
  'credits used this month leave out last month'
);

create temp table reserved as
select public.reserve_ai_call(tests.account_id('monthly-caps-co'), 'gpt-4o', 4) as id;

select is(
  (select row(l.credits, l.settled_at)::text
   from reserved r join public.ai_call_log l on l.id = r.id),
  '(4.0000,)',
  'a reservation that fits the cap exactly is logged holding its estimate, unsettled'
);

select is(
  public.reserve_ai_call(tests.account_id('monthly-caps-co'), 'gpt-4o', 0.0001),
  null::uuid,
  'a reservation past the cap is refused'
);

select is(
  public.ai_credits_used_this_month(tests.account_id('monthly-caps-co')),
  10.0000,
  'held estimates count as used'
);

update public.outreach_setting set ai_monthly_credit_cap = 5
where account_id = tests.account_id('monthly-caps-co');

select isnt(
  public.reserve_ai_call(tests.account_id('monthly-caps-co'), 'llama-local', 0),
  null::uuid,
  'a call costing no credits is logged even past the cap'
);

update public.outreach_setting set ai_monthly_credit_cap = 10
where account_id = tests.account_id('monthly-caps-co');

select tests.login_as('mc_lead');
select isnt_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('monthly-caps-co') $$,
  'a deal lead with deals.manage reads the team ai_call_log rows'
);
select is(
  public.ai_credits_used_this_month(tests.account_id('monthly-caps-co')),
  10.0000,
  'a deal lead reads the credits used this month'
);

select tests.login_as('mc_member');
select is_empty(
  $$ select 1 from public.ai_call_log where account_id = tests.account_id('monthly-caps-co') $$,
  'a member without deals.manage or settings.manage cannot read ai_call_log rows'
);
select is(
  public.ai_credits_used_this_month(tests.account_id('monthly-caps-co')),
  0::numeric,
  'a member without access reads no credits used'
);

select tests.login_as_service_role();

create temp table held as
with rows as (
  insert into public.ai_call_log (account_id, model, credits, created_at)
  values
    (tests.account_id('monthly-caps-co'), 'gpt-4o', 7, now() - interval '61 minutes'),
    (tests.account_id('monthly-caps-co'), 'gpt-4o', 3, now() - interval '59 minutes')
  returning id, credits
)
select id, credits from rows;

select public.reserve_ai_call(tests.account_id('monthly-caps-co'), 'llama-local', 0);

select results_eq(
  $$ select h.credits, l.credits, l.settled_at is not null
     from held h join public.ai_call_log l on l.id = h.id
     order by h.credits $$,
  $$ values (3.0000::numeric(12,4), 3.0000::numeric(12,4), false), (7.0000, 0.0000, true) $$,
  'a reservation releases a hold left unsettled for over an hour and keeps a fresher one'
);

select * from finish();
rollback;
