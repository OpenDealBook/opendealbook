begin;
select no_plan();

select tests.create_user('owner_u');
select tests.create_user('member_u');
select tests.create_user('outsider_u');

select tests.login_as_service_role();
select public.create_team_account('Acme', tests.get_uid('owner_u'), 'acme');
select public.create_team_account('Trial Co', tests.get_uid('owner_u'), 'trialco');
select public.create_team_account('Failed Card', tests.get_uid('owner_u'), 'failedcard');
select public.create_team_account('Unpaid Co', tests.get_uid('owner_u'), 'unpaidco');
select public.create_team_account('Many Rows', tests.get_uid('owner_u'), 'manyrows');
select public.create_team_account('Paused Co', tests.get_uid('owner_u'), 'pausedco');
select public.create_team_account('Good Co', tests.get_uid('owner_u'), 'goodco');
select public.create_team_account('Pending Co', tests.get_uid('owner_u'), 'pendingco');

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('acme'), tests.get_uid('member_u'), 'member');

create function pg_temp.stripe_reports(
  team_slug text,
  subscription_id text,
  subscription_status public.subscription_status,
  cancel_at_period_end boolean default false
) returns void as $$
  select public.upsert_subscription(
    target_account_id => tests.account_id(team_slug),
    target_customer_id => 'cus_' || team_slug,
    target_subscription_id => subscription_id,
    active => subscription_status in ('active', 'trialing'),
    status => subscription_status,
    billing_provider => 'stripe',
    cancel_at_period_end => cancel_at_period_end,
    currency => 'usd',
    period_starts_at => now() - interval '20 days',
    period_ends_at => now() + interval '10 days',
    line_items => jsonb_build_array(jsonb_build_object(
      'id', 'si_' || subscription_id, 'product_id', 'prod_team', 'variant_id', 'price_team',
      'type', 'flat', 'quantity', 1, 'interval', 'month', 'interval_count', 1
    ))
  );
$$ language sql;

create function pg_temp.stripe_deletes(subscription_id text) returns void as $$
  update public.subscriptions set status = 'canceled', active = false where id = subscription_id;
$$ language sql;

create function pg_temp.end_trial(account uuid) returns void as $$
  update public.accounts set trial_ends_at = now() - interval '1 day' where id = account;
$$ language sql;

create function pg_temp.locked(team_slug text) returns boolean as $$
  select public.is_account_locked(tests.account_id(team_slug));
$$ language sql;

select is(pg_temp.locked('trialco'), false, 'a team inside its trial is not locked');

select pg_temp.end_trial(tests.account_id('trialco'));

select is(pg_temp.locked('trialco'), true, 'a team whose trial ended without subscribing is locked');

select pg_temp.stripe_reports('acme', 'sub_first', 'active');

select is(pg_temp.locked('acme'), false, 'a team paying during its trial is not locked');

select pg_temp.stripe_deletes('sub_first');

select is(pg_temp.locked('acme'), true, 'a canceled subscription locks even while the trial window is open');

select pg_temp.end_trial(tests.account_id('acme'));
select pg_temp.stripe_reports('acme', 'sub_second', 'active');

select is(pg_temp.locked('acme'), false, 'resubscribing lifts the lock');

select pg_temp.stripe_reports('acme', 'sub_second', 'past_due');

select is(pg_temp.locked('acme'), false, 'a past due team stays usable');

select pg_temp.stripe_deletes('sub_second');

select is(pg_temp.locked('acme'), true, 'a team whose past due subscription Stripe canceled is locked');

select pg_temp.stripe_reports('acme', 'sub_third', 'active', cancel_at_period_end => true);

select is(pg_temp.locked('acme'), false, 'a subscription set to cancel stays usable until it ends');

select pg_temp.stripe_deletes('sub_third');

select is(pg_temp.locked('acme'), true, 'a voluntarily canceled subscription locks once it ends');

select pg_temp.stripe_reports('unpaidco', 'sub_unpaid', 'unpaid');

select is(pg_temp.locked('unpaidco'), true, 'an unpaid subscription locks');

select pg_temp.stripe_reports('failedcard', 'sub_failed', 'incomplete_expired');

select is(pg_temp.locked('failedcard'), true, 'an expired first checkout locks');

select pg_temp.end_trial(tests.account_id('failedcard'));

select is(pg_temp.locked('failedcard'), true, 'an expired first checkout after the trial ended locks');

select pg_temp.stripe_reports('pausedco', 'sub_paused', 'paused');

select is(pg_temp.locked('pausedco'), false, 'a paused subscription inside the trial is not locked');

select pg_temp.end_trial(tests.account_id('pausedco'));

select is(pg_temp.locked('pausedco'), false, 'a paused subscription after the trial ended is not locked');

select pg_temp.stripe_reports('pendingco', 'sub_pending', 'incomplete');
select pg_temp.end_trial(tests.account_id('pendingco'));

select is(pg_temp.locked('pendingco'), false, 'a pending checkout after the trial ended is not locked');

select pg_temp.stripe_reports('manyrows', 'sub_old', 'canceled');
select pg_temp.stripe_reports('manyrows', 'sub_new', 'past_due');

select is(pg_temp.locked('manyrows'), false, 'one live row among canceled ones keeps the team usable');

select pg_temp.end_trial(tests.get_uid('owner_u'));

select is(
  public.is_account_locked(tests.get_uid('owner_u')),
  false,
  'a personal account never locks'
);

select public.set_team_account_billing(false);

select is(pg_temp.locked('trialco'), false, 'with billing off no team is locked');

select public.set_team_account_billing(true);

select tests.login_as('member_u');

select is(pg_temp.locked('acme'), true, 'a member reads their team''s lock');
select is(
  public.is_trial_active(tests.account_id('acme')),
  false,
  'a member reads their team''s trial'
);

select tests.login_as('owner_u');

select is(
  public.team_billing_standing(tests.account_id('goodco'))::text,
  'good',
  'a team in good standing reads as good'
);
select is(
  public.team_billing_standing(tests.account_id('manyrows'))::text,
  'past_due',
  'a team whose live subscription is past due reads as past due'
);
select is(
  public.team_billing_standing(tests.account_id('acme'))::text,
  'locked',
  'a locked team reads as locked'
);

select tests.login_as('outsider_u');

select throws_ok(
  $$ select public.team_billing_standing(tests.account_id('acme')) $$,
  '42501', null, 'a non-member cannot read a team''s billing standing'
);

select throws_ok(
  $$ select public.is_account_locked(tests.account_id('acme')) $$,
  '42501', null, 'a non-member cannot read a team''s lock'
);
select throws_ok(
  $$ select public.is_trial_active(tests.account_id('acme')) $$,
  '42501', null, 'a non-member cannot read a team''s trial'
);
select is(
  public.is_trial_active(tests.get_uid('outsider_u')),
  true,
  'a user reads their own personal trial'
);

select tests.login_as('member_u');

select throws_ok(
  $$ select public.set_team_account_billing(false) $$,
  '42501', null, 'a member cannot switch billing off'
);

select * from finish();
rollback;
