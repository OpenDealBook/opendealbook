begin;
select no_plan();

-- Team "DWS Team" owns deal d1. dws_owner and dws_analyst are the team;
-- dws_walt is the seller and dws_owen his counsel, whose folder holds a file.
select tests.create_user('dws_owner');
select tests.create_user('dws_analyst');
select tests.create_user('dws_walt');
select tests.create_user('dws_owen');

select tests.login_as_service_role();
select public.create_team_account('DWS Team', tests.get_uid('dws_owner'), 'dws-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('dws-team'), tests.get_uid('dws_analyst'), 'analyst');
select public.append_deal_event('d5000000-0000-0000-0000-0000000000d1', 'deal',
  'd5000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dws-team'), 'firm_id', tests.create_firm(tests.account_id('dws-team')), 'owner_user_id', tests.get_uid('dws_owner'),
    'description', 'Deal-wide snapshot deal'), null, 'service');

select tests.login_as('dws_owner');
select public.ensure_seller_room('d5000000-0000-0000-0000-0000000000d1');

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('dws_walt'), 'dws_walt@opendealbook.test', 'Walt Brennan'
from public.seller_room where deal_id = 'd5000000-0000-0000-0000-0000000000d1';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by) values
  (tests.account_id('dws-team'), 'd5000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('dws_owen'), 'dws_owen@opendealbook.test', 'Owen Castillo', tests.get_uid('dws_walt'));

select tests.login_as_service_role();
select public.append_deal_event('d5000000-0000-0000-0000-0000000000d1', 'dr_document',
  'd5000000-0000-0000-0000-0000000000a1', 'dr_document.added',
  jsonb_build_object('folder_id', (select folder_id from public.seller_counsel_folder
      where deal_id = 'd5000000-0000-0000-0000-0000000000d1'),
    'name', 'side-letter.pdf', 'storage_path', 'deal/d5000000-0000-0000-0000-0000000000d1/side-letter.pdf',
    'version', 1), null, 'service');

-- Enough history for the deal-wide snapshot the team reads.
select public.append_deal_event('d5000000-0000-0000-0000-0000000000d1', 'deal',
  'd5000000-0000-0000-0000-0000000000d1', 'deal.updated',
  jsonb_build_object('description', 'Revision ' || n), null, 'service')
from generate_series(1, 64) n;

select tests.login_as('dws_owner');
select isnt_empty(
  $$ select 1 from public.deal_event_snapshot where aggregate_type = 'deal-wide'
     and deal_id = 'd5000000-0000-0000-0000-0000000000d1' $$,
  'the team reads the deal-wide snapshot'
);
select is_empty(
  $$ select 1 from public.deal_event_snapshot s, jsonb_object_keys(s.state -> 'heads') k
     where k = 'dr_document:d5000000-0000-0000-0000-0000000000a1' $$,
  'the owner never learns a Seller''s counsel folder file from any snapshot'
);

select tests.login_as('dws_analyst');
select is_empty(
  $$ select 1 from public.deal_event_snapshot s, jsonb_object_keys(s.state -> 'heads') k
     where k = 'dr_document:d5000000-0000-0000-0000-0000000000a1' $$,
  'an analyst never learns a Seller''s counsel folder file from any snapshot'
);

select * from finish();
rollback;
