begin;
select no_plan();

-- Account A with one deal, a member of A on the member role, and an outsider who
-- belongs to no account. The append RPC authorises deal.created against
-- deals.create and every other event against has_deal_permission.
select tests.create_user('ap_owner');
select tests.create_user('ap_member');
select tests.create_user('ap_outsider');

select tests.login_as_service_role();
select public.create_team_account('Append Acct', tests.get_uid('ap_owner'), 'append-acct');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('append-acct'), tests.get_uid('ap_member'), 'member');

select tests.login_as('ap_owner');
select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'deal',
  'a9a9a9a9-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('append-acct'), 'description', 'Append Deal A'));

-- ---- a non-member cannot create a deal on the account ----
select tests.login_as('ap_outsider');
select throws_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d2', 'deal',
       'a9a9a9a9-0000-0000-0000-0000000000d2', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('append-acct'), 'description', 'sneaky')) $$,
  '42501', null,
  'a non-member cannot append deal.created on a foreign account'
);

-- ---- a non-member cannot append any event to a foreign account deal ----
select throws_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'checklist_item',
       'a9a9a9a9-0000-0000-0000-0000000000c1', 'checklist_item.added', '{"title":"intruder"}'::jsonb) $$,
  '42501', null,
  'a non-member cannot append a checklist_item event to a foreign deal'
);
select throws_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'deal',
       'a9a9a9a9-0000-0000-0000-0000000000d1', 'deal.updated', '{"notes":"intruder"}'::jsonb) $$,
  '42501', null,
  'a non-member cannot append a deal.updated event to a foreign deal'
);

-- ---- a member on the member role lacks the aggregate permission ----
-- deal.updated needs deals.manage; checklist_item needs checklists.manage;
-- the member role holds neither.
select tests.login_as('ap_member');
select throws_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'deal',
       'a9a9a9a9-0000-0000-0000-0000000000d1', 'deal.updated', '{"notes":"member edit"}'::jsonb) $$,
  '42501', null,
  'a member without deals.manage cannot append a deal.updated event'
);
select throws_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'checklist_item',
       'a9a9a9a9-0000-0000-0000-0000000000c2', 'checklist_item.added', '{"title":"member item"}'::jsonb) $$,
  '42501', null,
  'a member without checklists.manage cannot append a checklist_item event'
);

-- ---- the owner holds deals.manage and checklists.manage and is allowed ----
select tests.login_as('ap_owner');
select lives_ok(
  $$ select public.append_deal_event('a9a9a9a9-0000-0000-0000-0000000000d1', 'checklist_item',
       'a9a9a9a9-0000-0000-0000-0000000000c3', 'checklist_item.added', '{"title":"owner item"}'::jsonb) $$,
  'the owner can append a checklist_item event to their own deal'
);
select is(
  (select title from public.checklist_item where id = 'a9a9a9a9-0000-0000-0000-0000000000c3'),
  'owner item',
  'the owner append projected the checklist item'
);

select * from finish();
rollback;
