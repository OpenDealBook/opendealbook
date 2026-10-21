begin;
select no_plan();

-- Two independent teams, plus an external counsel who belongs to neither.
select tests.create_user('acc_a_owner');
select tests.create_user('acc_b_owner');
select tests.create_user('ext_counsel');

select tests.login_as_service_role();
select public.create_team_account('Acct A', tests.get_uid('acc_a_owner'), 'acct-a');
select public.create_team_account('Acct B', tests.get_uid('acc_b_owner'), 'acct-b');

-- Seed a firm and a deal in each account, and one checklist item under A's deal.
insert into public.firm (id, account_id, name, website)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', tests.account_id('acct-a'), 'Firm A', 'https://firm-a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', tests.account_id('acct-b'), 'Firm B', 'https://firm-b.test');

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('acct-a'), 'firm_id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'owner_user_id', tests.get_uid('acc_a_owner'), 'description', 'Deal A'), null, 'service');
select public.append_deal_event('bbbbbbbb-0000-0000-0000-0000000000d1', 'deal',
  'bbbbbbbb-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('acct-b'), 'firm_id', 'bbbbbbbb-0000-0000-0000-000000000001',
    'owner_user_id', tests.get_uid('acc_b_owner'), 'description', 'Deal B'), null, 'service');

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'checklist_item',
  'aaaaaaaa-0000-0000-0000-0000000000c1', 'checklist_item.added',
  jsonb_build_object('title', 'NDA'), null, 'service');

-- Grant the external counsel a contract-scoped participant grant on Deal A only.
select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('ext_counsel'), 'party', 'broker', 'scope', 'contract', 'permission', 'view'),
  null, 'service');

-- ---- Tenant isolation ----
select tests.login_as('acc_a_owner');

select isnt_empty(
  $$ select 1 from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1' $$,
  'a member sees their own account deal'
);
select is_empty(
  $$ select 1 from public.deal where account_id = tests.account_id('acct-b') $$,
  'a member cannot see another account deal'
);
select is_empty(
  $$ select 1 from public.firm where account_id = tests.account_id('acct-b') $$,
  'a member cannot see another account firm'
);

-- ---- Participant scoping ----
select tests.login_as('ext_counsel');

select is_empty(
  $$ select 1 from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1' $$,
  'a participant cannot read the deal row they are granted on'
);
select is_empty(
  $$ select 1 from public.deal where id = 'bbbbbbbb-0000-0000-0000-0000000000d1' $$,
  'a participant cannot see a deal they have no grant on'
);
select is_empty(
  $$ select 1 from public.checklist_item where deal_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' $$,
  'a participant cannot read checklist items on their granted deal'
);

-- ---- has_deal_permission true/false ----
select tests.login_as('acc_a_owner');
select is(
  public.has_deal_permission('aaaaaaaa-0000-0000-0000-0000000000d1', 'deals.manage'),
  true,
  'account owner with deals.manage passes has_deal_permission on their deal'
);
select is(
  public.has_deal_permission('bbbbbbbb-0000-0000-0000-0000000000d1', 'deals.manage'),
  false,
  'account owner has no deal permission on a foreign account deal'
);

select tests.login_as('ext_counsel');
select is(
  public.has_deal_permission('aaaaaaaa-0000-0000-0000-0000000000d1', 'deals.manage'),
  false,
  'a participant grant never confers has_deal_permission'
);
select is(
  public.has_deal_permission('bbbbbbbb-0000-0000-0000-0000000000d1', 'deals.manage'),
  false,
  'a participant fails has_deal_permission on a deal without a grant'
);

-- ---- Mutation gating ----
select tests.login_as('ext_counsel');
select throws_ok(
  $$ insert into public.deal (account_id, description) values (tests.account_id('acct-a'), 'sneaky') $$,
  '42501',
  null,
  'a participant without deals.create cannot insert a deal'
);

-- ---- Checklist status transitions ----
select tests.login_as('acc_a_owner');
select lives_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'checklist_item',
       'aaaaaaaa-0000-0000-0000-0000000000c1', 'checklist_item.status_changed', '{"status":"requested"}'::jsonb) $$,
  'checklist item can move not_started -> requested'
);
select lives_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'checklist_item',
       'aaaaaaaa-0000-0000-0000-0000000000c1', 'checklist_item.status_changed', '{"status":"received"}'::jsonb) $$,
  'checklist item can move requested -> received'
);
select lives_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'checklist_item',
       'aaaaaaaa-0000-0000-0000-0000000000c1', 'checklist_item.status_changed', '{"status":"reviewed","outcome":"accepted"}'::jsonb) $$,
  'checklist item can move received -> reviewed with an outcome'
);
select is(
  (select status::text from public.checklist_item where id = 'aaaaaaaa-0000-0000-0000-0000000000c1'),
  'reviewed',
  'checklist item lands in reviewed'
);

-- ---- api_key hashing and verify ----
select tests.login_as_service_role();
insert into public.api_key (account_id, name, key_hash, key_prefix, created_by)
values (
  tests.account_id('acct-a'),
  'ci key',
  extensions.digest('rawsecret123', 'sha256'),
  'rawsec',
  tests.get_uid('acc_a_owner')
);

select is(
  public.verify_api_key('rawsec', 'rawsecret123'),
  tests.account_id('acct-a'),
  'verify_api_key returns the account for a correct raw key'
);
select is(
  public.verify_api_key('rawsec', 'wrongsecret'),
  null,
  'verify_api_key returns null for a wrong raw key'
);

update public.api_key set revoked_at = now() where key_prefix = 'rawsec';
select is(
  public.verify_api_key('rawsec', 'rawsecret123'),
  null,
  'verify_api_key returns null for a revoked key'
);

-- key_hash is not selectable by an authenticated admin.
select tests.login_as('acc_a_owner');
select throws_ok(
  $$ select key_hash from public.api_key where key_prefix = 'rawsec' $$,
  '42501',
  null,
  'authenticated cannot select the key_hash column'
);

-- ---- Code name ----
select tests.login_as_service_role();
select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('acct-a'), 'firm_id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'owner_user_id', tests.get_uid('acc_a_owner'), 'description', 'Deal A2'), null, 'service');

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('code_name', 'Project Atlas'), null, 'service');
select is(
  (select code_name from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  'Project Atlas',
  'deal.updated sets the code name'
);

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('notes', 'unrelated edit'), null, 'service');
select is(
  (select code_name from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  'Project Atlas',
  'an update that does not name the code name keeps it'
);

select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
       jsonb_build_object('code_name', 'X'), null, 'service') $$,
  '23514', null,
  'a code name shorter than 2 characters is refused'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
       jsonb_build_object('code_name', repeat('x', 41)), null, 'service') $$,
  '23514', null,
  'a code name longer than 40 characters is refused'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.updated',
       jsonb_build_object('code_name', 'Project Atlas'), null, 'service') $$,
  '23505', null,
  'a code name already used by another deal in the team is refused'
);
select lives_ok(
  $$ select public.append_deal_event('bbbbbbbb-0000-0000-0000-0000000000d1', 'deal',
       'bbbbbbbb-0000-0000-0000-0000000000d1', 'deal.updated',
       jsonb_build_object('code_name', 'Project Atlas'), null, 'service') $$,
  'another team may use the same code name'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.updated',
       jsonb_build_object('code_name', 'The Firm A deal'), null, 'service') $$,
  '23514', 'a code name must not contain the business name',
  'a code name containing the business name is refused'
);

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('code_name', null), null, 'service');
select is(
  (select code_name from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  null,
  'a null code name clears it'
);

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('code_name', '  Project Atlas  '), null, 'service');
select is(
  (select code_name from public.deal where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'),
  'Project Atlas',
  'a code name is stored without surrounding spaces'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.updated',
       jsonb_build_object('code_name', ' X '), null, 'service') $$,
  '23514', null,
  'a code name is measured after trimming'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.updated',
       jsonb_build_object('code_name', ' project ATLAS '), null, 'service') $$,
  '23505', null,
  'a code name differing from a team''s other code name only in case or spaces is refused'
);
select throws_ok(
  $$ select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d2', 'deal',
       'aaaaaaaa-0000-0000-0000-0000000000d2', 'deal.updated',
       jsonb_build_object('code_name', 'the FIRM a deal'), null, 'service') $$,
  '23514', 'a code name must not contain the business name',
  'a code name containing the business name in another case is refused'
);
reset role;
select throws_ok(
  $$ update public.firm set name = 'atlas' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', 'a code name must not contain the business name',
  'renaming the business to something inside a deal''s code name is refused'
);
insert into public.firm (id, account_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000002', tests.account_id('acct-a'), 'Project');
select throws_ok(
  $$ update public.deal set firm_id = 'aaaaaaaa-0000-0000-0000-000000000002'
     where id = 'aaaaaaaa-0000-0000-0000-0000000000d1' $$,
  '23514', 'a code name must not contain the business name',
  'moving a deal to a business whose name is inside its code name is refused'
);

select * from finish();
rollback;
