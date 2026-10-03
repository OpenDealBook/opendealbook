begin;
select no_plan();

-- Two independent accounts, each with its own owner. Every core deal projection
-- is seeded on account B so account A's owner can be checked for leakage.
select tests.create_user('iso_a_owner');
select tests.create_user('iso_b_owner');

select tests.login_as_service_role();
select public.create_team_account('Iso A', tests.get_uid('iso_a_owner'), 'iso-a');
select public.create_team_account('Iso B', tests.get_uid('iso_b_owner'), 'iso-b');

-- Build a full projection set on each account through the event store.
select tests.login_as('iso_a_owner');
select public.append_deal_event('a0a0a0a0-0000-0000-0000-0000000000a1', 'deal',
  'a0a0a0a0-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('iso-a'), 'description', 'Deal A', 'website', 'https://a.test'));

select tests.login_as('iso_b_owner');
select public.append_deal_event('b0b0b0b0-0000-0000-0000-0000000000b1', 'deal',
  'b0b0b0b0-0000-0000-0000-0000000000b1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('iso-b'), 'description', 'Deal B', 'website', 'https://b.test'));
select public.append_deal_event('b0b0b0b0-0000-0000-0000-0000000000b1', 'deal',
  'b0b0b0b0-0000-0000-0000-0000000000b1', 'deal.financials_adopted',
  '{"adopted_revenue":800000,"adopted_sde":300000,"adopted_ebitda":250000}'::jsonb);
select public.append_deal_event('b0b0b0b0-0000-0000-0000-0000000000b1', 'checklist_item',
  'b0b0b0b0-0000-0000-0000-0000000000c1', 'checklist_item.added', '{"title":"NDA"}'::jsonb);
select public.append_deal_event('b0b0b0b0-0000-0000-0000-0000000000b1', 'contract',
  'b0b0b0b0-0000-0000-0000-0000000000f1', 'contract.created', '{"type":"loi","status":"draft"}'::jsonb);
select public.append_deal_event('b0b0b0b0-0000-0000-0000-0000000000b1', 'offer',
  'b0b0b0b0-0000-0000-0000-0000000000e1', 'offer.drafted', '{}'::jsonb);

-- ---- SELECT isolation: account A's owner sees own rows, never account B's ----
select tests.login_as('iso_a_owner');

select isnt_empty(
  $$ select 1 from public.deal where account_id = tests.account_id('iso-a') $$,
  'owner A sees their own deal'
);
select is_empty(
  $$ select 1 from public.deal where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B deal'
);
select is_empty(
  $$ select 1 from public.deal_profile where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B deal_profile'
);
select is_empty(
  $$ select 1 from public.deal_financials where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B deal_financials'
);
select is_empty(
  $$ select 1 from public.offer where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B offer'
);
select is_empty(
  $$ select 1 from public.contract where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B contract'
);
select is_empty(
  $$ select 1 from public.checklist_item where account_id = tests.account_id('iso-b') $$,
  'owner A cannot select account B checklist_item'
);

-- The projections are read-only to authenticated. Writes flow through the event
-- store, so even an owner with deals.manage is refused direct DML by privilege
-- (42501), independent of the RLS policies.
select throws_ok(
  $$ insert into public.deal (account_id, description) values (tests.account_id('iso-a'), 'direct') $$,
  '42501', null, 'direct insert into deal is denied to authenticated'
);
select throws_ok(
  $$ insert into public.deal_profile (deal_id, account_id) values ('a0a0a0a0-0000-0000-0000-0000000000a1', tests.account_id('iso-a')) $$,
  '42501', null, 'direct insert into deal_profile is denied to authenticated'
);
select throws_ok(
  $$ insert into public.deal_financials (deal_id, account_id) values ('a0a0a0a0-0000-0000-0000-0000000000a1', tests.account_id('iso-a')) $$,
  '42501', null, 'direct insert into deal_financials is denied to authenticated'
);
select throws_ok(
  $$ insert into public.offer (account_id, deal_id, status) values (tests.account_id('iso-a'), 'a0a0a0a0-0000-0000-0000-0000000000a1', 'draft') $$,
  '42501', null, 'direct insert into offer is denied to authenticated'
);
select throws_ok(
  $$ insert into public.contract (deal_id, account_id, type) values ('a0a0a0a0-0000-0000-0000-0000000000a1', tests.account_id('iso-a'), 'loi') $$,
  '42501', null, 'direct insert into contract is denied to authenticated'
);
select throws_ok(
  $$ insert into public.checklist_item (account_id, deal_id, title) values (tests.account_id('iso-a'), 'a0a0a0a0-0000-0000-0000-0000000000a1', 'direct') $$,
  '42501', null, 'direct insert into checklist_item is denied to authenticated'
);
select throws_ok(
  $$ update public.deal set description = 'hijack' where account_id = tests.account_id('iso-a') $$,
  '42501', null, 'direct update of deal is denied to authenticated'
);

select * from finish();
rollback;
