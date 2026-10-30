begin;
select no_plan();

-- Team "DP Team" owns deals d1 and d2. dp_owner manages them; dp_member is on
-- the team without deals.manage. "DP Other" is a second team with its own
-- contact. Deal d1 has two lender rooms and a seller room, d2 has one lender
-- room. dp_lender sits in rooms a1 and a3, dp_lender2 in a2. dp_seller is in
-- d1's seller room; dp_buyer_law and dp_seller_law are counsel on d1 and d2.
select tests.create_user('dp_owner');
select tests.create_user('dp_member');
select tests.create_user('dp_leaver');
select tests.create_user('dp_stranger');
select tests.create_user('dp_lender');
select tests.create_user('dp_lender2');
select tests.create_user('dp_seller');
select tests.create_user('dp_buyer_law');
select tests.create_user('dp_seller_law');
select tests.create_user('dp_other_owner');

select tests.login_as_service_role();
select public.create_team_account('DP Team', tests.get_uid('dp_owner'), 'dp-team');
select public.create_team_account('DP Other', tests.get_uid('dp_other_owner'), 'dp-other');
select public.append_deal_event('dd000000-0000-0000-0000-0000000000d1', 'deal',
  'dd000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dp-team'), 'firm_id', tests.create_firm(tests.account_id('dp-team')), 'owner_user_id', tests.get_uid('dp_owner'),
    'description', 'People deal'), null, 'service');
select public.append_deal_event('dd000000-0000-0000-0000-0000000000d2', 'deal',
  'dd000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dp-team'), 'firm_id', tests.create_firm(tests.account_id('dp-team')), 'owner_user_id', tests.get_uid('dp_owner'),
    'description', 'Second people deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values
  (tests.get_uid('dp_member'), tests.account_id('dp-team'), 'member'),
  (tests.get_uid('dp_leaver'), tests.account_id('dp-team'), 'member');

select tests.login_as('dp_owner');
select public.ensure_seller_room('dd000000-0000-0000-0000-0000000000d1');
reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('dp_seller'), 'dp_seller@opendealbook.test', 'Seller'
from public.seller_room r where r.deal_id = 'dd000000-0000-0000-0000-0000000000d1';

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller'), 'dp_seller@opendealbook.test', 'Seller'),
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller_law'), 'dp_seller_law@opendealbook.test', 'Seller Law'),
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'buyer', tests.get_uid('dp_buyer_law'), 'dp_buyer_law@opendealbook.test', 'Buyer Law');

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('dd000000-0000-0000-0000-0000000000f1', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', null, 'Room one'),
  ('dd000000-0000-0000-0000-0000000000f2', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', null, 'Room two'),
  ('dd000000-0000-0000-0000-0000000000f3', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', null, 'Room three');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('dd000000-0000-0000-0000-0000000000a1', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'Bank one', 'dd000000-0000-0000-0000-0000000000f1'),
  ('dd000000-0000-0000-0000-0000000000a2', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'Bank two', 'dd000000-0000-0000-0000-0000000000f2'),
  ('dd000000-0000-0000-0000-0000000000a3', tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'Bank three', 'dd000000-0000-0000-0000-0000000000f3');
insert into public.lender_room_member (room_id, user_id, email)
values
  ('dd000000-0000-0000-0000-0000000000a1', tests.get_uid('dp_lender'), 'dp_lender@opendealbook.test'),
  ('dd000000-0000-0000-0000-0000000000a3', tests.get_uid('dp_lender'), 'dp_lender@opendealbook.test'),
  ('dd000000-0000-0000-0000-0000000000a2', tests.get_uid('dp_lender2'), 'dp_lender2@opendealbook.test');

insert into public.contact (id, account_id, name)
values ('dd000000-0000-0000-0000-0000000000c9', tests.account_id('dp-other'), 'Other team''s lawyer');

-- ---- The address book carries a company ----
select tests.login_as('dp_owner');
select lives_ok(
  $$ insert into public.contact (id, account_id, name, email, phone, company)
     values ('dd000000-0000-0000-0000-0000000000c1', tests.account_id('dp-team'), 'Casey Broker',
       'casey@broker.test', '555-0100', 'Main Street Brokers') $$,
  'a contact is saved with a company'
);
insert into public.contact (id, account_id, name)
values
  ('dd000000-0000-0000-0000-0000000000c2', tests.account_id('dp-team'), 'Pat CPA'),
  ('dd000000-0000-0000-0000-0000000000c3', tests.account_id('dp-team'), 'Sam Seller Lawyer');
select is(
  (select company from public.contact where id = 'dd000000-0000-0000-0000-0000000000c1'),
  'Main Street Brokers',
  'the contact''s company reads back'
);

-- ---- Hand-added people on a deal ----
select lives_ok(
  $$ insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
     values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1',
       'dd000000-0000-0000-0000-0000000000c1', 'seller', 'broker') $$,
  'a deal manager adds a contact to a deal with a side and a role'
);
insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
values
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'dd000000-0000-0000-0000-0000000000c2', 'buyer', 'cpa'),
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'dd000000-0000-0000-0000-0000000000c1', 'buyer', 'broker');
select is(
  (select created_by from public.deal_contact
   where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c1'),
  tests.get_uid('dp_owner'),
  'the deal contact records who added it'
);
select throws_ok(
  $$ insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
     values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1',
       'dd000000-0000-0000-0000-0000000000c1', 'buyer', 'principal') $$,
  '23505',
  null,
  'a contact is on a deal once'
);
select throws_ok(
  $$ insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
     values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1',
       'dd000000-0000-0000-0000-0000000000c9', 'seller', 'attorney') $$,
  '42501',
  'rows cannot link across teams',
  'a deal cannot list another team''s contact'
);
select throws_ok(
  $$ update public.deal_contact set deal_id = 'dd000000-0000-0000-0000-0000000000d2'
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c2' $$,
  '42501',
  'rows cannot move between teams',
  'a deal contact cannot move to another deal'
);

select tests.login_as('dp_member');
select is(
  (select count(*)::int from public.deal_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1'),
  2,
  'every team member sees the deal''s hand-added people'
);
select throws_ok(
  $$ insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
     values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1',
       'dd000000-0000-0000-0000-0000000000c3', 'seller', 'attorney') $$,
  '42501',
  null,
  'a member without deals.manage cannot add people'
);
update public.deal_contact set role = 'other'
where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c2';
delete from public.deal_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1';

select tests.login_as('dp_owner');
select is(
  (select role::text from public.deal_contact
   where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c2'),
  'cpa',
  'a member without deals.manage cannot change a role or remove a person'
);

select tests.login_as('dp_stranger');
select is_empty(
  $$ select 1 from public.deal_contact $$,
  'a stranger sees no deal contacts'
);
select tests.login_as('dp_lender');
select is_empty(
  $$ select 1 from public.deal_contact $$,
  'a lender reads no deal contacts directly'
);

-- ---- Main contacts ----
select tests.login_as('dp_owner');
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'buyer', tests.get_uid('dp_owner')) $$,
  'a deal manager stars a team member as the buyer main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'buyer', 'dd000000-0000-0000-0000-0000000000c2') $$,
  '23505',
  null,
  'a side has one main contact'
);
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'seller', 'dd000000-0000-0000-0000-0000000000c1') $$,
  'a seller-side hand-added contact can be the seller main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'seller', 'dd000000-0000-0000-0000-0000000000c3') $$,
  '23503',
  null,
  'a main contact is someone on the deal'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'buyer', tests.get_uid('dp_owner'),
       'dd000000-0000-0000-0000-0000000000c1') $$,
  '23514',
  null,
  'a main contact is a user or a contact, not both'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side)
     values ('dd000000-0000-0000-0000-0000000000d2', 'seller') $$,
  '23514',
  null,
  'a main contact names someone'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'lender', tests.get_uid('dp_lender')) $$,
  '23514',
  null,
  'a lender main contact belongs to a lender room'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'buyer', 'dd000000-0000-0000-0000-0000000000a3',
       tests.get_uid('dp_owner')) $$,
  '23514',
  null,
  'only the lender side is per lender room'
);
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'lender', 'dd000000-0000-0000-0000-0000000000a1',
       tests.get_uid('dp_lender')) $$,
  'a member of a lender room can be that room''s main contact'
);
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'lender', 'dd000000-0000-0000-0000-0000000000a2',
       tests.get_uid('dp_lender2')) $$,
  'each lender room on a deal has its own main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'lender', 'dd000000-0000-0000-0000-0000000000a1',
       tests.get_uid('dp_lender')) $$,
  '23505',
  null,
  'a lender room has one main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
       tests.get_uid('dp_lender')) $$,
  '23503',
  null,
  'a lender main contact belongs to a room on the same deal'
);

-- ---- A main contact belongs to its side ----
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'buyer', tests.get_uid('dp_stranger')) $$,
  '23514',
  'a main contact must be on its side',
  'a stranger cannot be the buyer main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'buyer', tests.get_uid('dp_seller')) $$,
  '23514',
  'a main contact must be on its side',
  'a seller cannot be the buyer main contact'
);
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'buyer', tests.get_uid('dp_buyer_law')) $$,
  'buyer''s counsel can be the buyer main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'seller', 'dd000000-0000-0000-0000-0000000000c1') $$,
  '23503',
  null,
  'a hand-added contact is starred only on its own side'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
       tests.get_uid('dp_lender2')) $$,
  '23514',
  'a main contact must be on its side',
  'a lender from another room cannot be this room''s main contact'
);
insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'dd000000-0000-0000-0000-0000000000c3', 'lender', 'other');
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, contact_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
       'dd000000-0000-0000-0000-0000000000c3') $$,
  '23514',
  null,
  'a hand-added lender person is not a lender room''s main contact'
);
select throws_ok(
  $$ update public.deal_main_contact set user_id = tests.get_uid('dp_owner'), contact_id = null
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  '23514',
  'a main contact must be on its side',
  'a star cannot move to someone off its side'
);
select lives_ok(
  $$ update public.deal_main_contact set user_id = null, contact_id = 'dd000000-0000-0000-0000-0000000000c2'
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer' $$,
  'a deal manager moves the star to someone else on the side'
);
select throws_ok(
  $$ update public.deal_main_contact set deal_id = 'dd000000-0000-0000-0000-0000000000d2'
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer' $$,
  '42501',
  'rows cannot move between teams',
  'a main contact cannot move to another deal'
);

select tests.login_as('dp_member');
select is(
  (select count(*)::int from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1'),
  4,
  'every team member sees the deal''s main contacts'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
       tests.get_uid('dp_lender')) $$,
  '42501',
  null,
  'a member without deals.manage cannot star anyone'
);
delete from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1';

select tests.login_as('dp_stranger');
select is_empty(
  $$ select 1 from public.deal_main_contact $$,
  'a stranger sees no main contacts'
);
select tests.login_as('dp_lender');
select is_empty(
  $$ select 1 from public.deal_main_contact $$,
  'a lender reads no main contacts directly'
);

select tests.login_as('dp_owner');
select is(
  (select count(*)::int from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1'),
  4,
  'a member without deals.manage cannot remove a star'
);

-- ---- The people list ----
reset role;
update public.deal_counsel set phone = '555-0200', company = 'Law LLP'
where user_id = tests.get_uid('dp_buyer_law');
insert into public.lender_person (user_id, name) values (tests.get_uid('dp_lender2'), 'Lender Two');

select tests.login_as('dp_owner');
insert into public.contact (id, account_id, name, email, phone, company)
values
  ('dd000000-0000-0000-0000-0000000000c4', tests.account_id('dp-team'), 'Bea Lawyer Card',
    'DP_Buyer_Law@OpenDealbook.test', '555-0999', 'Old Firm'),
  ('dd000000-0000-0000-0000-0000000000c5', tests.account_id('dp-team'), 'Casey Again', 'Casey@Broker.test', null, null);
insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
values
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'dd000000-0000-0000-0000-0000000000c4', 'buyer', 'attorney'),
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'dd000000-0000-0000-0000-0000000000c5', 'seller', 'cpa');
update public.deal_main_contact set user_id = null, contact_id = 'dd000000-0000-0000-0000-0000000000c4'
where deal_id = 'dd000000-0000-0000-0000-0000000000d2' and side = 'buyer';

select tests.login_as('dp_member');
select results_eq(
  $$ select p.user_id, p.email, e.source, e.contact_id, e.name, e.phone, e.company, e.side::text, e.role,
       e.lender_room_id, e.room_closed, e.is_main
     from public.deal_people('dd000000-0000-0000-0000-0000000000d2') p
     cross join unnest(p.entries) e
     order by p.email, e.source, e.contact_id $$,
  $$ values
     (null::uuid, 'casey@broker.test', 'contact', 'dd000000-0000-0000-0000-0000000000c1'::uuid, 'Casey Broker', '555-0100', 'Main Street Brokers', 'buyer', 'broker', null::uuid, null::boolean, false),
     (null, 'casey@broker.test', 'contact', 'dd000000-0000-0000-0000-0000000000c5', 'Casey Again', null, null, 'seller', 'cpa', null, null, false),
     (tests.get_uid('dp_buyer_law'), 'dp_buyer_law@opendealbook.test', 'contact', 'dd000000-0000-0000-0000-0000000000c4', 'Bea Lawyer Card', '555-0999', 'Old Firm', 'buyer', 'attorney', null, null, true),
     (tests.get_uid('dp_buyer_law'), 'dp_buyer_law@opendealbook.test', 'counsel', null, 'Buyer Law', '555-0200', 'Law LLP', 'buyer', 'attorney', null, null, false),
     (tests.get_uid('dp_leaver'), 'dp_leaver@opendealbook.test', 'team', null, 'dp_leaver', null, 'DP Team', 'buyer', 'principal', null, null, false),
     (tests.get_uid('dp_lender'), 'dp_lender@opendealbook.test', 'lender_room', null, null, null, 'Bank three', 'lender', 'lender', 'dd000000-0000-0000-0000-0000000000a3', false, false),
     (tests.get_uid('dp_member'), 'dp_member@opendealbook.test', 'team', null, 'dp_member', null, 'DP Team', 'buyer', 'principal', null, null, false),
     (tests.get_uid('dp_owner'), 'dp_owner@opendealbook.test', 'team', null, 'dp_owner', null, 'DP Team', 'buyer', 'principal', null, null, false),
     (null, null, 'contact', 'dd000000-0000-0000-0000-0000000000c3', 'Sam Seller Lawyer', null, null, 'lender', 'other', null, null, false) $$,
  'every team member sees each person''s every side and role, with same-email contacts merged into one person and their star kept'
);
select is(
  (select count(*)::int from public.deal_people('dd000000-0000-0000-0000-0000000000d2')),
  7,
  'each person is one row whatever the case of their email'
);

select tests.login_as('dp_owner');
insert into public.contact (id, account_id, email)
values ('dd000000-0000-0000-0000-0000000000c6', tests.account_id('dp-team'), 'nameless@lookup.test');
insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d2', 'dd000000-0000-0000-0000-0000000000c6', 'seller', 'other');

select tests.login_as('dp_member');
select results_eq(
  $$ select p.name, e.name from public.deal_people('dd000000-0000-0000-0000-0000000000d2') p
     cross join unnest(p.entries) e
     where e.contact_id = 'dd000000-0000-0000-0000-0000000000c6' $$,
  $$ values ('nameless@lookup.test', 'nameless@lookup.test') $$,
  'a contact with no name is shown by its email'
);
reset role;
delete from public.deal_contact where contact_id = 'dd000000-0000-0000-0000-0000000000c6';
delete from public.contact where id = 'dd000000-0000-0000-0000-0000000000c6';
select results_eq(
  $$ select user_id, name from public.deal_people('dd000000-0000-0000-0000-0000000000d2') order by email $$,
  $$ values
     (null::uuid, 'Casey Broker'),
     (tests.get_uid('dp_buyer_law'), 'dp_buyer_law'),
     (tests.get_uid('dp_leaver'), 'dp_leaver'),
     (tests.get_uid('dp_lender'), 'dp_lender'),
     (tests.get_uid('dp_member'), 'dp_member'),
     (tests.get_uid('dp_owner'), 'dp_owner'),
     (null, 'Sam Seller Lawyer') $$,
  'a signed-in person is named by their own profile, and a hand-added person by the contact'
);

reset role;
update public.lender_room set expires_at = now() - interval '1 day' where id = 'dd000000-0000-0000-0000-0000000000a3';
select tests.login_as('dp_member');
select is(
  (select e.room_closed from public.deal_people('dd000000-0000-0000-0000-0000000000d2') p
   cross join unnest(p.entries) e where e.source = 'lender_room'),
  true,
  'a lender in an expired room is listed with the room marked closed'
);
reset role;
update public.lender_room set expires_at = now() + interval '60 days' where id = 'dd000000-0000-0000-0000-0000000000a3';

reset role;
update public.lender_room set status = 'declined' where id = 'dd000000-0000-0000-0000-0000000000a1';
update public.lender_room set closed_at = now() where id = 'dd000000-0000-0000-0000-0000000000a2';
update public.seller_room set closed_at = now() where deal_id = 'dd000000-0000-0000-0000-0000000000d1';

select tests.login_as('dp_member');
select results_eq(
  $$ select p.user_id, e.source, e.name, e.company, e.side::text, e.role, e.lender_room_id, e.room_closed, e.is_main
     from public.deal_people('dd000000-0000-0000-0000-0000000000d1') p
     cross join unnest(p.entries) e
     where e.source <> 'team' and e.source <> 'contact'
       and p.user_id in (tests.get_uid('dp_lender'), tests.get_uid('dp_lender2'), tests.get_uid('dp_seller'))
     order by e.lender_room_id, e.source $$,
  $$ values
     (tests.get_uid('dp_lender'), 'lender_room', null, 'Bank one', 'lender', 'lender', 'dd000000-0000-0000-0000-0000000000a1'::uuid, true, true),
     (tests.get_uid('dp_lender2'), 'lender_room', 'Lender Two', 'Bank two', 'lender', 'lender', 'dd000000-0000-0000-0000-0000000000a2'::uuid, true, true),
     (tests.get_uid('dp_seller'), 'counsel', 'Seller', null, 'seller', 'attorney', null, null, false),
     (tests.get_uid('dp_seller'), 'seller_room', 'Seller', null, 'seller', 'seller', null, true, false) $$,
  'people in declined or closed rooms stay listed with their room marked closed'
);
select is(
  (select count(*)::int from public.deal_people('dd000000-0000-0000-0000-0000000000d1')
   where user_id = tests.get_uid('dp_seller')),
  1,
  'a seller who is also seller''s counsel is one person'
);

reset role;
update public.lender_room set status = 'invited', closed_at = null
where id in ('dd000000-0000-0000-0000-0000000000a1', 'dd000000-0000-0000-0000-0000000000a2');
update public.seller_room set closed_at = null where deal_id = 'dd000000-0000-0000-0000-0000000000d1';
update public.deal set archived_at = now() where id = 'dd000000-0000-0000-0000-0000000000d1';

select tests.login_as('dp_member');
select is(
  (select e.room_closed from public.deal_people('dd000000-0000-0000-0000-0000000000d1') p
   cross join unnest(p.entries) e where e.source = 'seller_room'),
  true,
  'a seller on an archived deal is listed with the room marked closed'
);

reset role;
update public.deal set archived_at = null where id = 'dd000000-0000-0000-0000-0000000000d1';

select tests.login_as('dp_stranger');
select is_empty(
  $$ select 1 from public.deal_people('dd000000-0000-0000-0000-0000000000d2') $$,
  'a stranger sees no people list'
);
select tests.login_as('dp_lender');
select is_empty(
  $$ select 1 from public.deal_people('dd000000-0000-0000-0000-0000000000d2') $$,
  'a lender does not see the team''s people list'
);
select tests.login_as('dp_buyer_law');
select is_empty(
  $$ select 1 from public.deal_people('dd000000-0000-0000-0000-0000000000d2') $$,
  'counsel do not see the team''s people list through it'
);

select tests.login_as('dp_owner');
update public.deal_main_contact set user_id = tests.get_uid('dp_buyer_law'), contact_id = null
where deal_id = 'dd000000-0000-0000-0000-0000000000d2' and side = 'buyer';
delete from public.deal_contact
where contact_id in ('dd000000-0000-0000-0000-0000000000c4', 'dd000000-0000-0000-0000-0000000000c5');

-- ---- A main contact who leaves is cleared ----
delete from public.deal_contact
where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c1';
select is_empty(
  $$ select 1 from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  'taking a contact off the deal clears its star'
);

select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller')) $$,
  'a seller room member can be the seller main contact'
);
reset role;
delete from public.deal_counsel
where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and user_id = tests.get_uid('dp_seller');
select is(
  (select user_id from public.deal_main_contact
   where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller'),
  tests.get_uid('dp_seller'),
  'a star still on the side another way stays'
);
delete from public.seller_room_member where user_id = tests.get_uid('dp_seller');
select is_empty(
  $$ select 1 from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  'leaving the seller room clears the seller main contact'
);

select tests.login_as('dp_owner');
select lives_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller_law')) $$,
  'seller''s counsel can be the seller main contact'
);
reset role;
delete from public.deal_counsel where user_id = tests.get_uid('dp_seller_law');
select is_empty(
  $$ select 1 from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  'removing seller''s counsel clears the seller main contact'
);
delete from public.deal_counsel where user_id = tests.get_uid('dp_buyer_law');
select is_empty(
  $$ select 1 from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d2' and side = 'buyer' $$,
  'removing buyer''s counsel clears the buyer main contact'
);
delete from public.lender_room_member
where room_id = 'dd000000-0000-0000-0000-0000000000a1' and user_id = tests.get_uid('dp_lender');
select results_eq(
  $$ select lender_room_id from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'lender' $$,
  $$ values ('dd000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'leaving a lender room clears that room''s main contact and no other'
);

select tests.login_as('dp_member');
select results_eq(
  $$ select e.source, p.user_id, e.lender_room_id
     from public.deal_people('dd000000-0000-0000-0000-0000000000d1') p
     cross join unnest(p.entries) e
     where e.source in ('counsel', 'lender_room', 'seller_room') $$,
  $$ values ('lender_room', tests.get_uid('dp_lender2'), 'dd000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'removed room members and removed counsel drop off the people list'
);
reset role;

select tests.login_as('dp_owner');
insert into public.deal_main_contact (deal_id, side, user_id)
values ('dd000000-0000-0000-0000-0000000000d2', 'buyer', tests.get_uid('dp_leaver'));

select tests.login_as('dp_owner');
select lives_ok(
  $$ update public.deal_contact set side = 'seller'
     where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and contact_id = 'dd000000-0000-0000-0000-0000000000c2' $$,
  'a starred contact can change side'
);
select is_empty(
  $$ select 1 from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side in ('buyer', 'seller') $$,
  'a contact who changes side loses the star on the side they left'
);
select tests.login_as('dp_owner');
insert into public.deal_main_contact (deal_id, side, user_id)
values ('dd000000-0000-0000-0000-0000000000d1', 'buyer', tests.get_uid('dp_owner'));

-- ---- Main contacts each audience sees ----
reset role;
insert into public.lender_room_member (room_id, user_id, email)
values ('dd000000-0000-0000-0000-0000000000a1', tests.get_uid('dp_lender'), 'dp_lender@opendealbook.test');
insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('dp_seller'), 'dp_seller@opendealbook.test', 'Seller'
from public.seller_room r where r.deal_id = 'dd000000-0000-0000-0000-0000000000d1';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, phone, company)
values
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'buyer', tests.get_uid('dp_buyer_law'), 'dp_buyer_law@opendealbook.test', 'Buyer Law', '555-0200', 'Law LLP'),
  (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller_law'), 'dp_seller_law@opendealbook.test', 'Seller Law', null, null);
update public.contact set email = 'pat@cpa.test', phone = '555-0300', company = 'Pat CPA LLC'
where id = 'dd000000-0000-0000-0000-0000000000c2';

select tests.login_as('dp_owner');
insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
values ('dd000000-0000-0000-0000-0000000000d1', 'lender', 'dd000000-0000-0000-0000-0000000000a1', tests.get_uid('dp_lender'));
insert into public.deal_main_contact (deal_id, side, contact_id)
values ('dd000000-0000-0000-0000-0000000000d1', 'seller', 'dd000000-0000-0000-0000-0000000000c2');

select tests.login_as('dp_lender');
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.lender_room_main_contacts('dd000000-0000-0000-0000-0000000000a1') order by side $$,
  $$ values
     ('buyer', 'dp_owner', 'owner', 'DP Team', null::text, 'dp_owner@opendealbook.test'),
     ('lender', 'dp_lender', 'lender', 'Bank one', null, 'dp_lender@opendealbook.test') $$,
  'a lender sees the buyer main contact and its own room''s, never another lender''s or the seller''s'
);
select is_empty(
  $$ select 1 from public.lender_room_main_contacts('dd000000-0000-0000-0000-0000000000a2') $$,
  'a lender sees nothing of a room they are not in'
);
select is_empty(
  $$ select 1 from public.seller_room_main_contacts(
       (select id from public.seller_room where deal_id = 'dd000000-0000-0000-0000-0000000000d1')) $$,
  'a lender sees nothing of the seller room'
);
select is_empty(
  $$ select 1 from public.counsel_main_contacts('dd000000-0000-0000-0000-0000000000d1') $$,
  'a lender sees nothing through the counsel portal'
);

reset role;
create temp table seller_room_of_d1 as
select id from public.seller_room where deal_id = 'dd000000-0000-0000-0000-0000000000d1';
grant select on seller_room_of_d1 to authenticated;

select tests.login_as('dp_seller');
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.seller_room_main_contacts((select id from seller_room_of_d1)) order by side $$,
  $$ values
     ('buyer', 'dp_owner', 'owner', 'DP Team', null::text, 'dp_owner@opendealbook.test'),
     ('seller', 'Pat CPA', 'cpa', 'Pat CPA LLC', '555-0300', 'pat@cpa.test') $$,
  'a seller sees the buyer and seller main contacts and no lender'
);
select tests.login_as('dp_seller_law');
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.seller_room_main_contacts((select id from seller_room_of_d1)) order by side $$,
  $$ values
     ('buyer', 'dp_owner', 'owner', 'DP Team', null::text, 'dp_owner@opendealbook.test'),
     ('seller', 'Pat CPA', 'cpa', 'Pat CPA LLC', '555-0300', 'pat@cpa.test') $$,
  'seller''s counsel sees the seller room''s main contacts as the seller does'
);
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.counsel_main_contacts('dd000000-0000-0000-0000-0000000000d1') order by side $$,
  $$ values
     ('buyer', 'dp_owner', 'owner', 'DP Team', null::text, 'dp_owner@opendealbook.test'),
     ('seller', 'Pat CPA', 'cpa', 'Pat CPA LLC', '555-0300', 'pat@cpa.test') $$,
  'seller''s counsel sees the buyer and seller main contacts in the portal and no lender'
);

select tests.login_as('dp_buyer_law');
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.counsel_main_contacts('dd000000-0000-0000-0000-0000000000d1') order by side, company $$,
  $$ values
     ('buyer', 'dp_owner', 'owner', 'DP Team', null::text, 'dp_owner@opendealbook.test'),
     ('lender', 'dp_lender', 'lender', 'Bank one', null, 'dp_lender@opendealbook.test'),
     ('lender', 'dp_lender2', 'lender', 'Bank two', null, 'dp_lender2@opendealbook.test'),
     ('seller', 'Pat CPA', 'cpa', 'Pat CPA LLC', '555-0300', 'pat@cpa.test') $$,
  'buyer''s counsel sees every side''s main contact'
);

select tests.login_as('dp_owner');
update public.deal_main_contact set user_id = tests.get_uid('dp_buyer_law')
where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer';
select tests.login_as('dp_lender');
select results_eq(
  $$ select side::text, name, role, company, phone, email
     from public.lender_room_main_contacts('dd000000-0000-0000-0000-0000000000a1') where side = 'buyer' $$,
  $$ values ('buyer', 'dp_buyer_law', 'attorney', 'Law LLP', '555-0200', 'dp_buyer_law@opendealbook.test') $$,
  'a counsel main contact shows their own phone and company'
);

reset role;
update public.lender_room set status = 'declined' where id = 'dd000000-0000-0000-0000-0000000000a1';
select tests.login_as('dp_lender');
select is(
  (select count(*)::int from public.lender_room_main_contacts('dd000000-0000-0000-0000-0000000000a1')),
  2,
  'a declined room keeps its main contacts'
);
reset role;
update public.lender_room set status = 'invited' where id = 'dd000000-0000-0000-0000-0000000000a1';
select tests.login_as('dp_owner');
update public.deal_main_contact set user_id = tests.get_uid('dp_owner')
where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer';
delete from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'seller';
reset role;
delete from public.deal_counsel where deal_id = 'dd000000-0000-0000-0000-0000000000d1';
delete from public.seller_room_member where user_id = tests.get_uid('dp_seller');
delete from public.lender_room_member
where room_id = 'dd000000-0000-0000-0000-0000000000a1' and user_id = tests.get_uid('dp_lender');

-- ---- Billing lock ----
reset role;
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('dp-team');

select tests.login_as('dp_owner');
select throws_ok(
  $$ insert into public.deal_contact (account_id, deal_id, contact_id, side, role)
     values (tests.account_id('dp-team'), 'dd000000-0000-0000-0000-0000000000d1',
       'dd000000-0000-0000-0000-0000000000c3', 'seller', 'attorney') $$,
  '42501',
  'team is read-only',
  'a locked team cannot add people to a deal'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
     values ('dd000000-0000-0000-0000-0000000000d2', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
       tests.get_uid('dp_lender')) $$,
  '42501',
  'team is read-only',
  'a locked team cannot star a main contact'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_owner')) $$,
  '23514',
  null,
  'a locked team still cannot star someone off the side'
);
select throws_ok(
  $$ insert into public.deal_main_contact (deal_id, side, user_id)
     values ('dd000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('dp_seller_law')) $$,
  '23514',
  null,
  'removed counsel cannot be starred'
);
select throws_ok(
  $$ delete from public.deal_main_contact where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer' $$,
  '42501',
  'team is read-only',
  'a locked team cannot clear a main contact'
);
select lives_ok(
  $$ delete from public.accounts_memberships
     where account_id = tests.account_id('dp-team') and user_id = tests.get_uid('dp_leaver') $$,
  'a locked team still removes a member who is a main contact'
);
select is_empty(
  $$ select 1 from public.deal_main_contact
     where deal_id = 'dd000000-0000-0000-0000-0000000000d2' and side = 'buyer' $$,
  'leaving the team clears the buyer main contact'
);

-- Only a delete made inside another trigger passes the lock. This test trigger
-- stands in for any future one that would write a star while the team is
-- locked.
reset role;
create function tests.star_on_member_removal()
  returns trigger
  language plpgsql as $$
begin
  insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id)
  values ('dd000000-0000-0000-0000-0000000000d2', 'lender', 'dd000000-0000-0000-0000-0000000000a3',
    tests.get_uid('dp_lender'));
  return old;
end;
$$;
create trigger star_on_member_removal
  after delete on public.accounts_memberships
  for each row execute function tests.star_on_member_removal();
create function tests.restar_on_member_removal()
  returns trigger
  language plpgsql as $$
begin
  update public.deal_main_contact set user_id = tests.get_uid('dp_owner')
  where deal_id = 'dd000000-0000-0000-0000-0000000000d1' and side = 'buyer';
  return old;
end;
$$;

select tests.login_as('dp_owner');
select throws_ok(
  $$ delete from public.accounts_memberships
     where account_id = tests.account_id('dp-team') and user_id = tests.get_uid('dp_member') $$,
  '42501',
  'team is read-only',
  'a star written inside another trigger is still refused while the team is locked'
);

reset role;
drop trigger star_on_member_removal on public.accounts_memberships;
create trigger restar_on_member_removal
  after delete on public.accounts_memberships
  for each row execute function tests.restar_on_member_removal();

select tests.login_as('dp_owner');
select throws_ok(
  $$ delete from public.accounts_memberships
     where account_id = tests.account_id('dp-team') and user_id = tests.get_uid('dp_member') $$,
  '42501',
  'team is read-only',
  'a star changed inside another trigger is still refused while the team is locked'
);

select * from finish();
rollback;
