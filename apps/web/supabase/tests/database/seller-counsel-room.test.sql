begin;
select no_plan();

-- Team "SCR Team" owns deal d1 and its seller room. scr_owner manages it,
-- scr_walt is the seller, scr_owen is seller's counsel Walt invited, and
-- scr_buyer_law is buyer's counsel.
select tests.create_user('scr_owner');
select tests.create_user('scr_walt');
select tests.create_user('scr_owen');
select tests.create_user('scr_buyer_law');
select tests.create_user('scr_stranger');
select tests.create_user('scr_olga');
select tests.create_user('scr_ezra');
select tests.create_user('scr_nameless');

select tests.login_as_service_role();
select public.create_team_account('SCR Team', tests.get_uid('scr_owner'), 'scr-team');
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'deal',
  '5c000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('scr-team'), 'firm_id', tests.create_firm(tests.account_id('scr-team')), 'owner_user_id', tests.get_uid('scr_owner'),
    'description', 'Seller counsel room deal'), null, 'service');

select tests.login_as('scr_owner');
select public.ensure_seller_room('5c000000-0000-0000-0000-0000000000d1');

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('scr_walt'), 'scr_walt@tuckin.test', 'Walt Brennan'
from public.seller_room where deal_id = '5c000000-0000-0000-0000-0000000000d1';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by)
values
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('scr_owen'), 'scr_owen@tuckin.test', 'Owen Castillo', tests.get_uid('scr_walt')),
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('scr_buyer_law'), 'scr_buyer_law@tuckin.test', 'Bea Law', tests.get_uid('scr_owner'));

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('5c000000-0000-0000-0000-0000000000f1', tests.account_id('scr-team'),
    '5c000000-0000-0000-0000-0000000000d1', null, 'Financials'),
  ('5c000000-0000-0000-0000-0000000000f2', tests.account_id('scr-team'),
    '5c000000-0000-0000-0000-0000000000d1', null, 'Internal');
insert into public.seller_room_folder (room_id, dr_folder_id)
select id, '5c000000-0000-0000-0000-0000000000f1'
from public.seller_room where deal_id = '5c000000-0000-0000-0000-0000000000d1';
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values
  ('5c000000-0000-0000-0000-0000000000a1', tests.account_id('scr-team'),
    '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000f1', 'p-and-l.pdf', 'scr/p-and-l.pdf'),
  ('5c000000-0000-0000-0000-0000000000a2', tests.account_id('scr-team'),
    '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000f2', 'notes.pdf', 'scr/notes.pdf');
insert into public.seller_room_question (id, room_id, account_id, title)
select '5c000000-0000-0000-0000-0000000000b1', id, account_id, 'Why did revenue dip in 2023?'
from public.seller_room where deal_id = '5c000000-0000-0000-0000-0000000000d1';

create temp table scr_room as
select id from public.seller_room where deal_id = '5c000000-0000-0000-0000-0000000000d1';
grant select on scr_room to authenticated;

-- ---- Before any file lands in the Seller's counsel folder ----

select tests.login_as_service_role();
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'dr_document',
  '5c000000-0000-0000-0000-0000000000a6', 'dr_document.added',
  jsonb_build_object('folder_id', '5c000000-0000-0000-0000-0000000000f1', 'name', 'lease.pdf',
    'storage_path', 'deal/5c000000-0000-0000-0000-0000000000d1/lease.pdf', 'version', 1), null, 'service');
reset role;
insert into storage.objects (bucket_id, name)
values ('data-room', 'deal/5c000000-0000-0000-0000-0000000000d1/lease.pdf');

select tests.login_as('scr_owner');
select results_eq(
  $$ select payload->>'name' from public.deal_event
     where deal_id = '5c000000-0000-0000-0000-0000000000d1' and aggregate_type = 'dr_document' $$,
  $$ values ('lease.pdf') $$,
  'the team reads its own file history while the Seller''s counsel folder is empty'
);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'data-room'
     and name like 'deal/5c000000-0000-0000-0000-0000000000d1/%' $$,
  $$ values ('deal/5c000000-0000-0000-0000-0000000000d1/lease.pdf') $$,
  'the team opens its own stored files while the Seller''s counsel folder is empty'
);

-- ---- Seller's counsel comment on room files and question threads ----

select tests.login_as('scr_owen');
select lives_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, dr_document_id, body)
     select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000a1', 'Ask for the 2022 restatement'
     from scr_room $$,
  'seller''s counsel comments on a file the room shows'
);
select lives_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, question_id, body)
     select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000b1', 'Answer with the lease change only'
     from scr_room $$,
  'seller''s counsel comments on a question thread'
);
select throws_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, dr_document_id, body)
     select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000a2', 'Peeking'
     from scr_room $$,
  '42501',
  null,
  'seller''s counsel cannot comment on a file the room does not show'
);

select tests.login_as('scr_walt');
select set_eq(
  $$ select author, body from public.seller_room_comments((select id from scr_room)) $$,
  $$ values ('Owen Castillo, Walt''s counsel', 'Ask for the 2022 restatement'),
            ('Owen Castillo, Walt''s counsel', 'Answer with the lease change only') $$,
  'the seller sees counsel comments, labelled as their counsel'
);
select throws_ok(
  $$ insert into public.seller_room_comment (room_id, account_id, question_id, body)
     select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000b1', 'Me too'
     from scr_room $$,
  '42501',
  null,
  'the seller answers questions rather than commenting'
);

select tests.login_as('scr_owner');
select set_eq(
  $$ select author, dr_document_id, question_id from public.seller_room_comments((select id from scr_room)) $$,
  $$ values ('Owen Castillo, Walt''s counsel', '5c000000-0000-0000-0000-0000000000a1'::uuid, null::uuid),
            ('Owen Castillo, Walt''s counsel', null::uuid, '5c000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'the buyer''s deal team sees counsel comments and what each is on'
);

select tests.login_as('scr_buyer_law');
select is_empty(
  $$ select 1 from public.seller_room_comments((select id from scr_room)) $$,
  'buyer''s counsel do not see the seller''s counsel comments'
);
select is_empty(
  $$ select 1 from public.seller_room_comment $$,
  'buyer''s counsel cannot read the comment table'
);

-- Counsel the team invited, and counsel a seller with no name invited, still
-- have their comments shown, labelled as the seller's counsel.
reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('scr_nameless'), 'scr_nameless@tuckin.test', ''
from scr_room;
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, invited_by)
values
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('scr_olga'), 'scr_olga@tuckin.test', 'Olga Petrova', tests.get_uid('scr_owner')),
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('scr_ezra'), 'scr_ezra@tuckin.test', 'Ezra Stone', tests.get_uid('scr_nameless'));
insert into public.seller_room_comment (room_id, account_id, question_id, author_user_id, body)
select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000b1', tests.get_uid('scr_olga'), 'Team-invited view'
from scr_room;
insert into public.seller_room_comment (room_id, account_id, question_id, author_user_id, body)
select id, tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000b1', tests.get_uid('scr_ezra'), 'Nameless-invited view'
from scr_room;

select tests.login_as('scr_owner');
select set_eq(
  $$ select author, body from public.seller_room_comments((select id from scr_room))
     where body in ('Team-invited view', 'Nameless-invited view') $$,
  $$ values ('Olga Petrova, the seller''s counsel', 'Team-invited view'),
            ('Ezra Stone, the seller''s counsel', 'Nameless-invited view') $$,
  'counsel not invited by a named seller still have their comments shown, as the seller''s counsel'
);

-- ---- Seller's counsel never answer for the seller ----

select tests.login_as('scr_owen');
select throws_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('5c000000-0000-0000-0000-0000000000b1', 'seller', 'Revenue dipped because of the lease') $$,
  '42501',
  null,
  'seller''s counsel cannot answer a question'
);
select throws_ok(
  $$ insert into public.seller_room_question_file (question_id, dr_document_id, side)
     values ('5c000000-0000-0000-0000-0000000000b1', '5c000000-0000-0000-0000-0000000000a1', 'seller') $$,
  '42501',
  null,
  'seller''s counsel cannot attach a file as an answer'
);

select tests.login_as('scr_walt');
select lives_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('5c000000-0000-0000-0000-0000000000b1', 'seller', 'Revenue dipped because of the lease') $$,
  'the seller still answers'
);

-- ---- The "Seller's counsel" folder ----

select tests.login_as_service_role();
select results_eq(
  $$ select f.name, f.parent_id from public.seller_counsel_folder s join public.dr_folder f on f.id = s.folder_id
     where s.deal_id = '5c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('Seller''s counsel', null::uuid) $$,
  'inviting seller''s counsel gives the deal a root Seller''s counsel folder'
);

-- Only the seller side see it: the seller and seller's counsel read and
-- hold files there; the buyer team and buyer's counsel never see it.
reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
select '5c000000-0000-0000-0000-0000000000f3', tests.account_id('scr-team'),
  '5c000000-0000-0000-0000-0000000000d1', s.folder_id, 'Drafts'
from public.seller_counsel_folder s where s.deal_id = '5c000000-0000-0000-0000-0000000000d1';
insert into public.dr_document (id, account_id, deal_id, folder_id, name, storage_path)
values ('5c000000-0000-0000-0000-0000000000a3', tests.account_id('scr-team'),
  '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000f3', 'side-letter.pdf', 'scr/side-letter.pdf');

select tests.login_as('scr_owner');
select is_empty(
  $$ select name from public.dr_folder
     where deal_id = '5c000000-0000-0000-0000-0000000000d1' and name in ('Seller''s counsel', 'Drafts') $$,
  'the buyer team never sees the Seller''s counsel folder or anything below it'
);
select is_empty(
  $$ select 1 from public.dr_document where id = '5c000000-0000-0000-0000-0000000000a3' $$,
  'the buyer team never sees a file in the Seller''s counsel folder'
);

select tests.login_as('scr_buyer_law');
select is_empty(
  $$ select name from public.buyer_counsel_folders('5c000000-0000-0000-0000-0000000000d1')
     where name in ('Seller''s counsel', 'Drafts') $$,
  'buyer''s counsel never see the Seller''s counsel folder'
);
select is_empty(
  $$ select 1 from public.buyer_counsel_documents('5c000000-0000-0000-0000-0000000000d1')
     where id = '5c000000-0000-0000-0000-0000000000a3' $$,
  'buyer''s counsel never see a file in the Seller''s counsel folder'
);

select tests.login_as('scr_owen');
select set_eq(
  $$ select name from public.dr_folder
     where deal_id = '5c000000-0000-0000-0000-0000000000d1' and name in ('Seller''s counsel', 'Drafts') $$,
  $$ values ('Seller''s counsel'), ('Drafts') $$,
  'seller''s counsel see the Seller''s counsel folder and below'
);
select results_eq(
  $$ select name from public.dr_document where id = '5c000000-0000-0000-0000-0000000000a3' $$,
  $$ values ('side-letter.pdf') $$,
  'seller''s counsel see the files in it'
);

select tests.login_as('scr_walt');
select set_eq(
  $$ select name from public.dr_folder
     where deal_id = '5c000000-0000-0000-0000-0000000000d1' and name in ('Seller''s counsel', 'Drafts') $$,
  $$ values ('Seller''s counsel'), ('Drafts') $$,
  'the seller sees the Seller''s counsel folder and below'
);
select results_eq(
  $$ select name from public.dr_document where id = '5c000000-0000-0000-0000-0000000000a3' $$,
  $$ values ('side-letter.pdf') $$,
  'the seller sees the files in it'
);

reset role;
select throws_ok(
  $$ insert into public.seller_room_folder (room_id, dr_folder_id)
     select r.id, s.folder_id from scr_room r, public.seller_counsel_folder s
     where s.deal_id = '5c000000-0000-0000-0000-0000000000d1' $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'the Seller''s counsel folder is never shared into the seller room'
);
select throws_ok(
  $$ update public.dr_folder set parent_id = '5c000000-0000-0000-0000-0000000000f1'
     where id = (select folder_id from public.seller_counsel_folder
                 where deal_id = '5c000000-0000-0000-0000-0000000000d1') $$,
  '23001',
  'Counsel folders cannot be shown to sellers.',
  'the Seller''s counsel folder is never moved into a shared folder'
);
select throws_ok(
  $$ delete from public.dr_folder
     where id = (select folder_id from public.seller_counsel_folder
                 where deal_id = '5c000000-0000-0000-0000-0000000000d1') $$,
  '23001',
  'This folder holds seller''s counsel files and cannot be deleted',
  'nobody deletes the Seller''s counsel folder while its deal exists'
);

-- ---- Nothing on the buyer side names or opens its files ----

select tests.login_as_service_role();
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'dr_document',
  '5c000000-0000-0000-0000-0000000000a4', 'dr_document.added',
  jsonb_build_object('folder_id', '5c000000-0000-0000-0000-0000000000f3', 'name', 'tax-memo.pdf',
    'storage_path', 'deal/5c000000-0000-0000-0000-0000000000d1/tax-memo.pdf', 'version', 1), null, 'service');
select public.append_deal_event('5c000000-0000-0000-0000-0000000000d1', 'dr_document',
  '5c000000-0000-0000-0000-0000000000a5', 'dr_document.added',
  jsonb_build_object('folder_id', '5c000000-0000-0000-0000-0000000000f1', 'name', 'budget.pdf',
    'storage_path', 'deal/5c000000-0000-0000-0000-0000000000d1/budget.pdf', 'version', 1), null, 'service');

reset role;
insert into storage.objects (bucket_id, name) values
  ('data-room', 'deal/5c000000-0000-0000-0000-0000000000d1/tax-memo.pdf'),
  ('data-room', 'deal/5c000000-0000-0000-0000-0000000000d1/tax-memo.pdf.preview.pdf'),
  ('data-room', 'deal/5c000000-0000-0000-0000-0000000000d1/budget.pdf');

select tests.login_as('scr_owner');
select set_eq(
  $$ select payload->>'name' from public.deal_event
     where deal_id = '5c000000-0000-0000-0000-0000000000d1' and aggregate_type = 'dr_document' $$,
  $$ values ('lease.pdf'), ('budget.pdf') $$,
  'the team''s deal history never names a file in the Seller''s counsel folder'
);
select set_eq(
  $$ select name from storage.objects
     where bucket_id = 'data-room' and name like 'deal/5c000000-0000-0000-0000-0000000000d1/%' $$,
  $$ values ('deal/5c000000-0000-0000-0000-0000000000d1/lease.pdf'),
            ('deal/5c000000-0000-0000-0000-0000000000d1/budget.pdf') $$,
  'the team cannot open a stored file, or its preview, from the Seller''s counsel folder'
);

-- ---- Nobody off the seller side lists the folder or its files ----

select tests.login_as('scr_stranger');
select is(
  public.seller_counsel_folder_ids(),
  '{}'::uuid[],
  'a stranger lists no Seller''s counsel folders'
);
select throws_ok(
  $$ select * from public.seller_counsel_documents() $$,
  '42883',
  null,
  'nobody lists every Seller''s counsel file and where it is stored'
);

select tests.login_as('scr_owner');
select is(
  public.seller_counsel_folder_ids(),
  '{}'::uuid[],
  'the buyer team lists no Seller''s counsel folders'
);

select tests.login_as('scr_owen');
select set_eq(
  $$ select unnest(public.seller_counsel_folder_ids()) $$,
  $$ select parent_id from public.dr_folder where id = '5c000000-0000-0000-0000-0000000000f3'
     union select '5c000000-0000-0000-0000-0000000000f3'::uuid $$,
  'seller''s counsel list their deal''s Seller''s counsel folders'
);

-- ---- Nor reads its files through AI ----

reset role;
insert into public.document_chunk (account_id, deal_id, document_id, chunk_index, content, embedding)
select tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', d.id, 0, d.name,
  array_fill(0.1, array[1536])::extensions.vector
from (values ('5c000000-0000-0000-0000-0000000000a1'::uuid, 'p-and-l chunk'),
             ('5c000000-0000-0000-0000-0000000000a3'::uuid, 'side-letter chunk')) d(id, name);
insert into public.embedding_job (account_id, deal_id, dr_document_id)
values
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000a1'),
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000a3');
insert into public.verification_run (id, account_id, deal_id, trigger)
values ('5c000000-0000-0000-0000-0000000000e1', tests.account_id('scr-team'),
  '5c000000-0000-0000-0000-0000000000d1', 'test');
insert into public.verification_finding (account_id, deal_id, run_id, check_key, severity, dr_document_id)
values
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000e1',
    'p-and-l', 'info', '5c000000-0000-0000-0000-0000000000a1'),
  (tests.account_id('scr-team'), '5c000000-0000-0000-0000-0000000000d1', '5c000000-0000-0000-0000-0000000000e1',
    'side-letter', 'info', '5c000000-0000-0000-0000-0000000000a3');

select tests.login_as('scr_owner');
select results_eq(
  $$ select content from public.document_chunk where deal_id = '5c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('p-and-l chunk') $$,
  'the buyer team reads no text from a Seller''s counsel file'
);
select results_eq(
  $$ select content from public.match_document_chunks('5c000000-0000-0000-0000-0000000000d1',
       array_fill(0.1, array[1536])::extensions.vector, 10) $$,
  $$ values ('p-and-l chunk') $$,
  'the buyer team''s AI search never returns a Seller''s counsel file'
);
select results_eq(
  $$ select dr_document_id from public.embedding_job where deal_id = '5c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('5c000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'the buyer team sees no indexing of a Seller''s counsel file'
);
select results_eq(
  $$ select check_key from public.verification_finding where deal_id = '5c000000-0000-0000-0000-0000000000d1' $$,
  $$ values ('p-and-l') $$,
  'the buyer team sees no verification finding on a Seller''s counsel file'
);

select * from finish();
rollback;
