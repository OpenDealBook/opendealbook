begin;
select no_plan();

select tests.create_user('cv_owner');
select tests.create_user('cv_counsel');
select tests.create_user('cv_other');

select tests.login_as_service_role();
select public.create_team_account('CV Team', tests.get_uid('cv_owner'), 'cv-team');
reset role;

insert into public.firm (id, account_id, name) values
  ('7c000000-0000-0000-0000-0000000000f1', tests.account_id('cv-team'), 'Brennan Climate');

select tests.login_as_service_role();
select public.append_deal_event('7c000000-0000-0000-0000-0000000000d1', 'deal', '7c000000-0000-0000-0000-0000000000d1',
  'deal.created',
  jsonb_build_object('account_id', tests.account_id('cv-team'), 'owner_user_id', tests.get_uid('cv_owner'),
    'firm_id', '7c000000-0000-0000-0000-0000000000f1', 'description', 'Climate'), null, 'service');
reset role;

insert into public.counsel_visit (user_id, deal_id, area, visited_at) values
  (tests.get_uid('cv_other'), '7c000000-0000-0000-0000-0000000000d1', 'messages', now() - interval '1 day');

select tests.login_as('cv_counsel');

select lives_ok(
  $$ insert into public.counsel_visit (deal_id, area) values ('7c000000-0000-0000-0000-0000000000d1', 'messages')
     on conflict (user_id, deal_id, area) do update set visited_at = excluded.visited_at $$,
  'counsel record their own visit to an area of a deal'
);

select lives_ok(
  $$ insert into public.counsel_visit (deal_id, area) values ('7c000000-0000-0000-0000-0000000000d1', 'messages')
     on conflict (user_id, deal_id, area) do update set visited_at = excluded.visited_at $$,
  'a later visit moves their marker'
);

select results_eq(
  $$ select area from public.counsel_visit $$,
  $$ values ('messages') $$,
  'counsel read only their own visits'
);

select throws_ok(
  $$ insert into public.counsel_visit (user_id, deal_id, area)
     values (tests.get_uid('cv_other'), '7c000000-0000-0000-0000-0000000000d1', 'seller_room') $$,
  '42501', null,
  'nobody records a visit for someone else'
);

select throws_ok(
  $$ insert into public.counsel_visit (deal_id, area) values ('7c000000-0000-0000-0000-0000000000d1', 'contracts') $$,
  '23514', null,
  'only the messages and seller room areas are tracked'
);

select * from finish();
rollback;
