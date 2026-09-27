begin;
select no_plan();

select tests.create_user('owner_u');
select tests.create_user('admin_u');
select tests.create_user('member_u');

select tests.login_as_service_role();
select public.create_team_account('Acme', tests.get_uid('owner_u'), 'acme');

insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('acme'), tests.get_uid('admin_u'), 'admin'),
  (tests.account_id('acme'), tests.get_uid('member_u'), 'member');

insert into public.billing_customers (account_id, provider, customer_id)
values (tests.account_id('acme'), 'stripe', 'cus_acme');

-- Billing visibility follows billing.manage, held only by the owner.
select tests.login_as('owner_u');
select isnt_empty(
  $$ select 1 from public.billing_customers where account_id = tests.account_id('acme') $$,
  'owner with billing.manage can read billing'
);

select tests.login_as('member_u');
select is_empty(
  $$ select 1 from public.billing_customers where account_id = tests.account_id('acme') $$,
  'member without billing.manage cannot read billing'
);

-- can_action_account_member is the delete predicate; assert its outcomes.
select tests.login_as('member_u');
select is(
  public.can_action_account_member(tests.account_id('acme'), tests.get_uid('admin_u')),
  false,
  'a member cannot action another member'
);

select tests.login_as('admin_u');
select is(
  public.can_action_account_member(tests.account_id('acme'), tests.get_uid('owner_u')),
  false,
  'an admin cannot action the primary owner'
);
select is(
  public.can_action_account_member(tests.account_id('acme'), tests.get_uid('member_u')),
  true,
  'an admin outranking a member with members.manage can action them'
);

-- A member's delete is filtered by RLS and removes nothing.
select tests.login_as('member_u');
select lives_ok(
  $$ delete from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('admin_u') $$,
  'a member delete runs without error'
);
select tests.login_as('owner_u');
select isnt_empty(
  $$ select 1 from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('admin_u') $$,
  'the admin membership survives a member delete attempt'
);

-- An admin can remove a lower-ranked member.
select tests.login_as('admin_u');
select lives_ok(
  $$ delete from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('member_u') $$,
  'an admin delete of a member runs'
);
select is_empty(
  $$ select 1 from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('member_u') $$,
  'the member membership is removed'
);

-- The primary owner membership cannot be deleted by an admin.
select tests.login_as('admin_u');
select lives_ok(
  $$ delete from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('owner_u') $$,
  'an admin delete of the owner runs'
);
select tests.login_as('owner_u');
select isnt_empty(
  $$ select 1 from public.accounts_memberships where account_id = tests.account_id('acme') and user_id = tests.get_uid('owner_u') $$,
  'the primary owner membership survives'
);

select * from finish();
rollback;
