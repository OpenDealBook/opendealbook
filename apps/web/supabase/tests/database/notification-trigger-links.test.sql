begin;
select no_plan();

select tests.create_user('link_owner');
select tests.create_user('link_joiner');
select tests.create_user('link_invitee');
select tests.create_user('link_outsider');

select tests.login_as_service_role();
select public.create_team_account('Link Team', tests.get_uid('link_owner'), 'link-team');

insert into public.invitations (email, account_id, invited_by, role, invite_token, expires_at)
values ('link_invitee@opendealbook.test', tests.account_id('link-team'), tests.get_uid('link_owner'), 'member',
  'link-invite-token', now() + interval '1 day');

select is(
  (select link from public.notifications
   where recipient_user_id = tests.get_uid('link_invitee') and body like 'You have been invited%'),
  '/join?token=link-invite-token'::varchar,
  'an invitation notice links to the page that accepts it'
);

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('link_joiner'), tests.account_id('link-team'), 'member');

select is(
  (select link from public.notifications
   where recipient_user_id = tests.get_uid('link_owner') and body like 'A new member joined%'),
  '/home/link-team/members'::varchar,
  'a new member notice links to the team members page'
);

insert into public.billing_customers (id, account_id, provider, customer_id)
values (5101, tests.account_id('link-team'), 'stripe', 'cus_link');
insert into public.subscriptions (id, account_id, billing_customer_id, status, active, billing_provider,
  cancel_at_period_end, currency, period_starts_at, period_ends_at)
values ('sub_link', tests.account_id('link-team'), 5101, 'trialing', true, 'stripe', false, 'usd',
  now(), now() + interval '30 days');
update public.subscriptions set status = 'active' where id = 'sub_link';

select is(
  (select link from public.notifications
   where recipient_user_id = tests.get_uid('link_owner') and body = 'Your subscription status changed to active'),
  '/home/link-team/billing'::varchar,
  'a subscription change notice links to the team billing page'
);

insert into public.firm (id, account_id, name)
values ('dddddddd-0000-0000-0000-0000000001f1', tests.account_id('link-team'), 'Link Tooling');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000001d1', 'deal',
  'dddddddd-0000-0000-0000-0000000001d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('link-team'), 'owner_user_id', tests.get_uid('link_owner'),
    'firm_id', 'dddddddd-0000-0000-0000-0000000001f1', 'description', 'A deal'), null, 'service');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000001d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('link_joiner'), 'party', 'buyer'), null, 'service');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000001d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('link_outsider'), 'party', 'broker'), null, 'service');

select tests.login_as('link_owner');
select public.append_deal_event('dddddddd-0000-0000-0000-0000000001d1', 'deal',
  'dddddddd-0000-0000-0000-0000000001d1', 'deal.stage_changed', '{"stage":"pre_nda"}'::jsonb);

select tests.login_as_service_role();
select bag_eq(
  $$ select recipient_user_id, link from public.notifications where body = 'Deal moved to pre_nda' $$,
  $$ values (tests.get_uid('link_joiner'), '/home/link-team/deals/dddddddd-0000-0000-0000-0000000001d1'::varchar),
            (tests.get_uid('link_outsider'), null::varchar) $$,
  'a stage move links a team member to the deal overview and gives an outside participant no link'
);

select * from finish();
rollback;
