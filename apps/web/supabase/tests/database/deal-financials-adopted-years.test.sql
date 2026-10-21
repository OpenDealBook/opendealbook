begin;
select no_plan();

select tests.create_user('years_owner');
select tests.login_as_service_role();
select public.create_team_account('Years', tests.get_uid('years_owner'), 'years');

select tests.login_as('years_owner');
select public.append_deal_event('c0c0c0c0-0000-0000-0000-0000000000c1', 'deal',
  'c0c0c0c0-0000-0000-0000-0000000000c1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('years'), 'description', 'Deal C', 'website', 'https://c.test'));

select public.append_deal_event('c0c0c0c0-0000-0000-0000-0000000000c1', 'deal',
  'c0c0c0c0-0000-0000-0000-0000000000c1', 'deal.financials_adopted',
  '{"adopted_sde":100000,"adopted_years":[
    {"year":1,"debt_service":36000,"dscr":2.7778,"net_cash_flow":64000},
    {"year":2,"debt_service":53142.86,"dscr":2.0699,"net_cash_flow":56857.14},
    {"year":3,"debt_service":70285.71,"dscr":1.7215,"net_cash_flow":50714.29}
  ]}'::jsonb);

select is(
  (select adopted_years -> 2 ->> 'debt_service' from public.deal_financials
    where deal_id = 'c0c0c0c0-0000-0000-0000-0000000000c1'),
  '70285.71',
  'adoption stores the year 3 debt service with the deal financials'
);
select is(
  (select jsonb_array_length(adopted_years) from public.deal_financials
    where deal_id = 'c0c0c0c0-0000-0000-0000-0000000000c1'),
  3,
  'adoption stores years 1 to 3'
);

select public.append_deal_event('c0c0c0c0-0000-0000-0000-0000000000c1', 'deal',
  'c0c0c0c0-0000-0000-0000-0000000000c1', 'deal.financials_adopted',
  '{"adopted_sde":90000,"adopted_years":null}'::jsonb);

select is(
  (select adopted_years from public.deal_financials
    where deal_id = 'c0c0c0c0-0000-0000-0000-0000000000c1'),
  null,
  'adopting a calc saved without years clears the previous years'
);

select * from finish();
rollback;
