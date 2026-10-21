begin;
select no_plan();

select has_table('public', 'seller_send_limit', 'seller_send_limit holds per-team overrides');

select tests.create_user('ssl_owner');
select tests.create_user('ssl_member');
select tests.create_user('ssl_outsider');
select tests.create_user('ssl_seller');

select tests.login_as_service_role();
select public.create_team_account('SSL Team', tests.get_uid('ssl_owner'), 'ssl-team');
select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'deal',
  '5d000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ssl-team'), 'owner_user_id', tests.get_uid('ssl_owner'),
    'description', 'Send limit deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('ssl_member'), tests.account_id('ssl-team'), 'member');

insert into public.generated_document (id, account_id, deal_id, pdf_path)
values ('5d000000-0000-0000-0000-0000000000a1', tests.account_id('ssl-team'),
  '5d000000-0000-0000-0000-0000000000d1', 'acct/deal/doc.pdf');

-- A team on trial: ten a day.
update public.accounts set trial_ends_at = now() + interval '10 days'
where id = tests.account_id('ssl-team');

insert into public.document_share (account_id, generated_document_id, recipient_user_id, created_at)
select tests.account_id('ssl-team'), '5d000000-0000-0000-0000-0000000000a1', tests.get_uid('ssl_seller'),
  now() - make_interval(hours => n)
from generate_series(1, 10) as n;

insert into public.document_share (account_id, generated_document_id, recipient_user_id, created_at)
values (tests.account_id('ssl-team'), '5d000000-0000-0000-0000-0000000000a1', tests.get_uid('ssl_seller'),
  now() - interval '25 hours');

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit, sent from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (10, 10) $$,
  'a trial team may send ten in 24 hours, and shares older than 24 hours do not count'
);
select ok(
  (select retry_after between now() + interval '13 hours 59 minutes' and now() + interval '14 hours 1 minute'
   from public.seller_send_allowance(tests.account_id('ssl-team'))),
  'the next send frees up when the oldest share in the window turns 24 hours old'
);

select tests.login_as_service_role();
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('ssl-team');

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (50) $$,
  'a team whose trial is not active may send fifty in 24 hours'
);

select tests.login_as_service_role();
update public.accounts set trial_ends_at = null
where id = tests.account_id('ssl-team');

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (50) $$,
  'a team with no trial end date is not on trial and may send fifty'
);

select tests.login_as_service_role();
update public.accounts set trial_ends_at = now() + interval '10 days'
where id = tests.account_id('ssl-team');
insert into public.billing_customers (id, account_id, provider, customer_id)
values (5000, tests.account_id('ssl-team'), 'stripe', 'cus_ssl');
insert into public.subscriptions (id, account_id, billing_customer_id, status, active, billing_provider,
  cancel_at_period_end, currency, period_starts_at, period_ends_at)
values ('sub_ssl', tests.account_id('ssl-team'), 5000, 'active', true, 'stripe', false, 'usd',
  now() - interval '1 day', now() + interval '29 days');

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (50) $$,
  'a team with an active subscription is not on trial even inside its trial window'
);

select tests.login_as_service_role();
delete from public.subscriptions where id = 'sub_ssl';

select tests.login_as_service_role();
insert into public.seller_send_limit (account_id, daily_limit)
values (tests.account_id('ssl-team'), 0);

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit, retry_after from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (0, null::timestamptz) $$,
  'a super-admin value replaces the defaults, and zero never frees up'
);

select tests.login_as_service_role();
delete from public.seller_send_limit where account_id = tests.account_id('ssl-team');

select tests.login_as('ssl_owner');
select results_eq(
  $$ select daily_limit from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  $$ values (10) $$,
  'clearing the super-admin value restores the defaults'
);

select tests.login_as('ssl_member');
select throws_ok(
  $$ select * from public.seller_send_allowance(tests.account_id('ssl-team')) $$,
  '42501',
  null,
  'a member without deals.manage cannot read the allowance'
);

select tests.login_as('ssl_owner');
select throws_ok(
  $$ insert into public.seller_send_limit (account_id, daily_limit) values (tests.account_id('ssl-team'), 99) $$,
  '42501',
  null,
  'a team owner cannot set their own limit'
);
select throws_ok(
  $$ select 1 from public.seller_send_limit $$,
  '42501',
  null,
  'team users cannot read the overrides table'
);

select * from finish();
rollback;
