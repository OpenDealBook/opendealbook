begin;
select no_plan();

-- Account 1 owns deal d1 with rooms A, B, C (closed) and, made after the
-- entries, room D. Account 2 owns deal d2 with room Z.
select tests.create_user('lf_owner');
select tests.create_user('lf_owner_2');
select tests.create_user('lf_lender_a');
select tests.create_user('lf_lender_b');
select tests.create_user('lf_lender_c');
select tests.create_user('lf_lender_d');
select tests.create_user('lf_lender_z');

select tests.login_as_service_role();
select public.create_team_account('LF Acct', tests.get_uid('lf_owner'), 'lf-acct');
select public.create_team_account('LF Acct 2', tests.get_uid('lf_owner_2'), 'lf-acct-2');

select public.append_deal_event('1f000000-0000-0000-0000-0000000000d1', 'deal',
  '1f000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lf-acct'), 'owner_user_id', tests.get_uid('lf_owner'),
    'description', 'FAQ deal'), null, 'service');
select public.append_deal_event('1f000000-0000-0000-0000-0000000000d2', 'deal',
  '1f000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lf-acct-2'), 'owner_user_id', tests.get_uid('lf_owner_2'),
    'description', 'Other FAQ deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('1f000000-0000-0000-0000-00000000f00a', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', null, 'Room A'),
  ('1f000000-0000-0000-0000-00000000f00b', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', null, 'Room B'),
  ('1f000000-0000-0000-0000-00000000f00c', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', null, 'Room C'),
  ('1f000000-0000-0000-0000-00000000f00d', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', null, 'Room D'),
  ('1f000000-0000-0000-0000-00000000f00e', tests.account_id('lf-acct-2'), '1f000000-0000-0000-0000-0000000000d2', null, 'Room Z');

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id, closed_at)
values
  ('1f000000-0000-0000-0000-0000000000a0', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Lender A', '1f000000-0000-0000-0000-00000000f00a', null),
  ('1f000000-0000-0000-0000-0000000000b0', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Lender B', '1f000000-0000-0000-0000-00000000f00b', null),
  ('1f000000-0000-0000-0000-0000000000c0', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Lender C', '1f000000-0000-0000-0000-00000000f00c', now()),
  ('1f000000-0000-0000-0000-0000000000e0', tests.account_id('lf-acct-2'), '1f000000-0000-0000-0000-0000000000d2', 'Lender Z', '1f000000-0000-0000-0000-00000000f00e', null);

insert into public.lender_room_member (room_id, user_id, email, invited_by)
values
  ('1f000000-0000-0000-0000-0000000000a0', tests.get_uid('lf_lender_a'), 'lf_lender_a@tuckin.test', tests.get_uid('lf_owner')),
  ('1f000000-0000-0000-0000-0000000000b0', tests.get_uid('lf_lender_b'), 'lf_lender_b@tuckin.test', tests.get_uid('lf_owner')),
  ('1f000000-0000-0000-0000-0000000000c0', tests.get_uid('lf_lender_c'), 'lf_lender_c@tuckin.test', tests.get_uid('lf_owner')),
  ('1f000000-0000-0000-0000-0000000000e0', tests.get_uid('lf_lender_z'), 'lf_lender_z@tuckin.test', tests.get_uid('lf_owner_2'));

insert into public.lender_ask (id, room_id, account_id, kind, title, return_route, created_by)
values
  ('1f000000-0000-0000-0000-00000000a5a0', '1f000000-0000-0000-0000-0000000000a0', tests.account_id('lf-acct'), 'ask', 'A asks', null, tests.get_uid('lf_lender_a')),
  ('1f000000-0000-0000-0000-00000000a5e0', '1f000000-0000-0000-0000-0000000000e0', tests.account_id('lf-acct-2'), 'ask', 'Z asks', null, tests.get_uid('lf_lender_z'));

-- e1 published, e2 draft, e3 unpublished, e4 published but hidden for room A,
-- e5 published and pinned.
select tests.login_as('lf_owner');

select lives_ok(
  $$
    insert into public.lender_faq_entry (id, account_id, deal_id, question, answer, status, pinned)
    values
      ('1f000000-0000-0000-0000-0000000000e1', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1',
        'What is the DSCR covenant?', 'Minimum 1.25x, tested annually.', 'draft', false),
      ('1f000000-0000-0000-0000-0000000000e2', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1',
        'Draft question', 'Draft answer', 'draft', false),
      ('1f000000-0000-0000-0000-0000000000e3', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1',
        'Withdrawn question', 'Withdrawn answer', 'draft', false),
      ('1f000000-0000-0000-0000-0000000000e4', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1',
        'Is there a prepayment penalty?', 'None after year two.', 'draft', false),
      ('1f000000-0000-0000-0000-0000000000e5', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1',
        'Who is the seller?', 'The founder.', 'draft', true)
  $$,
  'the deal team writes FAQ entries as drafts'
);

select throws_ok(
  $$
    insert into public.lender_faq_entry (account_id, deal_id, question, answer, status)
    values (tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', 'q', 'a', 'published')
  $$,
  '42501', null, 'the deal team cannot write an entry straight to published'
);

select throws_ok(
  $$ update public.lender_faq_entry set status = 'published' where id = '1f000000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'the deal team cannot publish an entry by updating it'
);

select throws_ok(
  $$
    insert into public.lender_faq_file (entry_id, deal_id, name, storage_path)
    values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1',
      'direct.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/direct.pdf')
  $$,
  '42501', null, 'the deal team cannot write FAQ files directly'
);

-- Server code publishes, after the action's checks.
select tests.login_as_service_role();

select lives_ok(
  $$
    update public.lender_faq_entry set status = 'published'
    where id in ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000e3',
      '1f000000-0000-0000-0000-0000000000e4', '1f000000-0000-0000-0000-0000000000e5')
  $$,
  'server code publishes entries'
);

select tests.login_as('lf_owner');

select lives_ok(
  $$ update public.lender_faq_entry set status = 'unpublished' where id = '1f000000-0000-0000-0000-0000000000e3' $$,
  'the deal team unpublishes an entry'
);

select throws_ok(
  $$ update public.lender_faq_entry set status = 'published' where id = '1f000000-0000-0000-0000-0000000000e3' $$,
  '42501', null, 'the deal team cannot republish an entry by updating it'
);

select lives_ok(
  $$
    insert into public.lender_faq_hidden (room_id, deal_id, entry_id)
    values ('1f000000-0000-0000-0000-0000000000a0', '1f000000-0000-0000-0000-0000000000d1', '1f000000-0000-0000-0000-0000000000e4')
  $$,
  'the deal team hides an entry for one room'
);

select tests.login_as_service_role();

select lives_ok(
  $$
    insert into public.lender_faq_file (id, entry_id, deal_id, name, storage_path, source_dr_document_id)
    values
      ('1f000000-0000-0000-0000-0000000001f1', '1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1',
        'terms.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/u1-terms.pdf', null),
      ('1f000000-0000-0000-0000-0000000001f2', '1f000000-0000-0000-0000-0000000000e2', '1f000000-0000-0000-0000-0000000000d1',
        'draft.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/u2-draft.pdf', null),
      ('1f000000-0000-0000-0000-0000000001f3', '1f000000-0000-0000-0000-0000000000e3', '1f000000-0000-0000-0000-0000000000d1',
        'gone.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/u3-gone.pdf', null),
      ('1f000000-0000-0000-0000-0000000001f4', '1f000000-0000-0000-0000-0000000000e4', '1f000000-0000-0000-0000-0000000000d1',
        'prepay.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/u4-prepay.pdf', null)
  $$,
  'server code attaches files to entries'
);

select throws_ok(
  $$
    insert into public.lender_faq_file (entry_id, deal_id, name, storage_path)
    values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1',
      'theirs.pdf', 'deal/1f000000-0000-0000-0000-0000000000d2/u-theirs.pdf')
  $$,
  '23514', null, 'an FAQ file cannot point at another deal''s storage'
);

select throws_ok(
  $$
    insert into public.lender_faq_file (entry_id, deal_id, name, storage_path)
    values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1',
      'escape.pdf', 'deal/1f000000-0000-0000-0000-0000000000d1/../1f000000-0000-0000-0000-0000000000d2/x.pdf')
  $$,
  '23514', null, 'an FAQ file path cannot climb out of its deal'
);

select tests.login_as('lf_owner');

select lives_ok(
  $$ insert into public.lender_faq_source (entry_id, ask_id) values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-00000000a5a0') $$,
  'the deal team links an entry to the ask it came from'
);

select throws_ok(
  $$ insert into public.lender_faq_source (entry_id, ask_id) values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-00000000a5e0') $$,
  '42501', null, 'an entry cannot link an ask from another deal'
);

select throws_ok(
  $$ update public.lender_faq_entry set status = 'draft' where id = '1f000000-0000-0000-0000-0000000000e3' $$,
  '23514', null, 'a published entry never goes back to draft'
);

select throws_ok(
  $$ update public.lender_faq_entry set status = 'unpublished' where id = '1f000000-0000-0000-0000-0000000000e2' $$,
  '23514', null, 'a draft cannot be unpublished'
);

select throws_ok(
  $$
    insert into public.lender_faq_entry (account_id, deal_id, question, answer)
    values (tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', repeat('q', 5001), 'a')
  $$,
  '23514', null, 'a question is at most 5,000 characters'
);

-- Stale saves: the save names the version it was editing.
select lives_ok(
  $$ update public.lender_faq_entry set answer = 'Minimum 1.25x.', version = 1 where id = '1f000000-0000-0000-0000-0000000000e1' $$,
  'a save naming the current version goes through'
);

select throws_ok(
  $$ update public.lender_faq_entry set answer = 'Minimum 1.3x.', version = 1 where id = '1f000000-0000-0000-0000-0000000000e1' $$,
  '40001', null, 'a second save naming the old version is refused'
);

select lives_ok(
  $$ update public.lender_faq_entry set pinned = false, version = 1 where id = '1f000000-0000-0000-0000-0000000000e1' $$,
  'pinning does not need the current version'
);

select is(
  (select version from public.lender_faq_entry where id = '1f000000-0000-0000-0000-0000000000e1'),
  2,
  'only the content save moved the version'
);

select is(
  (select answer from public.lender_faq_entry where id = '1f000000-0000-0000-0000-0000000000e1'),
  'Minimum 1.25x.',
  'the refused save left the answer alone'
);

select ok(
  (select first_published_at is not null from public.lender_faq_entry where id = '1f000000-0000-0000-0000-0000000000e3'),
  'an unpublished entry keeps when it was first published'
);

select is(
  (select first_published_at from public.lender_faq_entry where id = '1f000000-0000-0000-0000-0000000000e2'),
  null,
  'a draft has never been published'
);

-- Room D is made after the entries were published.
reset role;

insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('1f000000-0000-0000-0000-0000000000d0', tests.account_id('lf-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Lender D', '1f000000-0000-0000-0000-00000000f00d');
insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('1f000000-0000-0000-0000-0000000000d0', tests.get_uid('lf_lender_d'), 'lf_lender_d@tuckin.test', tests.get_uid('lf_owner'));

select throws_ok(
  $$
    insert into public.lender_faq_hidden (room_id, deal_id, entry_id)
    values ('1f000000-0000-0000-0000-0000000000e0', '1f000000-0000-0000-0000-0000000000d2', '1f000000-0000-0000-0000-0000000000e1')
  $$,
  '23503', null, 'a hidden row cannot pair a room with another deal''s entry'
);

select throws_ok(
  $$
    insert into public.lender_room_activity (room_id, account_id, user_id, side, action)
    values ('1f000000-0000-0000-0000-0000000000a0', tests.account_id('lf-acct'), tests.get_uid('lf_lender_a'), 'lender', 'faq_entry_opened')
  $$,
  '23514', null, 'an entry view names its entry'
);

select throws_ok(
  $$
    insert into public.lender_room_activity (room_id, account_id, user_id, side, action, faq_entry_id)
    values ('1f000000-0000-0000-0000-0000000000a0', tests.account_id('lf-acct'), tests.get_uid('lf_lender_a'), 'lender',
      'faq_file_downloaded', '1f000000-0000-0000-0000-0000000000e1')
  $$,
  '23514', null, 'a file download names its file'
);

select lives_ok(
  $$
    insert into public.lender_room_activity (room_id, account_id, user_id, side, action, faq_entry_id, faq_file_id)
    values ('1f000000-0000-0000-0000-0000000000a0', tests.account_id('lf-acct'), tests.get_uid('lf_lender_a'), 'lender',
      'faq_file_downloaded', '1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000001f1')
  $$,
  'a file download with its entry and file is recorded'
);

-- What each lender sees.
select tests.login_as('lf_lender_a');

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000a0', null) $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e5'::uuid), ('1f000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'room A sees published entries, pinned first, without drafts, unpublished, or its hidden entry'
);

select is_empty(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000b0', null) $$,
  'a lender gets nothing for a room they are not in'
);

select is_empty(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000e0', null) $$,
  'a lender gets nothing for another deal''s room'
);

select is(
  (select files from public.lender_room_faq('1f000000-0000-0000-0000-0000000000a0', null)
   where id = '1f000000-0000-0000-0000-0000000000e1'),
  '[{"id": "1f000000-0000-0000-0000-0000000001f1", "name": "terms.pdf"}]'::jsonb,
  'an entry lists its files by id and name only'
);

select ok(
  public.lender_room_shows_faq_file('1f000000-0000-0000-0000-0000000000a0', '1f000000-0000-0000-0000-0000000001f1'),
  'a published entry''s file is shown'
);

select ok(
  not public.lender_room_shows_faq_file('1f000000-0000-0000-0000-0000000000a0', '1f000000-0000-0000-0000-0000000001f4'),
  'a hidden entry''s file is not shown'
);

select ok(
  not public.lender_room_shows_faq_file('1f000000-0000-0000-0000-0000000000a0', '1f000000-0000-0000-0000-0000000001f2'),
  'a draft''s file is not shown'
);

select ok(
  not public.lender_room_shows_faq_file('1f000000-0000-0000-0000-0000000000a0', '1f000000-0000-0000-0000-0000000001f3'),
  'an unpublished entry''s file is not shown'
);

select is_empty($$ select * from public.lender_faq_entry $$, 'lenders read no FAQ entry rows');
select is_empty($$ select * from public.lender_faq_file $$, 'lenders read no FAQ file rows');
select is_empty($$ select * from public.lender_faq_hidden $$, 'lenders read no hidden rows');
select is_empty($$ select * from public.lender_faq_source $$, 'lenders never learn which ask an entry came from');

select tests.login_as('lf_lender_b');

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000b0', null) $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e5'::uuid), ('1f000000-0000-0000-0000-0000000000e1'::uuid), ('1f000000-0000-0000-0000-0000000000e4'::uuid) $$,
  'room B sees the entry hidden only from room A'
);

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000b0', 'prepayment') $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e4'::uuid) $$,
  'searching finds the matching entry by word stem'
);

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000b0', 'covenants') $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'searching matches the question as well as the answer'
);

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000b0', 'What is the prepayment penalty if we break the covenant?') $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e4'::uuid), ('1f000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'searching finds entries sharing any word, most shared words first'
);

select tests.login_as('lf_lender_c');

select is_empty(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000c0', null) $$,
  'a closed room shows no FAQ'
);

select ok(
  not public.lender_room_shows_faq_file('1f000000-0000-0000-0000-0000000000c0', '1f000000-0000-0000-0000-0000000001f1'),
  'a closed room shows no FAQ file'
);

select tests.login_as('lf_lender_d');

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000d0', null) $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e5'::uuid), ('1f000000-0000-0000-0000-0000000000e1'::uuid), ('1f000000-0000-0000-0000-0000000000e4'::uuid) $$,
  'a room made later sees every published entry'
);

-- The deal teams.
select tests.login_as('lf_owner');

select results_eq(
  $$ select id from public.lender_deal_faq_search('1f000000-0000-0000-0000-0000000000d1', 'prepayment penalty withdrawn draft') $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e4'::uuid), ('1f000000-0000-0000-0000-0000000000e2'::uuid), ('1f000000-0000-0000-0000-0000000000e3'::uuid) $$,
  'the deal team searches every entry of its deal, any status or room, most shared words first'
);

select is_empty(
  $$ select id from public.lender_deal_faq_search('1f000000-0000-0000-0000-0000000000d1', 'Who is the buyer?') $$,
  'a deal search finds nothing when no word is shared'
);

select results_eq(
  $$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000a0', null) $$,
  $$ values ('1f000000-0000-0000-0000-0000000000e5'::uuid), ('1f000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'the deal team sees a room''s FAQ as its lenders do'
);

select tests.login_as('lf_owner_2');

select is_empty($$ select id from public.lender_faq_entry where deal_id = '1f000000-0000-0000-0000-0000000000d1' $$,
  'another team reads none of this deal''s entries');
select is_empty($$ select id from public.lender_room_faq('1f000000-0000-0000-0000-0000000000a0', null) $$,
  'another team gets nothing for this deal''s rooms');

select throws_ok(
  $$
    insert into public.lender_faq_entry (account_id, deal_id, question, answer)
    values (tests.account_id('lf-acct-2'), '1f000000-0000-0000-0000-0000000000d1', 'q', 'a')
  $$,
  '42501', null, 'another team cannot write an entry on this deal'
);

select is_empty(
  $$ select id from public.lender_deal_faq_search('1f000000-0000-0000-0000-0000000000d1', 'prepayment') $$,
  'another team finds nothing searching this deal'
);

select tests.login_as('lf_lender_b');

select is_empty(
  $$ select id from public.lender_deal_faq_search('1f000000-0000-0000-0000-0000000000d1', 'prepayment') $$,
  'a lender cannot search the deal team FAQ'
);

-- Server code without a session.
select tests.login_as_service_role();

select set_eq(
  $$ select user_id from public.lender_faq_recipients('1f000000-0000-0000-0000-0000000000e4') $$,
  array[tests.get_uid('lf_lender_b'), tests.get_uid('lf_lender_d')],
  'recipients skip the room the entry is hidden from and closed rooms'
);

select is_empty(
  $$ select user_id from public.lender_faq_recipients('1f000000-0000-0000-0000-0000000000e2') $$,
  'a draft has no recipients'
);

select set_eq(
  $$
    select entry_id from public.lender_visible_faq_entries(tests.get_uid('lf_lender_a'), array[
      '1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000e2',
      '1f000000-0000-0000-0000-0000000000e3', '1f000000-0000-0000-0000-0000000000e4']::uuid[])
  $$,
  array['1f000000-0000-0000-0000-0000000000e1'::uuid],
  'at send time a person is told only of entries they can still see'
);

-- The FAQ upload ledger: server code records each issued key; the deal team
-- may read its own rows; nobody signed in writes it.
select lives_ok(
  $$
    insert into public.lender_faq_upload (id, entry_id, deal_id, name, storage_path, uploaded_by)
    values ('1f000000-0000-0000-0000-00000000ab01', '1f000000-0000-0000-0000-0000000000e1',
      '1f000000-0000-0000-0000-0000000000d1', 'rent roll.pdf',
      'deal/1f000000-0000-0000-0000-0000000000d1/faq-upload/1f000000-0000-0000-0000-00000000ab01-rent_roll.pdf',
      tests.get_uid('lf_owner'))
  $$,
  'server code records an issued FAQ upload key'
);

select throws_ok(
  $$
    insert into public.lender_faq_upload (entry_id, deal_id, name, storage_path, uploaded_by)
    values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1', 'x.pdf',
      'deal/1f000000-0000-0000-0000-0000000000d2/faq-upload/x.pdf', tests.get_uid('lf_owner'))
  $$,
  '23514', null, 'an upload key outside the entry''s own deal is refused'
);

select tests.login_as('lf_owner');

select results_eq(
  $$ select name from public.lender_faq_upload $$,
  array['rent roll.pdf'],
  'the deal team reads its FAQ uploads'
);

select throws_ok(
  $$
    insert into public.lender_faq_upload (entry_id, deal_id, name, storage_path, uploaded_by)
    values ('1f000000-0000-0000-0000-0000000000e1', '1f000000-0000-0000-0000-0000000000d1', 'y.pdf',
      'deal/1f000000-0000-0000-0000-0000000000d1/faq-upload/y.pdf', tests.get_uid('lf_owner'))
  $$,
  '42501', null, 'the deal team cannot write the upload ledger directly'
);

select tests.login_as('lf_owner_2');

select is_empty(
  $$ select 1 from public.lender_faq_upload $$,
  'another team reads none of this deal''s FAQ uploads'
);

select tests.login_as('lf_lender_a');

select is_empty(
  $$ select 1 from public.lender_faq_upload $$,
  'a lender reads no FAQ uploads'
);

reset role;

select * from finish();
rollback;
