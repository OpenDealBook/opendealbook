begin;
select no_plan();

select tests.create_user('rc_owner');
select tests.create_user('rc_mate');

select tests.login_as_service_role();
select public.create_team_account('RC Team', tests.get_uid('rc_owner'), 'rc-team');
select public.append_deal_event('7c000000-0000-0000-0000-0000000000d1', 'deal',
  '7c000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('rc-team'), 'owner_user_id', tests.get_uid('rc_owner'),
    'description', 'Closing deal'), null, 'service');

reset role;
set local session_replication_role = replica;

insert into public.dr_folder (id, account_id, deal_id, name) values
  ('7c000000-0000-0000-0000-00000000f001', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1', 'Uploads'),
  ('7c000000-0000-0000-0000-00000000f002', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1', 'Lender A'),
  ('7c000000-0000-0000-0000-00000000f003', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1', 'Lender B');

insert into public.seller_room (id, account_id, deal_id, uploads_folder_id) values
  ('7c000000-0000-0000-0000-0000000000a5', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    '7c000000-0000-0000-0000-00000000f001');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id) values
  ('7c000000-0000-0000-0000-0000000000a1', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    'Lender A', '7c000000-0000-0000-0000-00000000f002'),
  ('7c000000-0000-0000-0000-0000000000a2', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    'Lender B', '7c000000-0000-0000-0000-00000000f003');

insert into public.personal_todo (id, account_id, deal_id, user_id, title) values
  ('7c000000-0000-0000-0000-00000000b001', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    tests.get_uid('rc_owner'), 'Tell the seller/broker the room is closing'),
  ('7c000000-0000-0000-0000-00000000b002', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    tests.get_uid('rc_mate'), 'Tell the seller/broker the room is closing'),
  ('7c000000-0000-0000-0000-00000000b003', tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1',
    tests.get_uid('rc_owner'), 'Tell Lender A the room is closing');

set local session_replication_role = origin;

create function pg_temp.sent_update(sent_at timestamptz, entry public.deal_person_entry) returns void as $$
declare
  made uuid := gen_random_uuid();
begin
  insert into public.deal_update (id, account_id, deal_id, author_id, subject, body, picks, status)
  values (made, tests.account_id('rc-team'), '7c000000-0000-0000-0000-0000000000d1', tests.get_uid('rc_owner'),
    'Closing', 'We are closing the room', '{"groups": [], "people": []}', 'approved');
  insert into public.deal_update_recipient (update_id, email, entries, sent_at)
  values (made, 'someone@deal.test', array[entry], sent_at);
end;
$$ language plpgsql;

create function pg_temp.seller_ready() returns boolean as $$
  select public.room_close_ready('seller', '7c000000-0000-0000-0000-0000000000a5');
$$ language sql;

-- ---- Seller room ----
select is(pg_temp.seller_ready(), false, 'a room with no closing to-do is not ready to close');

select tests.login_as('rc_owner');
select throws_ok(
  $$ update public.seller_room set closed_at = now() where id = '7c000000-0000-0000-0000-0000000000a5' $$,
  'P0001', 'Tell the sellers or brokers the room is closing first',
  'the team cannot close a seller room straight through the API before telling the sellers'
);
select throws_ok(
  $$ update public.lender_room set closed_at = now() where id = '7c000000-0000-0000-0000-0000000000a1' $$,
  'P0001', 'Tell the lender the room is closing first',
  'the team cannot close a lender room straight through the API before telling the lender'
);
reset role;

insert into public.room_closing_todo (room_kind, room_id, user_id, todo_id, created_at) values
  ('seller', '7c000000-0000-0000-0000-0000000000a5', tests.get_uid('rc_owner'), '7c000000-0000-0000-0000-00000000b001', '2026-10-10T12:00:00Z'),
  ('seller', '7c000000-0000-0000-0000-0000000000a5', tests.get_uid('rc_mate'), '7c000000-0000-0000-0000-00000000b002', '2026-10-11T12:00:00Z');

select is(pg_temp.seller_ready(), false, 'an unticked closing to-do does not unlock the close');

select pg_temp.sent_update('2026-10-09T12:00:00Z',
  row('seller_room', null, 'Sam', null, null, 'seller', 'seller', null, false, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), false, 'an update sent to a seller before the first to-do does not count');

select pg_temp.sent_update('2026-10-12T12:00:00Z',
  row('team', null, 'Tia', null, 'RC Team', 'buyer', 'principal', null, null, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), false, 'an update sent only to the team does not count');

select pg_temp.sent_update('2026-10-12T12:00:00Z',
  row('lender_room', null, 'Lee', null, 'Lender A', 'lender', 'lender', '7c000000-0000-0000-0000-0000000000a1', false, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), false, 'an update sent only to a lender does not count for the seller room');

select pg_temp.sent_update('2026-10-10T18:00:00Z',
  row('contact', gen_random_uuid(), 'Bob', null, 'Buy Brokers', 'buyer', 'broker', null, null, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), false, 'an update sent to a buyer-side broker does not count');

select pg_temp.sent_update('2026-10-10T18:00:00Z',
  row('contact', gen_random_uuid(), 'Bea', null, 'Brokerage', 'seller', 'broker', null, null, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), true, 'an update sent to a seller-side broker after the first to-do unlocks the close');

delete from public.deal_update;
select is(pg_temp.seller_ready(), false, 'without that update the room is locked again');

select pg_temp.sent_update('2026-10-10T18:00:00Z',
  row('contact', gen_random_uuid(), 'Sal', null, null, 'seller', 'principal', null, null, false)::public.deal_person_entry);
select is(pg_temp.seller_ready(), true, 'an update sent to a seller-side principal contact unlocks the close');

delete from public.deal_update;
update public.personal_todo set done = true where id = '7c000000-0000-0000-0000-00000000b002';
select is(pg_temp.seller_ready(), true, 'ticking any one teammate''s closing to-do unlocks the close');

-- ---- Lender room ----
select is(public.room_close_ready('lender', '7c000000-0000-0000-0000-0000000000a1'), false,
  'a seller room to-do does not unlock a lender room');

insert into public.room_closing_todo (room_kind, room_id, user_id, todo_id, created_at) values
  ('lender', '7c000000-0000-0000-0000-0000000000a1', tests.get_uid('rc_owner'), '7c000000-0000-0000-0000-00000000b003', '2026-10-10T12:00:00Z');

select pg_temp.sent_update('2026-10-12T12:00:00Z',
  row('lender_room', null, 'Bo', null, 'Lender B', 'lender', 'lender', '7c000000-0000-0000-0000-0000000000a2', false, false)::public.deal_person_entry);
select is(public.room_close_ready('lender', '7c000000-0000-0000-0000-0000000000a1'), false,
  'an update sent to another lender room does not count');

select pg_temp.sent_update('2026-10-12T12:00:00Z',
  row('lender_room', null, 'Lee', null, 'Lender A', 'lender', 'lender', '7c000000-0000-0000-0000-0000000000a1', false, false)::public.deal_person_entry);
select is(public.room_close_ready('lender', '7c000000-0000-0000-0000-0000000000a1'), true,
  'an update sent to someone in the lender room unlocks its close');

-- ---- Closing once ready ----
select tests.login_as('rc_owner');
select lives_ok(
  $$ update public.seller_room set closed_at = now() where id = '7c000000-0000-0000-0000-0000000000a5' $$,
  'the team closes a seller room once it is ready'
);
select lives_ok(
  $$ update public.lender_room set closed_at = now() where id = '7c000000-0000-0000-0000-0000000000a1' $$,
  'the team closes a lender room once it is ready'
);
reset role;

-- ---- Access ----
select tests.login_as('rc_owner');
select throws_ok(
  $$ select public.room_close_ready('seller', '7c000000-0000-0000-0000-0000000000a5') $$,
  '42501', null, 'only the service role asks whether a room may close'
);
select throws_ok(
  $$ select * from public.room_closing_todo $$,
  '42501', null, 'only the service role reads closing to-dos'
);

select * from finish();
rollback;
