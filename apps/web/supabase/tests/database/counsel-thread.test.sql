begin;
select no_plan();

-- Team "CT Team" owns deal d1. ct_owner manages the deal; ct_member is on the
-- team without deals.manage. ct_buyer_law is buyer's counsel and
-- ct_seller_law seller's counsel. ct_seller is in the seller room.
select tests.create_user('ct_owner');
select tests.create_user('ct_member');
select tests.create_user('ct_buyer_law');
select tests.create_user('ct_seller_law');
select tests.create_user('ct_seller');
select tests.create_user('ct_stranger');
select tests.create_user('ct_other_owner');

select tests.login_as_service_role();
select public.create_team_account('CT Team', tests.get_uid('ct_owner'), 'ct-team');
select public.create_team_account('CT Other', tests.get_uid('ct_other_owner'), 'ct-other');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d1', 'deal',
  'c7000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ct-team'), 'owner_user_id', tests.get_uid('ct_owner'),
    'description', 'Thread deal'), null, 'service');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d2', 'deal',
  'c7000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ct-other'), 'owner_user_id', tests.get_uid('ct_other_owner'),
    'description', 'Other team deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('ct_member'), tests.account_id('ct-team'), 'member');

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('ct_buyer_law'), 'ct_buyer_law@tuckin.test', 'Bea Buyerlaw'),
  (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('ct_seller_law'), 'ct_seller_law@tuckin.test', 'Sol Sellerlaw');

select tests.login_as('ct_owner');
select public.ensure_seller_room('c7000000-0000-0000-0000-0000000000d1');
reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('ct_seller'), 'ct_seller@tuckin.test', 'Sam Seller'
from public.seller_room r where r.deal_id = 'c7000000-0000-0000-0000-0000000000d1';

-- ---- The team writes into each side's thread ----
select tests.login_as('ct_owner');

select lives_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('ct_owner'), 'Buyer side: draft APA is up') $$,
  'a deal manager writes to buyer''s counsel'
);
select lives_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'seller',
       tests.get_uid('ct_owner'), 'Seller side: please review') $$,
  'a deal manager writes to seller''s counsel'
);
select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('ct_buyer_law'), 'Posing as counsel') $$,
  '42501', null, 'nobody writes in someone else''s name'
);
select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d2', 'buyer',
       tests.get_uid('ct_owner'), 'On another team''s deal') $$,
  '42501', null, 'a message cannot hang off another team''s deal'
);

select tests.login_as('ct_member');

select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('ct_member'), 'Without deals.manage') $$,
  '42501', null, 'a team member without deals.manage cannot write'
);

select tests.login_as('ct_buyer_law');

select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('ct_buyer_law'), 'Straight into the table') $$,
  '42501', null, 'counsel do not write to the table themselves'
);

-- Counsel writes go through the server after it proves who they are.
reset role;

insert into public.counsel_message (account_id, deal_id, side, author_user_id, body, created_at)
values
  (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('ct_buyer_law'), 'Buyer counsel reply', now() + interval '1 minute'),
  (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('ct_seller_law'), 'Seller counsel reply', now() + interval '1 minute');

select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d2', 'buyer',
       tests.get_uid('ct_buyer_law'), 'Linked across teams') $$,
  '42501', 'rows cannot link across teams', 'a server write cannot link across teams either'
);

-- ---- Who reads which thread ----
select tests.login_as('ct_owner');

select results_eq(
  $$ select author_name, from_team, body
     from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  $$ values ('ct_owner'::text, true, 'Buyer side: draft APA is up'::text),
            ('Bea Buyerlaw'::text, false, 'Buyer counsel reply'::text) $$,
  'the team reads the buyer thread oldest first, with who wrote each message'
);

select tests.login_as('ct_member');

select results_eq(
  $$ select body from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'seller') $$,
  $$ values ('Seller side: please review'::text), ('Seller counsel reply'::text) $$,
  'every team member reads both threads'
);

select tests.login_as('ct_buyer_law');

select results_eq(
  $$ select body from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  $$ values ('Buyer side: draft APA is up'::text), ('Buyer counsel reply'::text) $$,
  'buyer''s counsel read their own thread'
);
select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'seller') $$,
  'buyer''s counsel never read the seller thread'
);

select tests.login_as('ct_seller_law');

select results_eq(
  $$ select body from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'seller') $$,
  $$ values ('Seller side: please review'::text), ('Seller counsel reply'::text) $$,
  'seller''s counsel read their own thread'
);
select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  'seller''s counsel never read the buyer thread'
);

select tests.login_as('ct_seller');

select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'seller')
     union all
     select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  'the seller reads neither thread'
);

select tests.login_as('ct_stranger');

select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  'someone outside the deal reads nothing'
);

select tests.login_as('ct_other_owner');

select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  'another team reads nothing'
);

reset role;
delete from public.deal_counsel where user_id = tests.get_uid('ct_buyer_law');

select tests.login_as('ct_buyer_law');

select is_empty(
  $$ select 1 from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  'removed counsel read nothing, not even their own messages'
);

select tests.login_as('ct_owner');

select results_eq(
  $$ select from_team, body from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  $$ values (true, 'Buyer side: draft APA is up'::text), (false, 'Buyer counsel reply'::text) $$,
  'removed counsel''s messages stay in the thread'
);

-- ---- Billing lock ----
reset role;
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('ct-team');

select tests.login_as('ct_owner');

select throws_ok(
  $$ insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
     values (tests.account_id('ct-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('ct_owner'), 'While locked') $$,
  '42501', 'team is read-only', 'a locked team cannot write to counsel'
);
select results_eq(
  $$ select count(*) from public.counsel_thread('c7000000-0000-0000-0000-0000000000d1', 'buyer') $$,
  $$ values (2::bigint) $$,
  'a locked team still reads its threads'
);

select * from finish();
rollback;
