begin;
select no_plan();

-- Two teams and an external participant granted on Deal A only.
select tests.create_user('sd_a_owner');
select tests.create_user('sd_b_owner');
select tests.create_user('sd_ext');

select tests.login_as_service_role();
select public.create_team_account('SD Acct A', tests.get_uid('sd_a_owner'), 'sd-acct-a');
select public.create_team_account('SD Acct B', tests.get_uid('sd_b_owner'), 'sd-acct-b');

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal',
  'aaaaaaaa-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sd-acct-a'), 'owner_user_id', tests.get_uid('sd_a_owner'),
    'description', 'Deal A'), null, 'service');
select public.append_deal_event('bbbbbbbb-0000-0000-0000-0000000000d1', 'deal',
  'bbbbbbbb-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sd-acct-b'), 'owner_user_id', tests.get_uid('sd_b_owner'),
    'description', 'Deal B'), null, 'service');

-- Projection rows: an account-scoped firm row and a deal-scoped document row on
-- account A, plus one row on account B.
insert into public.search_document (entity_type, entity_id, account_id, deal_id, tsv)
values
  ('firm', 'aaaaaaaa-0000-0000-0000-0000000000f1', tests.account_id('sd-acct-a'), null,
    to_tsvector('english', 'Acme accounting firm')),
  ('dr_document', 'aaaaaaaa-0000-0000-0000-0000000000c1', tests.account_id('sd-acct-a'),
    'aaaaaaaa-0000-0000-0000-0000000000d1', to_tsvector('english', 'quarterly financials workpapers')),
  ('firm', 'bbbbbbbb-0000-0000-0000-0000000000f1', tests.account_id('sd-acct-b'), null,
    to_tsvector('english', 'Beta accounting firm'));

select public.append_deal_event('aaaaaaaa-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('sd_ext'), 'party', 'buyer', 'scope', 'deal', 'permission', 'view'), null, 'service');

-- ---- Member of A sees both A rows and can search them ----
select tests.login_as('sd_a_owner');

select is(
  (select count(*)::int from public.search_document where account_id = tests.account_id('sd-acct-a')),
  2,
  'a member sees every projection row in their own account'
);
select isnt_empty(
  $$ select 1 from public.search_documents(tests.account_id('sd-acct-a'), 'financials') $$,
  'search_documents returns a match for a query term in the account'
);
select is(
  (select entity_id from public.search_documents(tests.account_id('sd-acct-a'), 'financials')),
  'aaaaaaaa-0000-0000-0000-0000000000c1'::uuid,
  'search_documents ranks the row whose tsvector holds the term'
);
select is_empty(
  $$ select 1 from public.search_documents(tests.account_id('sd-acct-a'), 'nonexistentterm') $$,
  'search_documents returns nothing for a query that matches no row'
);

-- ---- Foreign account member sees none of A's rows ----
select tests.login_as('sd_b_owner');

select is_empty(
  $$ select 1 from public.search_document where account_id = tests.account_id('sd-acct-a') $$,
  'a foreign account member cannot read another account projection rows'
);
select is_empty(
  $$ select 1 from public.search_documents(tests.account_id('sd-acct-a'), 'financials') $$,
  'a foreign account member gets no results from another account search'
);

-- ---- Participant reaches only the deal-scoped row on the granted deal ----
select tests.login_as('sd_ext');

select is(
  (select count(*)::int from public.search_document where account_id = tests.account_id('sd-acct-a')),
  1,
  'a participant sees only the deal-scoped row on their granted deal'
);
select is(
  (select entity_id from public.search_documents(tests.account_id('sd-acct-a'), 'financials workpapers')),
  'aaaaaaaa-0000-0000-0000-0000000000c1'::uuid,
  'search_documents returns the granted deal row to a participant'
);
select is_empty(
  $$ select 1 from public.search_documents(tests.account_id('sd-acct-a'), 'Acme') $$,
  'a participant gets no account-scoped rows from search_documents'
);

select * from finish();
rollback;
