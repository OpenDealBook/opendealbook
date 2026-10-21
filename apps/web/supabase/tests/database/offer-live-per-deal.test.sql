begin;
select no_plan();

select tests.create_user('lo_owner');

select tests.login_as_service_role();
select public.create_team_account('Live Offer Acct', tests.get_uid('lo_owner'), 'live-offer-acct');

select tests.login_as('lo_owner');
select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'deal',
  'c1c1c1c1-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('live-offer-acct'), 'description', 'Live Offer Deal'));

select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
  'c1c1c1c1-0000-0000-0000-0000000000e1', 'offer.drafted', '{}'::jsonb);

select throws_ok(
  $$ select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
       'c1c1c1c1-0000-0000-0000-0000000000e2', 'offer.drafted', '{}'::jsonb) $$,
  '23505', null,
  'a second offer cannot be drafted while a draft offer is live'
);

select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
  'c1c1c1c1-0000-0000-0000-0000000000e1', 'offer.countered', '{}'::jsonb);

select throws_ok(
  $$ select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
       'c1c1c1c1-0000-0000-0000-0000000000e2', 'offer.drafted', '{}'::jsonb) $$,
  '23505', null,
  'a second offer cannot be drafted while a countered offer is live'
);

select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
  'c1c1c1c1-0000-0000-0000-0000000000e1', 'offer.rejected', '{}'::jsonb);

select lives_ok(
  $$ select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
       'c1c1c1c1-0000-0000-0000-0000000000e2', 'offer.drafted', '{}'::jsonb) $$,
  'a new offer can be drafted once the previous one is rejected'
);

select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
  'c1c1c1c1-0000-0000-0000-0000000000e2', 'offer.accepted', '{}'::jsonb);

select throws_ok(
  $$ select public.append_deal_event('c1c1c1c1-0000-0000-0000-0000000000d1', 'offer',
       'c1c1c1c1-0000-0000-0000-0000000000e3', 'offer.drafted', '{}'::jsonb) $$,
  '23505', null,
  'a second offer cannot be drafted while an offer is accepted'
);

select is(
  (select count(*)::int from public.offer where deal_id = 'c1c1c1c1-0000-0000-0000-0000000000d1'),
  2,
  'only the rejected and the accepted offer exist'
);

select * from finish();
rollback;
