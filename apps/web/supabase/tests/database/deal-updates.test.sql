begin;
select no_plan();

select tests.create_user('du_owner');
select tests.create_user('du_admin');
select tests.create_user('du_lead');
select tests.create_user('du_member');
select tests.create_user('du_analyst');

select tests.login_as_service_role();
select public.create_team_account('Updates Co', tests.get_uid('du_owner'), 'updates-co');
insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('updates-co'), tests.get_uid('du_admin'), 'admin'),
  (tests.account_id('updates-co'), tests.get_uid('du_lead'), 'deal_lead'),
  (tests.account_id('updates-co'), tests.get_uid('du_member'), 'viewer'),
  (tests.account_id('updates-co'), tests.get_uid('du_analyst'), 'analyst');

select is(
  (select array_agg(role::text order by role) from public.role_permissions where permission::text = 'deal_updates.approve'),
  array['admin', 'deal_lead', 'owner'],
  'only owner, admin and deal_lead hold deal_updates.approve by default'
);

select results_eq(
  $$ select u, public.has_permission(tests.get_uid(u), tests.account_id('updates-co'), 'deal_updates.approve')
     from unnest(array['du_owner', 'du_admin', 'du_lead', 'du_member', 'du_analyst']) as u $$,
  $$ values ('du_owner', true), ('du_admin', true), ('du_lead', true), ('du_member', false), ('du_analyst', false) $$,
  'owner, admin and deal_lead members may approve deal updates; member and analyst may not'
);

select tests.create_user('du_outsider');

select tests.login_as_service_role();
select public.create_team_account('Other Updates', tests.get_uid('du_outsider'), 'other-updates');
select public.append_deal_event('d0000000-0000-0000-0000-0000000000d1', 'deal',
  'd0000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('updates-co'), 'owner_user_id', tests.get_uid('du_owner'),
    'description', 'Update deal'), null, 'service');

insert into public.contact (id, account_id, name, email)
values
  ('d0000000-0000-0000-0000-0000000000c1', tests.account_id('updates-co'), 'Pat Lender', 'pat@lender.test'),
  ('d0000000-0000-0000-0000-0000000000c2', tests.account_id('other-updates'), 'Other Pat', 'other@lender.test');

insert into public.deal_update (id, account_id, deal_id, author_id, subject, body, picks)
select ('d0000000-0000-0000-0000-0000000000a' || n)::uuid, tests.account_id('updates-co'),
  'd0000000-0000-0000-0000-0000000000d1', tests.get_uid('du_lead'), subject, 'Body.', '{"groups": ["lenders"]}'
from (values (1, 'Closing moves'), (2, 'Draft to drop'), (3, 'Pending to drop'), (4, 'Held by the lock'),
  (5, 'Author demoted'), (6, 'Foreign contact')) as seed (n, subject);

select tests.login_as('du_lead');

select lives_ok(
  $$ select public.create_deal_update('d0000000-0000-0000-0000-0000000000d1', 'Fresh', 'Fresh body.',
       '{"groups": ["team"], "people": [{"contact_id": "d0000000-0000-0000-0000-0000000000c1"}]}') $$,
  'a deals.manage member creates an update'
);
select results_eq(
  $$ select status::text, author_id, account_id, picks, version from public.deal_update where subject = 'Fresh' $$,
  $$ values ('draft', tests.get_uid('du_lead'), tests.account_id('updates-co'),
       '{"groups": ["team"], "people": [{"contact_id": "d0000000-0000-0000-0000-0000000000c1"}]}'::jsonb, 1) $$,
  'a created update is the author''s draft with the picks as given'
);

select throws_ok(
  $$ update public.deal_update set status = 'approved' where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'the team cannot write an update directly'
);

select lives_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a2', 'Draft v2', 'Body v2.',
       '{"groups": [], "people": [{"contact_id": "d0000000-0000-0000-0000-0000000000c1"}]}') $$,
  'the author edits a draft'
);
select results_eq(
  $$ select status::text, subject, picks from public.deal_update where id = 'd0000000-0000-0000-0000-0000000000a2' $$,
  $$ values ('draft', 'Draft v2', '{"groups": [], "people": [{"contact_id": "d0000000-0000-0000-0000-0000000000c1"}]}'::jsonb) $$,
  'an edited draft stays a draft'
);

select lives_ok(
  $$ select public.submit_deal_update('d0000000-0000-0000-0000-0000000000a1') $$,
  'the author submits a draft'
);
select results_eq(
  $$ select status::text, version, submitted_at is not null from public.deal_update
     where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('pending', 1, true) $$,
  'a submitted update is pending at version 1'
);
select throws_ok(
  $$ select public.submit_deal_update('d0000000-0000-0000-0000-0000000000a1') $$,
  'only a draft can be submitted',
  'a pending update cannot be submitted again'
);

select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 1, 'approved', null) $$,
  '42501', 'the author cannot decide their own update',
  'the author cannot approve their own update'
);

select tests.login_as('du_member');
select throws_ok(
  $$ select public.create_deal_update('d0000000-0000-0000-0000-0000000000d1', 'No', 'No.', '{}') $$,
  '42501', 'not allowed to manage this deal',
  'a member without deals.work cannot create an update'
);
select results_eq(
  $$ select id from public.deal_update order by id $$,
  $$ values ('d0000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'teammates read submitted updates but not another author''s drafts'
);
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 1, 'approved', null) $$,
  '42501', 'not allowed to approve deal updates',
  'a member without deal_updates.approve cannot approve'
);
select throws_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a1', 'Hijack', 'Hijack', '{}') $$,
  '42501', 'not allowed to change this update',
  'only the author edits an update'
);
select throws_ok(
  $$ select public.submit_deal_update('d0000000-0000-0000-0000-0000000000a2') $$,
  '42501', 'not allowed to change this update',
  'only the author submits an update'
);

select tests.login_as('du_lead');
select lives_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a1', 'Closing moves to December',
       'We cannot close in November. December works.', '{"groups": ["lenders", "sellers"]}') $$,
  'the author edits a pending update'
);
select results_eq(
  $$ select status::text, version, subject, picks from public.deal_update
     where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('pending', 2, 'Closing moves to December', '{"groups": ["lenders", "sellers"]}'::jsonb) $$,
  'an edit of the text or picks bumps the version and stays pending'
);

select tests.login_as('du_admin');
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 1, 'approved', null) $$,
  'this update changed since it was opened',
  'an approval of a stale version is refused'
);
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 2, 'rejected', null) $$,
  '23514', null,
  'a rejection needs a note'
);
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 2, 'rejected', '   ') $$,
  '23514', null,
  'a blank rejection note is refused'
);
select lives_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 2, 'rejected', 'Say which date') $$,
  'an approver rejects with a note'
);
select results_eq(
  $$ select status::text, decided_by, decision_note, decided_at is not null from public.deal_update
     where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('rejected', tests.get_uid('du_admin'), 'Say which date', true) $$,
  'a rejection records who decided and why'
);
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 2, 'approved', null) $$,
  'only a pending update can be decided',
  'a rejected update cannot be approved until it is resubmitted'
);

select tests.login_as('du_lead');
select lives_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a1', 'Closing moves to December 12',
       'We cannot close in November. December 12 works.', '{"groups": ["lenders", "sellers"]}') $$,
  'the author revises a rejected update'
);
select results_eq(
  $$ select status::text, version from public.deal_update where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('pending', 3) $$,
  'a revised rejection is pending again at a new version'
);

select tests.login_as('du_owner');
select throws_ok(
  $$ select public.record_deal_update_recipients('d0000000-0000-0000-0000-0000000000a1',
       '[{"email": "anyone@else.test", "entries": []}]') $$,
  '42501', null,
  'an approver cannot write recipients themselves'
);
select lives_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a1', 3, 'approved', null) $$,
  'another approver approves the current version'
);

select tests.login_as_service_role();
select lives_ok(
  format($$ select public.record_deal_update_recipients('d0000000-0000-0000-0000-0000000000a1', %L) $$,
    jsonb_build_array(
      jsonb_build_object('user_id', tests.get_uid('du_member'), 'email', 'du_member@tuckin.test', 'name', 'Member',
        'entries', jsonb_build_array(jsonb_build_object('source', 'team', 'side', 'buyer', 'role', 'principal',
          'is_main', false))),
      jsonb_build_object('contact_id', 'd0000000-0000-0000-0000-0000000000c1', 'email', 'pat@lender.test',
        'name', 'Pat Lender',
        'entries', jsonb_build_array(jsonb_build_object('source', 'contact',
          'contact_id', 'd0000000-0000-0000-0000-0000000000c1', 'side', 'lender', 'role', 'other', 'is_main', true)))
    )),
  'the server records the recipients it resolved for the approval'
);
select lives_ok(
  $$ select public.record_deal_update_recipients('d0000000-0000-0000-0000-0000000000a1',
       '[{"email": "late@join.test", "name": "Late", "entries": []}]') $$,
  'recording again leaves the captured recipients alone'
);
select throws_ok(
  $$ insert into public.deal_update_recipient (update_id, email, entries)
     values ('d0000000-0000-0000-0000-0000000000a1', 'pat@lender.test', '{}') $$,
  '23505', null,
  'an update holds one row per email'
);
select throws_ok(
  $$ select public.record_deal_update_recipients('d0000000-0000-0000-0000-0000000000a4',
       '[{"email": "early@bird.test", "entries": []}]') $$,
  'only an approved update takes recipients',
  'recipients are recorded only for an approved update'
);
select results_eq(
  $$ select status::text, decided_by, decided_at is not null from public.deal_update
     where id = 'd0000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('approved', tests.get_uid('du_owner'), true) $$,
  'an approval records who approved'
);

select tests.login_as('du_analyst');
select results_eq(
  $$ select user_id, contact_id, email, name, (entries[1]).source, (entries[1]).is_main, sent_at is null and failed_at is null
     from public.deal_update_recipient
     where update_id = 'd0000000-0000-0000-0000-0000000000a1' order by email $$,
  $$ values
       (tests.get_uid('du_member'), null::uuid, 'du_member@tuckin.test', 'Member', 'team', false, true),
       (null::uuid, 'd0000000-0000-0000-0000-0000000000c1'::uuid, 'pat@lender.test', 'Pat Lender', 'contact', true, true) $$,
  'the whole team reads the recipients an approval captured, one row per person, not yet sent'
);
select throws_ok(
  $$ update public.deal_update_recipient set sent_at = now() $$,
  '42501', null,
  'the team cannot stamp a delivery'
);

reset role;
delete from public.contact where id = 'd0000000-0000-0000-0000-0000000000c1';

select tests.login_as('du_analyst');
select results_eq(
  $$ select user_id, contact_id, email, name from public.deal_update_recipient
     where update_id = 'd0000000-0000-0000-0000-0000000000a1' and email = 'pat@lender.test' $$,
  $$ values (null::uuid, null::uuid, 'pat@lender.test', 'Pat Lender') $$,
  'a deleted contact stays in the delivery history by name and email'
);

select tests.login_as('du_lead');
select throws_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a1', 'Late', 'Late', '{}') $$,
  'only a draft, pending or rejected update can be edited',
  'an approved update cannot be edited'
);
select throws_ok(
  $$ select public.withdraw_deal_update('d0000000-0000-0000-0000-0000000000a1') $$,
  'only a draft or pending update can be withdrawn',
  'an approved update cannot be withdrawn'
);

select lives_ok(
  $$ select public.withdraw_deal_update('d0000000-0000-0000-0000-0000000000a2') $$,
  'the author withdraws a draft'
);
select lives_ok(
  $$ select public.submit_deal_update('d0000000-0000-0000-0000-0000000000a3') $$,
  'the author submits another update'
);
select lives_ok(
  $$ select public.withdraw_deal_update('d0000000-0000-0000-0000-0000000000a3') $$,
  'the author withdraws a pending update'
);
select results_eq(
  $$ select status::text from public.deal_update
     where id in ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000a3') $$,
  $$ values ('withdrawn'), ('withdrawn') $$,
  'withdrawn drafts and pending updates are withdrawn'
);
select lives_ok(
  $$ select public.submit_deal_update(id) from public.deal_update
     where id in ('d0000000-0000-0000-0000-0000000000a4', 'd0000000-0000-0000-0000-0000000000a5',
       'd0000000-0000-0000-0000-0000000000a6') $$,
  'the author submits the remaining updates'
);

select tests.login_as('du_admin');
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a3', 1, 'approved', null) $$,
  'only a pending update can be decided',
  'a withdrawn update cannot be approved'
);
select lives_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a6', 1, 'approved', null) $$,
  'an approver approves an update'
);
select tests.login_as_service_role();
select throws_ok(
  $$ select public.record_deal_update_recipients('d0000000-0000-0000-0000-0000000000a6',
       '[{"contact_id": "d0000000-0000-0000-0000-0000000000c2", "email": "other@lender.test", "name": "Other Pat",
          "entries": []}]') $$,
  '42501', 'rows cannot link across teams',
  'an approval cannot send to another team''s contact'
);

reset role;
update public.accounts_memberships set account_role = 'viewer'
where account_id = tests.account_id('updates-co') and user_id = tests.get_uid('du_lead');

select tests.login_as('du_lead');
select throws_ok(
  $$ select public.edit_deal_update('d0000000-0000-0000-0000-0000000000a5', 'Still mine', 'Still mine', '{}') $$,
  '42501', 'not allowed to change this update',
  'an author who lost deals.work cannot edit their pending update'
);
select throws_ok(
  $$ select public.withdraw_deal_update('d0000000-0000-0000-0000-0000000000a5') $$,
  '42501', 'not allowed to change this update',
  'an author who lost deals.work cannot withdraw their pending update'
);

select tests.login_as('du_admin');
select lives_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a5', 1, 'approved', null) $$,
  'an approver still decides an update whose author lost deals.work'
);

select tests.login_as('du_outsider');
select is_empty(
  $$ select id from public.deal_update $$,
  'someone outside the team reads no updates'
);
select is_empty(
  $$ select id from public.deal_update_recipient $$,
  'someone outside the team reads no recipients'
);

select tests.login_as('du_owner');
select throws_ok(
  $$ select public.append_deal_event('d0000000-0000-0000-0000-0000000000d1', 'deal_update',
       'd0000000-0000-0000-0000-0000000000a1', 'deal_update.sent', '{"subject": "Forged"}') $$,
  '42501', 'only delivery records deal update history',
  'a team member cannot write deal update history, even with deals.manage'
);

select tests.login_as_service_role();
select lives_ok(
  $$ select public.append_deal_event('d0000000-0000-0000-0000-0000000000d1', 'deal_update',
       'd0000000-0000-0000-0000-0000000000a1', 'deal_update.sent', '{"subject": "Sent"}', 0, 'service') $$,
  'delivery records deal update history as the service'
);

select tests.create_user('du_lender');
select tests.create_user('du_rival_lender');
select tests.create_user('du_seller');
select tests.create_user('du_seller_law');
select tests.create_user('du_buyer_law');

select tests.login_as('du_owner');
select public.ensure_seller_room('d0000000-0000-0000-0000-0000000000d1');

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('d0000000-0000-0000-0000-0000000000f1', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', null, 'Bank room'),
  ('d0000000-0000-0000-0000-0000000000f2', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', null, 'Rival bank room');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('d0000000-0000-0000-0000-0000000000e1', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', 'Bank', 'd0000000-0000-0000-0000-0000000000f1'),
  ('d0000000-0000-0000-0000-0000000000e2', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', 'Rival bank', 'd0000000-0000-0000-0000-0000000000f2');
insert into public.lender_room_member (room_id, user_id, email)
values
  ('d0000000-0000-0000-0000-0000000000e1', tests.get_uid('du_lender'), 'du_lender@tuckin.test'),
  ('d0000000-0000-0000-0000-0000000000e2', tests.get_uid('du_rival_lender'), 'du_rival_lender@tuckin.test');
insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('du_seller'), 'du_seller@tuckin.test', 'Seller'
from public.seller_room r where r.deal_id = 'd0000000-0000-0000-0000-0000000000d1';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('du_seller_law'), 'du_seller_law@tuckin.test', 'Seller Law'),
  (tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1', 'buyer', tests.get_uid('du_buyer_law'), 'du_buyer_law@tuckin.test', 'Buyer Law');

insert into public.deal_update (id, account_id, deal_id, author_id, subject, body, picks, status, submitted_at,
  decided_by, decided_at)
values
  ('d0000000-0000-0000-0000-0000000000b1', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1',
    tests.get_uid('du_lead'), 'Closing slips', 'We now close on December 12.', '{}', 'approved',
    '2026-10-01 09:00Z', tests.get_uid('du_admin'), '2026-10-02 10:00Z'),
  ('d0000000-0000-0000-0000-0000000000b2', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1',
    tests.get_uid('du_lead'), 'Appraisal in', 'The appraisal came back at value.', '{}', 'approved',
    '2026-10-05 09:00Z', tests.get_uid('du_admin'), '2026-10-06 10:00Z'),
  ('d0000000-0000-0000-0000-0000000000b3', tests.account_id('updates-co'), 'd0000000-0000-0000-0000-0000000000d1',
    tests.get_uid('du_lead'), 'Counsel only', 'Draft APA is in your portal.', '{}', 'approved',
    '2026-10-07 09:00Z', tests.get_uid('du_admin'), '2026-10-08 10:00Z');
insert into public.deal_update_recipient (update_id, user_id, email, name, entries)
select update_id::uuid, tests.get_uid(person), person || '@tuckin.test', person, '{}'
from (values
  ('d0000000-0000-0000-0000-0000000000b1', 'du_lender'),
  ('d0000000-0000-0000-0000-0000000000b1', 'du_seller'),
  ('d0000000-0000-0000-0000-0000000000b1', 'du_seller_law'),
  ('d0000000-0000-0000-0000-0000000000b2', 'du_lender'),
  ('d0000000-0000-0000-0000-0000000000b3', 'du_buyer_law')
) as sent (update_id, person);

create temp table du_seller_room as
select id from public.seller_room where deal_id = 'd0000000-0000-0000-0000-0000000000d1';
grant select on du_seller_room to authenticated;

select tests.login_as('du_lender');
select results_eq(
  $$ select * from public.lender_room_updates('d0000000-0000-0000-0000-0000000000e1') $$,
  $$ values
       ('Appraisal in', 'The appraisal came back at value.', '2026-10-06 10:00Z'::timestamptz),
       ('Closing slips', 'We now close on December 12.', '2026-10-02 10:00Z'::timestamptz) $$,
  'a lender reads the updates sent to them in their room, newest first, as subject, body and sent date only'
);
select is_empty(
  $$ select 1 from public.lender_room_updates('d0000000-0000-0000-0000-0000000000e2') $$,
  'a lender reads no updates through a room they are not in'
);

select tests.login_as('du_rival_lender');
select is_empty(
  $$ select 1 from public.lender_room_updates('d0000000-0000-0000-0000-0000000000e2') $$,
  'a lender who was not sent an update does not see it'
);

select tests.login_as('du_seller');
select results_eq(
  $$ select * from public.seller_room_updates((select id from du_seller_room)) $$,
  $$ values ('Closing slips', 'We now close on December 12.', '2026-10-02 10:00Z'::timestamptz) $$,
  'a seller reads the updates sent to them in the seller room'
);

select tests.login_as('du_seller_law');
select results_eq(
  $$ select * from public.seller_room_updates((select id from du_seller_room)) $$,
  $$ values ('Closing slips', 'We now close on December 12.', '2026-10-02 10:00Z'::timestamptz) $$,
  'seller''s counsel read the updates sent to them in the seller room'
);
select results_eq(
  $$ select * from public.counsel_updates('d0000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Closing slips', 'We now close on December 12.', '2026-10-02 10:00Z'::timestamptz) $$,
  'seller''s counsel read the updates sent to them in the counsel portal'
);

select tests.login_as('du_buyer_law');
select results_eq(
  $$ select * from public.counsel_updates('d0000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('Counsel only', 'Draft APA is in your portal.', '2026-10-08 10:00Z'::timestamptz) $$,
  'buyer''s counsel read only the updates sent to them in the counsel portal'
);
select is_empty(
  $$ select 1 from public.seller_room_updates((select id from du_seller_room)) $$,
  'buyer''s counsel read no updates through the seller room'
);

select tests.login_as('du_member');
select is_empty(
  $$ select 1 from public.counsel_updates('d0000000-0000-0000-0000-0000000000d1') $$,
  'a team recipient who is not counsel reads no updates through the counsel portal'
);

reset role;
update public.lender_room set closed_at = now() where id = 'd0000000-0000-0000-0000-0000000000e1';
update public.seller_room set closed_at = now() where deal_id = 'd0000000-0000-0000-0000-0000000000d1';
delete from public.deal_counsel where user_id = tests.get_uid('du_buyer_law');

select tests.login_as('du_lender');
select is_empty(
  $$ select 1 from public.lender_room_updates('d0000000-0000-0000-0000-0000000000e1') $$,
  'a closed lender room shows no updates'
);
select tests.login_as('du_seller');
select isnt_empty(
  $$ select 1 from public.seller_room_updates((select id from du_seller_room)) $$,
  'a closed seller room still shows the seller its updates'
);
select tests.login_as('du_buyer_law');
select is_empty(
  $$ select 1 from public.counsel_updates('d0000000-0000-0000-0000-0000000000d1') $$,
  'counsel who lost access read no updates'
);

reset role;
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('updates-co');

select tests.login_as('du_admin');
select throws_ok(
  $$ select public.decide_deal_update('d0000000-0000-0000-0000-0000000000a4', 1, 'approved', null) $$,
  '42501', 'team is read-only',
  'a locked team cannot approve a pending update'
);

select * from finish();
rollback;
