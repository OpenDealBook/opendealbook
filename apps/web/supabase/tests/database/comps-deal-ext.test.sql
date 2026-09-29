begin;
select no_plan();

-- The comps deal-model extension folded through project_deal: capture fields and
-- mapped attribution on deal.created, outcome_reason on deal.stage_changed, and
-- the two duplicate events. deal is a projection, so every assertion writes only
-- through append_deal_event.
select tests.create_user('de_owner');
select tests.login_as_service_role();
select public.create_team_account('DE Acct', tests.get_uid('de_owner'), 'de-acct');

-- A service-actor create: capture fields ride the payload; the actor maps to a
-- workflow.
select public.append_deal_event(
  'f1111111-0000-0000-0000-000000000001', 'deal', 'f1111111-0000-0000-0000-000000000001', 'deal.created',
  jsonb_build_object(
    'account_id', tests.account_id('de-acct'),
    'owner_user_id', tests.get_uid('de_owner'),
    'description', 'Captured deal',
    'capture_method', 'paste_url',
    'source_url', 'https://example.com/listing/1'
  ),
  null, 'service'
);

select is(
  (select capture_method from public.deal where id = 'f1111111-0000-0000-0000-000000000001'),
  'paste_url',
  'deal.created sets capture_method from the payload'
);
select is(
  (select source_url from public.deal where id = 'f1111111-0000-0000-0000-000000000001'),
  'https://example.com/listing/1',
  'deal.created sets source_url from the payload'
);
select is(
  (select created_by_kind from public.deal where id = 'f1111111-0000-0000-0000-000000000001'),
  'workflow',
  'deal.created maps a service actor to created_by_kind workflow'
);

-- A user-actor create maps to the user attribution kind.
select tests.login_as('de_owner');
select public.append_deal_event(
  'f2222222-0000-0000-0000-000000000001', 'deal', 'f2222222-0000-0000-0000-000000000001', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('de-acct'), 'description', 'User deal')
);
select is(
  (select created_by_kind from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  'user',
  'deal.created maps a user actor to created_by_kind user'
);

-- stage_changed carries outcome_reason.
select public.append_deal_event(
  'f2222222-0000-0000-0000-000000000001', 'deal', 'f2222222-0000-0000-0000-000000000001', 'deal.stage_changed',
  jsonb_build_object('stage', 'closed_lost', 'outcome_reason', 'price_gap')
);
select is(
  (select outcome_reason from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  'price_gap',
  'deal.stage_changed records outcome_reason from the payload'
);
select is(
  (select stage from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  'closed_lost',
  'deal.stage_changed still moves the stage'
);

-- duplicate_flagged sets the flag and leaves the stage untouched (D1); cleared
-- reverses it.
select tests.login_as_service_role();
select public.append_deal_event(
  'f2222222-0000-0000-0000-000000000001', 'deal', 'f2222222-0000-0000-0000-000000000001', 'deal.duplicate_flagged',
  jsonb_build_object('duplicate_of', 'f1111111-0000-0000-0000-000000000001'),
  null, 'service'
);
select is(
  (select duplicate_of from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  'f1111111-0000-0000-0000-000000000001'::uuid,
  'deal.duplicate_flagged sets duplicate_of'
);
select is(
  (select stage from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  'closed_lost',
  'deal.duplicate_flagged does not touch the stage'
);

select public.append_deal_event(
  'f2222222-0000-0000-0000-000000000001', 'deal', 'f2222222-0000-0000-0000-000000000001', 'deal.duplicate_cleared',
  '{}'::jsonb, null, 'service'
);
select is(
  (select duplicate_of from public.deal where id = 'f2222222-0000-0000-0000-000000000001'),
  null,
  'deal.duplicate_cleared nulls duplicate_of'
);

select * from finish();
rollback;
