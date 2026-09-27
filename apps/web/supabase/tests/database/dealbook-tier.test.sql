begin;
select no_plan();

-- Two teams and an external party granted on team A's deal only.
select tests.create_user('tier_a_owner');
select tests.create_user('tier_b_owner');
select tests.create_user('tier_ext');

select tests.login_as_service_role();
select public.create_team_account('Tier A', tests.get_uid('tier_a_owner'), 'tier-a');
select public.create_team_account('Tier B', tests.get_uid('tier_b_owner'), 'tier-b');

insert into public.deal (id, account_id, owner_user_id, description)
values ('cccccccc-0000-0000-0000-0000000000d1', tests.account_id('tier-a'), tests.get_uid('tier_a_owner'), 'Tier A deal');

insert into public.deal_participant (deal_id, user_id, party, permission)
values ('cccccccc-0000-0000-0000-0000000000d1', tests.get_uid('tier_ext'), 'seller', 'view');

-- Account-scoped rows in team A.
insert into public.integration_connection (account_id, provider, nango_connection_id)
values (tests.account_id('tier-a'), 'sendgrid', 'nango-a-1');

insert into public.data_source (account_id, type)
values (tests.account_id('tier-a'), 'csv');

insert into public.broker_intake (account_id, firm_name)
values (tests.account_id('tier-a'), 'Broker A');

insert into public.document_template (account_id, name, type)
values (tests.account_id('tier-a'), 'Standard NDA', 'nda');

insert into public.template_field (template_id, key, label)
select id, 'buyer_name', 'Buyer Name'
from public.document_template where account_id = tests.account_id('tier-a') limit 1;

-- Data room folder and document under team A's deal.
insert into public.dr_folder (id, account_id, deal_id, name)
values ('cccccccc-0000-0000-0000-0000000000f1', tests.account_id('tier-a'), 'cccccccc-0000-0000-0000-0000000000d1', 'Financials');

insert into public.dr_document (account_id, deal_id, folder_id, name, storage_path)
values (tests.account_id('tier-a'), 'cccccccc-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000f1', 'P&L.pdf', 'deals/a/pl.pdf');

-- ---- Account-scoped isolation: a foreign account sees nothing ----
select tests.login_as('tier_b_owner');

select is_empty(
  $$ select 1 from public.integration_connection where account_id = tests.account_id('tier-a') $$,
  'a foreign account cannot see integration_connection'
);
select is_empty(
  $$ select 1 from public.data_source where account_id = tests.account_id('tier-a') $$,
  'a foreign account cannot see data_source'
);
select is_empty(
  $$ select 1 from public.broker_intake where account_id = tests.account_id('tier-a') $$,
  'a foreign account cannot see broker_intake'
);
select is_empty(
  $$ select 1 from public.document_template where account_id = tests.account_id('tier-a') $$,
  'a foreign account cannot see document_template'
);
select is_empty(
  $$ select 1 from public.template_field where key = 'buyer_name' $$,
  'a foreign account cannot see template_field through its template'
);
select is_empty(
  $$ select 1 from public.dr_document where deal_id = 'cccccccc-0000-0000-0000-0000000000d1' $$,
  'a foreign account cannot see dr_document'
);

-- ---- Account members see their own rows ----
select tests.login_as('tier_a_owner');

select isnt_empty(
  $$ select 1 from public.integration_connection where account_id = tests.account_id('tier-a') $$,
  'an account member sees their integration_connection'
);
select isnt_empty(
  $$ select 1 from public.data_source where account_id = tests.account_id('tier-a') $$,
  'an account member sees their data_source'
);
select isnt_empty(
  $$ select 1 from public.broker_intake where account_id = tests.account_id('tier-a') $$,
  'an account member sees their broker_intake'
);
select isnt_empty(
  $$ select 1 from public.template_field where key = 'buyer_name' $$,
  'an account member sees template_field through its template'
);

-- ---- dr_document is deal-scoped: a participant sees it, but not the
--      account-scoped tables that no deal grant reaches ----
select tests.login_as('tier_ext');

select isnt_empty(
  $$ select 1 from public.dr_document where deal_id = 'cccccccc-0000-0000-0000-0000000000d1' $$,
  'a deal participant sees dr_document on their granted deal'
);
select is_empty(
  $$ select 1 from public.integration_connection where account_id = tests.account_id('tier-a') $$,
  'a deal participant cannot see account-scoped integration_connection'
);

-- ---- A stage move fires a notification for the deal participant ----
select tests.login_as('tier_a_owner');
select lives_ok(
  $$ update public.deal set stage = 'qualifying' where id = 'cccccccc-0000-0000-0000-0000000000d1' $$,
  'the deal owner can move the deal stage'
);

select tests.login_as('tier_ext');
select isnt_empty(
  $$ select 1 from public.notifications
     where recipient_user_id = tests.get_uid('tier_ext') and body like 'Deal moved to%' $$,
  'a stage move inserts a notification targeted to the deal participant'
);

select * from finish();
rollback;
