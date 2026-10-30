begin;
select no_plan();

-- Realtime sends a new row only to those who may select it, so these reads
-- are exactly who sees a counsel message arrive live.
select tests.create_user('lu_owner');
select tests.create_user('lu_buyer_law');
select tests.create_user('lu_seller_law');
select tests.create_user('lu_seller');
select tests.create_user('lu_stranger');

select tests.login_as_service_role();
select public.create_team_account('LU Team', tests.get_uid('lu_owner'), 'lu-team');
select public.append_deal_event('c7100000-0000-0000-0000-0000000000d1', 'deal',
  'c7100000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lu-team'), 'firm_id', tests.create_firm(tests.account_id('lu-team')), 'owner_user_id', tests.get_uid('lu_owner'),
    'description', 'Live deal'), null, 'service');
reset role;

insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values
  (tests.account_id('lu-team'), 'c7100000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('lu_buyer_law'), 'lu_buyer_law@opendealbook.test'),
  (tests.account_id('lu-team'), 'c7100000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('lu_seller_law'), 'lu_seller_law@opendealbook.test');

select tests.login_as('lu_owner');
select public.ensure_seller_room('c7100000-0000-0000-0000-0000000000d1');
reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('lu_seller'), 'lu_seller@opendealbook.test', 'Sam Seller'
from public.seller_room r where r.deal_id = 'c7100000-0000-0000-0000-0000000000d1';

insert into public.counsel_message (account_id, deal_id, side, author_user_id, body)
values
  (tests.account_id('lu-team'), 'c7100000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('lu_owner'), 'To buyer counsel'),
  (tests.account_id('lu-team'), 'c7100000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('lu_owner'), 'To seller counsel');

insert into public.seller_room_question (id, room_id, account_id, title)
select 'c7100000-0000-0000-0000-0000000000a1', r.id, r.account_id, 'Customer list?'
from public.seller_room r where r.deal_id = 'c7100000-0000-0000-0000-0000000000d1';

insert into public.seller_room_comment (room_id, account_id, question_id, author_user_id, body)
select r.id, r.account_id, 'c7100000-0000-0000-0000-0000000000a1', tests.get_uid('lu_seller_law'), 'Top ten only'
from public.seller_room r where r.deal_id = 'c7100000-0000-0000-0000-0000000000d1';

select results_eq(
  $$ select tablename::text collate "default" from pg_publication_tables
     where pubname = 'supabase_realtime'
       and tablename in ('counsel_message', 'contract_comment', 'seller_room_comment')
     order by tablename $$,
  $$ values ('contract_comment'::text), ('counsel_message'::text), ('seller_room_comment'::text) $$,
  'contract comments, counsel messages and seller''s counsel comments are published to realtime'
);

select tests.login_as('lu_owner');
select results_eq(
  $$ select body from public.counsel_message order by body $$,
  $$ values ('To buyer counsel'::text), ('To seller counsel'::text) $$,
  'the team sees both threads'
);

select tests.login_as('lu_buyer_law');
select results_eq(
  $$ select body from public.counsel_message $$,
  $$ values ('To buyer counsel'::text) $$,
  'buyer''s counsel sees only the buyer thread'
);

select tests.login_as('lu_seller_law');
select results_eq(
  $$ select body from public.counsel_message $$,
  $$ values ('To seller counsel'::text) $$,
  'seller''s counsel sees only the seller thread'
);

select tests.login_as('lu_seller');
select is_empty(
  $$ select body from public.counsel_message $$,
  'the seller sees no counsel thread'
);
select results_eq(
  $$ select body from public.seller_room_comment $$,
  $$ values ('Top ten only'::text) $$,
  'the seller sees their counsel''s comments'
);

select tests.login_as('lu_owner');
select results_eq(
  $$ select body from public.seller_room_comment $$,
  $$ values ('Top ten only'::text) $$,
  'the deal team sees seller''s counsel comments'
);

select tests.login_as('lu_buyer_law');
select is_empty(
  $$ select body from public.seller_room_comment $$,
  'buyer''s counsel never sees seller''s counsel comments'
);

select tests.login_as('lu_stranger');
select is_empty(
  $$ select body from public.counsel_message $$,
  'a stranger sees no counsel thread'
);
select is_empty(
  $$ select body from public.seller_room_comment $$,
  'a stranger sees no seller''s counsel comments'
);

select * from finish();
rollback;
