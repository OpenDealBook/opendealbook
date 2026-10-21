begin;
select no_plan();

select tests.create_user('lm_owner');

select tests.login_as_service_role();
select public.create_team_account('Live Migration Acct', tests.get_uid('lm_owner'), 'live-migration-acct');

reset role;
drop index public.ux_offer_live_per_deal;

select tests.login_as('lm_owner');
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'deal',
  'd1d1d1d1-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('live-migration-acct'), 'description', 'Duplicate Live Deal'));
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'offer',
  'd1d1d1d1-0000-0000-0000-0000000000e1', 'offer.drafted', '{}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'offer',
  'd1d1d1d1-0000-0000-0000-0000000000e1', 'offer.accepted', '{}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'offer',
  'd1d1d1d1-0000-0000-0000-0000000000e2', 'offer.drafted', '{}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'offer',
  'd1d1d1d1-0000-0000-0000-0000000000e3', 'offer.drafted', '{}'::jsonb);
select public.append_deal_event('d1d1d1d1-0000-0000-0000-0000000000d1', 'offer',
  'd1d1d1d1-0000-0000-0000-0000000000e3', 'offer.rejected', '{}'::jsonb);

select public.append_deal_event('d2d2d2d2-0000-0000-0000-0000000000d2', 'deal',
  'd2d2d2d2-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('live-migration-acct'), 'description', 'Duplicate Draft Deal'));
select public.append_deal_event('d2d2d2d2-0000-0000-0000-0000000000d2', 'offer',
  'd2d2d2d2-0000-0000-0000-0000000000e4', 'offer.drafted', '{}'::jsonb);
select public.append_deal_event('d2d2d2d2-0000-0000-0000-0000000000d2', 'offer',
  'd2d2d2d2-0000-0000-0000-0000000000e5', 'offer.drafted', '{}'::jsonb);

reset role;
select public.expire_superseded_live_offers();

select results_eq(
  $$ select id::text, status from public.offer
     where deal_id in ('d1d1d1d1-0000-0000-0000-0000000000d1', 'd2d2d2d2-0000-0000-0000-0000000000d2')
     order by id $$,
  $$ values ('d1d1d1d1-0000-0000-0000-0000000000e1', 'accepted'),
            ('d1d1d1d1-0000-0000-0000-0000000000e2', 'expired'),
            ('d1d1d1d1-0000-0000-0000-0000000000e3', 'rejected'),
            ('d2d2d2d2-0000-0000-0000-0000000000e4', 'expired'),
            ('d2d2d2d2-0000-0000-0000-0000000000e5', 'draft') $$,
  'an accepted offer is kept over newer live ones; otherwise the newest live offer is kept'
);

select results_eq(
  $$ select aggregate_id::text, actor_kind::text from public.deal_event
     where deal_id in ('d1d1d1d1-0000-0000-0000-0000000000d1', 'd2d2d2d2-0000-0000-0000-0000000000d2')
       and event_type = 'offer.expired'
     order by aggregate_id $$,
  $$ values ('d1d1d1d1-0000-0000-0000-0000000000e2', 'system'),
            ('d2d2d2d2-0000-0000-0000-0000000000e4', 'system') $$,
  'each expiry is recorded as an offer.expired event by the system'
);

select lives_ok(
  $$ create unique index ux_offer_live_per_deal on public.offer (deal_id)
       where status not in ('rejected', 'withdrawn', 'expired') $$,
  'the live-offer index applies after the cleanup'
);

select * from finish();
rollback;
