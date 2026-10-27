begin;
select no_plan();

-- Team "SCT Team" owns deal d1. sct_owner owns the team, sct_analyst does
-- deal work, sct_buyer_law is buyer's counsel and sct_lender sits in a lender
-- room. On the seller side, sct_walt is the seller and sct_owen his counsel.
select tests.create_user('sct_owner');
select tests.create_user('sct_analyst');
select tests.create_user('sct_buyer_law');
select tests.create_user('sct_lender');
select tests.create_user('sct_walt');
select tests.create_user('sct_owen');

select tests.login_as_service_role();
select public.create_team_account('SCT Team', tests.get_uid('sct_owner'), 'sct-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('sct-team'), tests.get_uid('sct_analyst'), 'analyst');
select public.append_deal_event('5c700000-0000-0000-0000-0000000000d1', 'deal',
  '5c700000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('sct-team'), 'firm_id', tests.create_firm(tests.account_id('sct-team')), 'owner_user_id', tests.get_uid('sct_owner'),
    'description', 'Seller counsel thread deal'), null, 'service');

select tests.login_as('sct_owner');
select public.ensure_seller_room('5c700000-0000-0000-0000-0000000000d1');

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('sct_walt'), 'sct_walt@tuckin.test', 'Walt Brennan'
from public.seller_room where deal_id = '5c700000-0000-0000-0000-0000000000d1';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by)
values
  (tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('sct_owen'), 'sct_owen@tuckin.test', 'Owen Castillo', tests.get_uid('sct_walt')),
  (tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('sct_buyer_law'), 'sct_buyer_law@tuckin.test', 'Bea Law', tests.get_uid('sct_owner'));
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('5c700000-0000-0000-0000-0000000000f1', tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1', 'Lender A');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id) values
  ('5c700000-0000-0000-0000-0000000000a1', tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1',
   'Lender A', '5c700000-0000-0000-0000-0000000000f1');
insert into public.lender_room_member (room_id, user_id, email) values
  ('5c700000-0000-0000-0000-0000000000a1', tests.get_uid('sct_lender'), 'sct_lender@tuckin.test');

-- ---- The seller side write to each other, with files ----

select tests.login_as('sct_walt');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('seller-counsel-thread', '5c700000-0000-0000-0000-0000000000d1/w1/earnout-memo.pdf',
       tests.get_uid('sct_walt')::text) $$,
  'the seller uploads a file for the thread'
);
select lives_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1',
       'Should I accept the earnout?',
       '[{"name": "earnout-memo.pdf", "path": "5c700000-0000-0000-0000-0000000000d1/w1/earnout-memo.pdf"}]') $$,
  'the seller posts a message with the file attached'
);

select tests.login_as('sct_owen');
select lives_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1',
       'Only with a cap. Call me.') $$,
  'seller''s counsel reply'
);
select set_eq(
  $$ select author_side::text, author_name, body from public.seller_counsel_message $$,
  $$ values ('seller', 'Walt Brennan', 'Should I accept the earnout?'),
            ('counsel', 'Owen Castillo', 'Only with a cap. Call me.') $$,
  'seller''s counsel read the whole thread, each message named by who wrote it'
);
select results_eq(
  $$ select name from public.seller_counsel_message_file $$,
  $$ values ('earnout-memo.pdf') $$,
  'seller''s counsel see the attached file'
);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  $$ values ('5c700000-0000-0000-0000-0000000000d1/w1/earnout-memo.pdf') $$,
  'seller''s counsel can open the stored file'
);

select tests.login_as('sct_walt');
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'the seller reads counsel''s reply'
);

-- A file goes on a message only from its own uploader, on its own deal.
select tests.login_as('sct_owen');
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'Forwarding',
       '[{"name": "earnout-memo.pdf", "path": "5c700000-0000-0000-0000-0000000000d1/w1/earnout-memo.pdf"}]') $$,
  '42501',
  null,
  'nobody attaches a file someone else uploaded'
);

-- ---- Files stay in the thread, never the data room ----

select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.dr_document where deal_id = '5c700000-0000-0000-0000-0000000000d1' $$,
  'a thread file never lands in the data room'
);

-- ---- Nobody else on the deal reads it or writes to it ----

select tests.login_as('sct_owner');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'the buyer team''s owner sees no messages');
select is_empty($$ select 1 from public.seller_counsel_message_file $$, 'the buyer team''s owner sees no files');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  'the buyer team''s owner cannot open a stored file'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'Hello') $$,
  '42501',
  null,
  'the buyer team''s owner cannot post'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('seller-counsel-thread', '5c700000-0000-0000-0000-0000000000d1/o1/x.pdf', tests.get_uid('sct_owner')::text) $$,
  '42501',
  null,
  'the buyer team''s owner cannot upload a thread file'
);

select tests.login_as('sct_analyst');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'a buyer analyst sees no messages');
select is_empty($$ select 1 from public.seller_counsel_message_file $$, 'a buyer analyst sees no files');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  'a buyer analyst cannot open a stored file'
);

select tests.login_as('sct_buyer_law');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'buyer''s counsel see no messages');
select is_empty($$ select 1 from public.seller_counsel_message_file $$, 'buyer''s counsel see no files');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  'buyer''s counsel cannot open a stored file'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'Hello') $$,
  '42501',
  null,
  'buyer''s counsel cannot post'
);

select tests.login_as('sct_lender');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'a lender sees no messages');
select is_empty($$ select 1 from public.seller_counsel_message_file $$, 'a lender sees no files');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  'a lender cannot open a stored file'
);

-- ---- Team-only rows ----

select tests.login_as_service_role();
select throws_ok(
  $$ insert into public.seller_counsel_message (account_id, deal_id, author_user_id, author_side, author_name, body)
     values (tests.get_uid('sct_owner'), '5c700000-0000-0000-0000-0000000000d1', tests.get_uid('sct_walt'),
       'seller', 'Walt Brennan', 'On a personal account') $$,
  '23514',
  'deal work belongs to a team, not a personal account',
  'a thread message never belongs to a personal account'
);

-- ---- Its history never reaches the buyer side ----

select tests.login_as_service_role();
select lives_ok(
  $$ select public.append_deal_event('5c700000-0000-0000-0000-0000000000d1', 'seller_counsel_message',
       (select id from public.seller_counsel_message
        where deal_id = '5c700000-0000-0000-0000-0000000000d1' and author_side = 'seller'),
       'seller_counsel_message.posted', '{}'::jsonb, null, 'service') $$,
  'a posted message goes into the deal history for the email relay'
);
reset role;
insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
select tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1', 'seller_counsel_message', id, 1, '{}'
from public.seller_counsel_message
where deal_id = '5c700000-0000-0000-0000-0000000000d1' and author_side = 'seller';
select is_empty(
  $$ select 1 from jsonb_object_keys(public.deal_wide_manifest('5c700000-0000-0000-0000-0000000000d1') -> 'heads') k
     where k like 'seller_counsel_message:%' $$,
  'the deal-wide snapshot the team reads does not list thread messages'
);

select tests.login_as('sct_owner');
select isnt_empty(
  $$ select 1 from public.deal_event where deal_id = '5c700000-0000-0000-0000-0000000000d1' $$,
  'the buyer team''s owner still reads the rest of the deal history'
);
select is_empty(
  $$ select 1 from public.deal_event where aggregate_type = 'seller_counsel_message' $$,
  'the buyer team''s owner never sees a thread message in the deal history'
);
select is_empty(
  $$ select 1 from public.deal_event_snapshot where aggregate_type = 'seller_counsel_message' $$,
  'the buyer team''s owner never sees a thread message snapshot'
);

select tests.login_as('sct_analyst');
select is_empty(
  $$ select 1 from public.deal_event where aggregate_type = 'seller_counsel_message' $$,
  'a buyer analyst never sees a thread message in the deal history'
);
select is_empty(
  $$ select 1 from public.deal_event_snapshot where aggregate_type = 'seller_counsel_message' $$,
  'a buyer analyst never sees a thread message snapshot'
);

select tests.login_as('sct_buyer_law');
select is_empty(
  $$ select 1 from public.deal_event where aggregate_type = 'seller_counsel_message' $$,
  'buyer''s counsel never see a thread message in the deal history'
);

select tests.login_as('sct_lender');
select is_empty(
  $$ select 1 from public.deal_event where aggregate_type = 'seller_counsel_message' $$,
  'a lender never sees a thread message in the deal history'
);

-- ---- Read-only once the room closes or the deal ends ----

select tests.login_as('sct_walt');
select is(
  public.seller_side_read_only_reason('5c700000-0000-0000-0000-0000000000d1'),
  null,
  'an open room''s thread takes new messages'
);

reset role;
update public.seller_room set closed_at = now() where deal_id = '5c700000-0000-0000-0000-0000000000d1';

select tests.login_as('sct_walt');
select is(
  public.seller_side_read_only_reason('5c700000-0000-0000-0000-0000000000d1'),
  'The seller room is closed, so this is read-only.',
  'the seller is told why a closed room''s thread is read-only'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'One more thing') $$,
  'P0001',
  'The seller room is closed, so this is read-only.',
  'the seller cannot post once the room closes'
);
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'the seller still reads the thread once the room closes'
);

select tests.login_as('sct_owen');
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'One more thing') $$,
  'P0001',
  'The seller room is closed, so this is read-only.',
  'seller''s counsel cannot post once the room closes'
);
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'seller''s counsel still read the thread once the room closes'
);

reset role;
update public.seller_room set closed_at = null where deal_id = '5c700000-0000-0000-0000-0000000000d1';
update public.deal set archived_at = now() where id = '5c700000-0000-0000-0000-0000000000d1';

select tests.login_as('sct_walt');
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'One more thing') $$,
  'P0001',
  'This deal has closed, so everything here is read-only.',
  'the seller cannot post once the deal is archived'
);
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'the seller still reads the thread once the deal is archived'
);

reset role;
update public.deal set archived_at = null, resolution = 'lost' where id = '5c700000-0000-0000-0000-0000000000d1';

select tests.login_as('sct_walt');
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'One more thing') $$,
  'P0001',
  'This deal has closed, so everything here is read-only.',
  'the seller cannot post once the deal is resolved'
);

-- ---- Seller's counsel keep reading once the deal has ended ----
-- The deal is resolved here.

reset role;
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
select '5c700000-0000-0000-0000-0000000000c1', tests.account_id('sct-team'), '5c700000-0000-0000-0000-0000000000d1',
  s.folder_id, 'engagement-letter.pdf', 'sct/engagement-letter.pdf'
from public.seller_counsel_folder s where s.deal_id = '5c700000-0000-0000-0000-0000000000d1';
create temp table sct_room as
select id, account_id from public.seller_room where deal_id = '5c700000-0000-0000-0000-0000000000d1';
grant select on sct_room to authenticated;

select tests.login_as('sct_owen');
select ok(
  public.is_deal_seller_counsel_reader('5c700000-0000-0000-0000-0000000000d1'),
  'seller''s counsel still read an ended deal'
);
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'seller''s counsel still read the thread once the deal has ended'
);
select results_eq(
  $$ select name from public.seller_counsel_message_file $$,
  $$ values ('earnout-memo.pdf') $$,
  'seller''s counsel still see the thread''s files once the deal has ended'
);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'seller-counsel-thread' $$,
  $$ values ('5c700000-0000-0000-0000-0000000000d1/w1/earnout-memo.pdf') $$,
  'seller''s counsel can still open a thread file once the deal has ended'
);
select results_eq(
  $$ select name from public.dr_document where deal_id = '5c700000-0000-0000-0000-0000000000d1' $$,
  $$ values ('engagement-letter.pdf') $$,
  'seller''s counsel still read their folder''s files once the deal has ended'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'One more thing') $$,
  'P0001',
  'This deal has closed, so everything here is read-only.',
  'seller''s counsel cannot post once the deal has ended, and are told why'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('seller-counsel-thread', '5c700000-0000-0000-0000-0000000000d1/o2/late.pdf', tests.get_uid('sct_owen')::text) $$,
  '42501',
  null,
  'seller''s counsel cannot upload a thread file once the deal has ended'
);
select throws_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, dr_document_id, body)
     select id, account_id, '5c700000-0000-0000-0000-0000000000c1', 'Late comment' from sct_room $$,
  '42501',
  null,
  'seller''s counsel cannot comment in the seller room once the deal has ended'
);
select is(
  public.is_deal_counsel('5c700000-0000-0000-0000-0000000000d1', 'seller'),
  false,
  'seller''s counsel no longer act as counsel once the deal has ended'
);

select tests.login_as('sct_buyer_law');
select is(
  public.is_deal_counsel('5c700000-0000-0000-0000-0000000000d1', 'buyer'),
  false,
  'buyer''s counsel still lose the portal once the deal has ended'
);
select ok(
  not public.is_deal_seller_counsel_reader('5c700000-0000-0000-0000-0000000000d1'),
  'buyer''s counsel never read as seller''s counsel'
);
select is_empty($$ select 1 from public.seller_counsel_message $$, 'buyer''s counsel still see no messages');
select is_empty($$ select 1 from public.dr_document where name = 'engagement-letter.pdf' $$,
  'buyer''s counsel still see no Seller''s counsel folder files');

select tests.login_as('sct_owner');
select is_empty($$ select 1 from public.seller_counsel_message $$, 'the buyer team''s owner still sees no messages');
select is_empty($$ select 1 from public.dr_document where name = 'engagement-letter.pdf' $$,
  'the buyer team''s owner still sees no Seller''s counsel folder files');

-- ---- One year of reading for seller's counsel ----

reset role;
update public.deal set resolution = null, archived_at = now() - interval '10 days'
where id = '5c700000-0000-0000-0000-0000000000d1';
select set_config('sct.read_until',
  (select (archived_at + interval '1 year')::text from public.deal where id = '5c700000-0000-0000-0000-0000000000d1'),
  true);

select tests.login_as('sct_owen');
select is(
  public.seller_counsel_read_until('5c700000-0000-0000-0000-0000000000d1'),
  current_setting('sct.read_until')::timestamptz,
  'seller''s counsel read for a year from the day the deal ended'
);
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'seller''s counsel read the thread within that year'
);

reset role;
update public.deal set archived_at = now() - interval '400 days'
where id = '5c700000-0000-0000-0000-0000000000d1';

select tests.login_as('sct_owen');
select ok(
  not public.is_deal_seller_counsel_reader('5c700000-0000-0000-0000-0000000000d1'),
  'seller''s counsel stop reading a year after the deal ended'
);
select is_empty($$ select 1 from public.seller_counsel_message $$,
  'seller''s counsel no longer read the thread after that year');
select is_empty($$ select 1 from public.dr_document where name = 'engagement-letter.pdf' $$,
  'seller''s counsel no longer read their folder after that year');

select tests.login_as('sct_walt');
select is(
  (select count(*)::int from public.seller_counsel_message),
  2,
  'the seller keeps reading the thread after that year'
);

select tests.login_as('sct_owner');
select is(
  public.seller_counsel_read_until('5c700000-0000-0000-0000-0000000000d1'),
  null,
  'nobody but seller''s counsel learns when their access ends'
);

-- ---- Thread limits ----

reset role;
update public.deal set archived_at = null where id = '5c700000-0000-0000-0000-0000000000d1';

select tests.login_as('sct_walt');
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', repeat('x', 10001)) $$,
  'P0001',
  'A message can be at most 10,000 characters.',
  'a message longer than 10,000 characters is refused'
);
select throws_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'Files',
       (select jsonb_agg(jsonb_build_object('path', '5c700000-0000-0000-0000-0000000000d1/w' || n || '/f.pdf'))
        from generate_series(1, 21) n)) $$,
  'P0001',
  'Attach at most 20 files to one message.',
  'more than 20 files on one message are refused'
);
insert into storage.objects (bucket_id, name, owner_id)
values ('seller-counsel-thread', '5c700000-0000-0000-0000-0000000000d1/w9/Real & True.pdf',
  tests.get_uid('sct_walt')::text);
select lives_ok(
  $$ select public.post_seller_counsel_message('5c700000-0000-0000-0000-0000000000d1', 'Named by the store',
       '[{"name": "made-up.exe", "path": "5c700000-0000-0000-0000-0000000000d1/w9/Real & True.pdf"}]') $$,
  'the seller attaches a stored file'
);
select results_eq(
  $$ select name from public.seller_counsel_message_file
     where storage_path = '5c700000-0000-0000-0000-0000000000d1/w9/Real & True.pdf' $$,
  $$ values ('Real & True.pdf') $$,
  'a file is named from the stored object, never from what the client sends'
);

select * from finish();
rollback;
