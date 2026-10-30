begin;
select no_plan();

-- Team "DC Team" owns deal d1. dc_owner manages it; dc_member is on the team
-- without deals.manage. dc_buyer_law is buyer's counsel, dc_seller_law is
-- seller's counsel, dc_seller sits in the deal's seller room.
select tests.create_user('dc_owner');
select tests.create_user('dc_member');
select tests.create_user('dc_buyer_law');
select tests.create_user('dc_seller_law');
select tests.create_user('dc_seller');
select tests.create_user('dc_stranger');
select tests.create_user('dc_other_owner');

select tests.login_as_service_role();
select public.create_team_account('DC Team', tests.get_uid('dc_owner'), 'dc-team');
select public.create_team_account('DC Other', tests.get_uid('dc_other_owner'), 'dc-other');
select public.append_deal_event('dc000000-0000-0000-0000-0000000000d1', 'deal',
  'dc000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dc-team'), 'firm_id', tests.create_firm(tests.account_id('dc-team')), 'owner_user_id', tests.get_uid('dc_owner'),
    'description', 'Counsel deal'), null, 'service');
select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
  'dc000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dc-team'), 'firm_id', tests.create_firm(tests.account_id('dc-team')), 'owner_user_id', tests.get_uid('dc_owner'),
    'description', 'Second counsel deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('dc_member'), tests.account_id('dc-team'), 'member');

select tests.login_as('dc_owner');
select public.ensure_seller_room('dc000000-0000-0000-0000-0000000000d1');

reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('dc_seller'), 'dc_seller@opendealbook.test', 'Seller'
from public.seller_room r where r.deal_id = 'dc000000-0000-0000-0000-0000000000d1';

-- ---- The shape of the domain ----
select is(
  enum_range(null::public.deal_side)::text,
  '{buyer,seller,lender}',
  'a deal has a buyer, a seller and lender side'
);
select is(
  enum_range(null::public.deal_person_role)::text,
  '{principal,attorney,broker,cpa,other}',
  'people on a deal hold one of the five roles'
);
select is(
  enum_range(null::public.counsel_side)::text,
  '{buyer,seller}',
  'counsel represent the buyer or the seller, never a lender'
);

-- ---- Writing counsel ----
select tests.login_as('dc_owner');
select throws_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
     values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', 'Buyer Law') $$,
  '42501',
  null,
  'even a deal manager adds counsel only through an invite'
);

select tests.login_as_service_role();
select throws_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
     values (tests.account_id('dc-other'), 'dc000000-0000-0000-0000-0000000000d1', 'buyer',
       tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', 'Buyer Law') $$,
  '42501',
  'rows cannot link across teams',
  'counsel cannot be filed under another team''s deal'
);

select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  false,
  'an APA is not ready with no counsel'
);

select lives_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
     values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'buyer',
       tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test') $$,
  'counsel are invited without a name and set it on first sign-in'
);
delete from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d2';
delete from public.deal_counsel_removed where deal_id = 'dc000000-0000-0000-0000-0000000000d2';

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'buyer',
  tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', 'Buyer Law');

select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  false,
  'an APA is not ready with buyer''s counsel alone'
);

insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'seller',
  tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', 'Seller Law');

select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  true,
  'an APA is ready once both sides have counsel'
);
select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d2'),
  false,
  'counsel on one deal do not ready another deal''s APA'
);

-- ---- Who is counsel ----
select tests.login_as('dc_buyer_law');
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d1', 'buyer'),
  true,
  'buyer''s counsel is counsel on the buyer side'
);
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d1', 'seller'),
  false,
  'buyer''s counsel is not counsel on the seller side'
);
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d2', 'buyer'),
  false,
  'counsel on one deal are not counsel on another'
);

select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  true,
  'counsel on the deal can ask whether its APA is ready'
);

select tests.login_as('dc_member');
select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  true,
  'any team member can ask whether the deal''s APA is ready'
);

select tests.login_as('dc_stranger');
select throws_ok(
  $$ select public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'a stranger cannot ask whether a deal''s APA is ready'
);

select tests.login_as('dc_owner');
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d1', 'buyer'),
  false,
  'a team member is not counsel'
);

-- ---- Who sees counsel ----
select tests.login_as('dc_member');
select is(
  (select count(*)::int from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d1'),
  2,
  'every team member sees the deal''s counsel'
);

select tests.login_as('dc_buyer_law');
select results_eq(
  $$ select side::text from public.deal_counsel $$,
  $$ values ('buyer') $$,
  'counsel see their own row and not the other side''s'
);

select tests.login_as('dc_seller');
select results_eq(
  $$ select side::text from public.deal_counsel $$,
  $$ values ('seller') $$,
  'a seller sees the seller''s counsel and not the buyer''s'
);

select tests.login_as('dc_stranger');
select is_empty(
  $$ select 1 from public.deal_counsel $$,
  'a stranger sees no counsel'
);

-- ---- Removing counsel ----
select tests.login_as('dc_member');
delete from public.deal_counsel where side = 'buyer';
select tests.login_as('dc_seller');
delete from public.deal_counsel where side = 'buyer';
select tests.login_as('dc_owner');
delete from public.deal_counsel where side = 'seller';
select tests.login_as('dc_buyer_law');
delete from public.deal_counsel;
select tests.login_as('dc_seller_law');
delete from public.deal_counsel;

select tests.login_as_service_role();
select is(
  (select count(*)::int from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d1'),
  2,
  'only the team removes buyer''s counsel, only the seller removes seller''s counsel, and counsel remove nobody'
);

select tests.login_as('dc_owner');
delete from public.deal_counsel where side = 'buyer';
select tests.login_as('dc_seller');
delete from public.deal_counsel where side = 'seller';

select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d1' $$,
  'the team removed buyer''s counsel and the seller removed seller''s counsel'
);
select results_eq(
  $$ select side::text, user_id, email, removed_by
     from public.deal_counsel_removed
     where deal_id = 'dc000000-0000-0000-0000-0000000000d1'
     order by side $$,
  $$ values
       ('buyer', tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', tests.get_uid('dc_owner')),
       ('seller', tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', tests.get_uid('dc_seller')) $$,
  'each removal is kept with who was removed and who removed them'
);
select is(
  public.apa_counsel_ready('dc000000-0000-0000-0000-0000000000d1'),
  false,
  'an APA is no longer ready once counsel are removed'
);

select tests.login_as('dc_owner');
select is(
  (select count(*)::int from public.deal_counsel_removed),
  2,
  'a deal manager sees removed counsel'
);
select tests.login_as('dc_member');
select is_empty(
  $$ select 1 from public.deal_counsel_removed $$,
  'a team member without deals.manage sees no removed counsel'
);
select tests.login_as('dc_stranger');
select is_empty(
  $$ select 1 from public.deal_counsel_removed $$,
  'a stranger sees no removed counsel'
);

-- ---- Access ends with the deal ----
select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', 'Buyer Law'),
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'buyer',
    tests.get_uid('dc_buyer_law'), 'dc_buyer_law@opendealbook.test', 'Buyer Law');

reset role;
update public.deal set archived_at = now() where id = 'dc000000-0000-0000-0000-0000000000d1';
update public.deal set resolution = 'lost' where id = 'dc000000-0000-0000-0000-0000000000d2';

select tests.login_as('dc_buyer_law');
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d1', 'buyer'),
  false,
  'counsel access ends when the deal is archived'
);
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d2', 'buyer'),
  false,
  'counsel access ends when the deal is resolved'
);

-- ---- A closed seller room ----
reset role;
update public.deal set resolution = null where id = 'dc000000-0000-0000-0000-0000000000d2';
update public.deal set archived_at = null where id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'seller',
  tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', 'Seller Law');

reset role;
update public.seller_room set closed_at = now() where deal_id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as('dc_seller');
select results_eq(
  $$ select side::text from public.deal_counsel $$,
  $$ values ('seller') $$,
  'a seller still sees their counsel once the seller room is closed'
);
delete from public.deal_counsel where side = 'seller';

select tests.login_as_service_role();
select isnt_empty(
  $$ select 1 from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d1' and side = 'seller' $$,
  'a seller cannot remove their counsel once the seller room is closed: it is read-only'
);
reset role;
delete from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d1' and side = 'seller';

-- ---- The APA stage needs counsel on both sides ----
-- d2 has buyer's counsel only.

select tests.login_as('dc_owner');
select throws_ok(
  $$ select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
       'dc000000-0000-0000-0000-0000000000d2', 'deal.stage_changed', '{"stage": "pa_accepted"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'the deal cannot reach pa_accepted without seller''s counsel'
);

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'seller',
  tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', 'Seller Law');

select tests.login_as('dc_owner');
select lives_ok(
  $$ select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
       'dc000000-0000-0000-0000-0000000000d2', 'deal.stage_changed', '{"stage": "pa_accepted"}') $$,
  'the deal reaches pa_accepted once both sides have counsel'
);

select tests.login_as_service_role();
delete from public.deal_counsel where deal_id = 'dc000000-0000-0000-0000-0000000000d2' and side = 'seller';

select tests.login_as('dc_owner');
select lives_ok(
  $$ select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
       'dc000000-0000-0000-0000-0000000000d2', 'deal.updated', '{"description": "Renamed counsel deal"}') $$,
  'a deal already at pa_accepted stays editable after counsel are removed'
);
select is(
  (select stage from public.deal where id = 'dc000000-0000-0000-0000-0000000000d2'),
  'pa_accepted',
  'removing counsel does not move a deal off pa_accepted'
);
select lives_ok(
  $$ select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
       'dc000000-0000-0000-0000-0000000000d2', 'deal.stage_changed', '{"stage": "pa_submitted"}') $$,
  'the deal can step back from pa_accepted without counsel'
);
select throws_ok(
  $$ select public.append_deal_event('dc000000-0000-0000-0000-0000000000d2', 'deal',
       'dc000000-0000-0000-0000-0000000000d2', 'deal.stage_changed', '{"stage": "pa_accepted"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'the deal cannot return to pa_accepted after seller''s counsel is removed'
);

-- ---- Billing lock ----

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'seller',
  tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', 'Seller Law');

reset role;
update public.seller_room set closed_at = null where deal_id = 'dc000000-0000-0000-0000-0000000000d1';
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('dc-team');

select tests.login_as('dc_owner');
select throws_ok(
  $$ delete from public.deal_counsel where side = 'buyer' $$,
  '42501',
  'team is read-only',
  'a locked team cannot remove buyer''s counsel'
);

select tests.login_as('dc_seller');
select lives_ok(
  $$ delete from public.deal_counsel where side = 'seller' $$,
  'a seller still removes their counsel while the team is locked'
);

select tests.login_as('dc_buyer_law');
select is(
  public.is_deal_counsel('dc000000-0000-0000-0000-0000000000d1', 'buyer'),
  true,
  'counsel keep access while the team is locked'
);

reset role;
select col_type_is('public', 'deal_counsel', 'profile_asked_at', 'timestamp with time zone',
  'deal_counsel records when counsel were asked for their name and phone');
select col_is_null('public', 'deal_counsel', 'profile_asked_at',
  'a new counsel row has not been asked yet');

select tests.login_as('dc_buyer_law');
select throws_ok(
  $$ update public.deal_counsel set profile_asked_at = now() $$,
  '42501',
  null,
  'counsel cannot mark themselves asked directly'
);

-- ---- Seller's counsel in the seller room ----
-- d1's seller room is open again with seller's counsel on d1.

reset role;
update public.seller_room set closed_at = null where deal_id = 'dc000000-0000-0000-0000-0000000000d1';
select set_config('dc.room', (select id::text from public.seller_room where deal_id = 'dc000000-0000-0000-0000-0000000000d1'), true);

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'seller',
  tests.get_uid('dc_seller_law'), 'dc_seller_law@opendealbook.test', 'Seller Law');

select tests.login_as('dc_seller_law');
select is(
  public.is_seller_room_member(current_setting('dc.room')::uuid),
  true,
  'seller''s counsel are let into the seller room'
);
select results_eq(
  $$ select deal_id, deal_name, team_name, is_open from public.my_seller_rooms() $$,
  $$ values ('dc000000-0000-0000-0000-0000000000d1'::uuid, 'Fixture business', 'DC Team', true) $$,
  'seller''s counsel find the seller room among their rooms'
);

reset role;
insert into public.dr_folder (account_id, deal_id, parent_id, name)
values
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', null, 'Shared with seller'),
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', null, 'Team only');
insert into public.seller_room_folder (room_id, dr_folder_id)
select current_setting('dc.room')::uuid, f.id
from public.dr_folder f
where f.deal_id = 'dc000000-0000-0000-0000-0000000000d1' and f.name = 'Shared with seller';

select tests.login_as('dc_seller_law');
select results_eq(
  $$ select id from public.seller_room $$,
  $$ values (current_setting('dc.room')::uuid) $$,
  'seller''s counsel read the seller room row'
);
select results_eq(
  $$ select name from public.dr_folder order by name $$,
  $$ values ('Seller uploads'), ('Seller''s counsel'), ('Shared with seller') $$,
  'seller''s counsel read the room''s folders and their own, and nothing the team kept back'
);

select tests.login_as('dc_seller');
select results_eq(
  $$ select name from public.dr_folder order by name $$,
  $$ values ('Seller uploads'), ('Seller''s counsel'), ('Shared with seller') $$,
  'the seller reads the same folders as their counsel'
);

select tests.login_as('dc_buyer_law');
select is_empty(
  $$ select 1 from public.seller_room $$,
  'buyer''s counsel do not read the seller room row'
);

select tests.login_as('dc_buyer_law');
select is(
  public.is_seller_room_member(current_setting('dc.room')::uuid),
  false,
  'buyer''s counsel are not let into the seller room'
);
select is_empty(
  $$ select 1 from public.my_seller_rooms() $$,
  'buyer''s counsel have no seller room'
);

reset role;
update public.seller_room set closed_at = now() where deal_id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as('dc_seller_law');
select is(
  public.is_seller_room_member(current_setting('dc.room')::uuid),
  true,
  'seller''s counsel, like the seller, still read a closed seller room while the deal is open'
);
select results_eq(
  $$ select is_open from public.my_seller_rooms() $$,
  $$ values (false) $$,
  'seller''s counsel, like the seller, still see a closed seller room listed as closed'
);

reset role;
update public.seller_room set closed_at = null where deal_id = 'dc000000-0000-0000-0000-0000000000d1';
update public.deal set resolution = 'lost' where id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as('dc_seller_law');
select is(
  public.seller_room_deal_ids(),
  '{}'::uuid[],
  'seller''s counsel lose the seller room''s data room once the deal is resolved'
);

reset role;
update public.deal set resolution = null, archived_at = now() where id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as('dc_seller_law');
select is_empty(
  $$ select 1 from public.my_seller_rooms() $$,
  'seller''s counsel lose the seller room once the deal is archived'
);

-- ---- One side per person ----

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'buyer',
  tests.get_uid('dc_stranger'), 'dc_stranger@opendealbook.test');

select throws_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
     values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'seller',
       tests.get_uid('dc_stranger'), 'dc_stranger@opendealbook.test') $$,
  '23505',
  null,
  'a person who is counsel for one side cannot also be counsel for the other'
);

select lives_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
     values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'seller',
       tests.get_uid('dc_stranger'), 'dc_stranger@opendealbook.test') $$,
  'counsel for one side on a deal may be counsel for the other side on another deal'
);

delete from public.deal_counsel
where deal_id = 'dc000000-0000-0000-0000-0000000000d2' and user_id = tests.get_uid('dc_stranger');

select lives_ok(
  $$ insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
     values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'seller',
       tests.get_uid('dc_stranger'), 'dc_stranger@opendealbook.test') $$,
  'counsel removed from one side may be invited for the other'
);

-- ---- Buyer's counsel read the data room and the seller Q&A ----
-- On deal d2: Financials/Tax and the lender package are the team's; Bank is a
-- lender room's own folder, with a subfolder of its own. The team stays
-- locked: counsel keep reading.

reset role;
insert into public.dr_folder (id, account_id, deal_id, parent_id, name) values
  ('dc000000-0000-0000-0000-0000000000f1', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', null, 'Financials'),
  ('dc000000-0000-0000-0000-0000000000f2', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f1', 'Tax'),
  ('dc000000-0000-0000-0000-0000000000f3', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', null, 'Bank'),
  ('dc000000-0000-0000-0000-0000000000f4', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f3', 'Bank uploads'),
  ('dc000000-0000-0000-0000-0000000000f5', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', null, 'Lender package');

insert into public.lender_package (deal_id, account_id, master_folder_id)
values ('dc000000-0000-0000-0000-0000000000d2', tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000f5');
insert into public.lender_room (account_id, deal_id, name, private_folder_id)
values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'Bank', 'dc000000-0000-0000-0000-0000000000f3');

insert into public.dr_document (account_id, deal_id, folder_id, name, storage_path, removed_at) values
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f2', 'returns.pdf', 'dc/returns.pdf', null),
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f5', 'package.pdf', 'dc/package.pdf', null),
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f4', 'bank-only.pdf', 'dc/bank-only.pdf', null),
  (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d2', 'dc000000-0000-0000-0000-0000000000f1', 'old.pdf', 'dc/old.pdf', now());

update public.accounts set trial_ends_at = now() + interval '1 day'
where id = tests.account_id('dc-team');
select tests.login_as('dc_owner');
select public.ensure_seller_room('dc000000-0000-0000-0000-0000000000d2');

reset role;
insert into public.seller_room_question (id, room_id, account_id, title, body)
select 'dc000000-0000-0000-0000-0000000000a1', r.id, tests.account_id('dc-team'), 'Customer list?', 'Top ten by revenue'
from public.seller_room r where r.deal_id = 'dc000000-0000-0000-0000-0000000000d2';
insert into public.seller_room_question_message (question_id, side, body)
values ('dc000000-0000-0000-0000-0000000000a1', 'seller', 'Attached the list');
insert into public.seller_question (deal_id, account_id, question, answer, answered_at)
values ('dc000000-0000-0000-0000-0000000000d2', tests.account_id('dc-team'), 'Old portal question', 'Old answer', now());
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('dc-team');

select tests.login_as('dc_buyer_law');
select results_eq(
  $$ select name from public.buyer_counsel_folders('dc000000-0000-0000-0000-0000000000d2') order by name $$,
  $$ values ('Financials'), ('Financials'), ('Legal'), ('Lender package'), ('Operations'), ('Other'),
            ('Seller uploads'), ('Tax'), ('Tax') $$,
  'buyer''s counsel see every data room folder except a lender room''s own and the seller''s counsel folder'
);
select results_eq(
  $$ select name from public.buyer_counsel_documents('dc000000-0000-0000-0000-0000000000d2') order by name $$,
  $$ values ('package.pdf'), ('returns.pdf') $$,
  'buyer''s counsel see every current file outside the lender rooms'' own folders'
);
select results_eq(
  $$ select title, body, status::text from public.buyer_counsel_seller_questions('dc000000-0000-0000-0000-0000000000d2') $$,
  $$ values ('Customer list?', 'Top ten by revenue', 'open') $$,
  'buyer''s counsel read the seller room questions'
);
select results_eq(
  $$ select question_id, side::text, body from public.buyer_counsel_seller_question_messages('dc000000-0000-0000-0000-0000000000d2') $$,
  $$ values ('dc000000-0000-0000-0000-0000000000a1'::uuid, 'seller', 'Attached the list') $$,
  'buyer''s counsel read the answers to seller room questions'
);
select results_eq(
  $$ select question, answer from public.buyer_counsel_legacy_seller_questions('dc000000-0000-0000-0000-0000000000d2') $$,
  $$ values ('Old portal question', 'Old answer') $$,
  'buyer''s counsel read the seller questions from before seller rooms'
);
select throws_ok(
  $$ insert into public.seller_room_question_message (question_id, side, body)
     values ('dc000000-0000-0000-0000-0000000000a1', 'internal', 'Counsel reply') $$,
  '42501',
  null,
  'buyer''s counsel cannot answer a seller question'
);

select tests.login_as('dc_stranger');
select is_empty(
  $$ select 1 from public.buyer_counsel_folders('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_documents('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_seller_questions('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_seller_question_messages('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_legacy_seller_questions('dc000000-0000-0000-0000-0000000000d2') $$,
  'seller''s counsel read none of it through the buyer''s counsel functions'
);

reset role;
update public.deal set resolution = 'lost' where id = 'dc000000-0000-0000-0000-0000000000d2';

select tests.login_as('dc_buyer_law');
select is_empty(
  $$ select 1 from public.buyer_counsel_folders('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_documents('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_seller_questions('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_seller_question_messages('dc000000-0000-0000-0000-0000000000d2')
     union all select 1 from public.buyer_counsel_legacy_seller_questions('dc000000-0000-0000-0000-0000000000d2') $$,
  'buyer''s counsel lose the data room and the Q&A once the deal is resolved'
);

-- ---- The sides an address holds on a deal ----
-- On d1: dc_owner owns the team, dc_member is on it, dc_buyer_law is buyer's
-- counsel, dc_seller is in the seller room, dc_seller_law is seller's counsel.

select tests.create_user('dc_lender');
reset role;
with folder as (
  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  values (tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', null, 'Lender room')
  returning id
), room as (
  insert into public.lender_room (account_id, deal_id, name, private_folder_id)
  select tests.account_id('dc-team'), 'dc000000-0000-0000-0000-0000000000d1', 'First Bank', id from folder
  returning id
)
insert into public.lender_room_member (room_id, user_id, email)
select id, tests.get_uid('dc_lender'), 'dc_lender@opendealbook.test' from room;
update public.lender_room set status = 'declined' where deal_id = 'dc000000-0000-0000-0000-0000000000d1';

select tests.login_as_service_role();
select results_eq(
  $$ select who, array(select public.deal_side_of_email('dc000000-0000-0000-0000-0000000000d1', who) order by 1)::text
     from unnest(array['dc_owner@opendealbook.test', 'dc_member@opendealbook.test', 'dc_buyer_law@opendealbook.test',
       'DC_Seller@OpenDealbook.test', 'dc_seller_law@opendealbook.test', 'dc_lender@opendealbook.test',
       'dc_other_owner@opendealbook.test', 'nobody@opendealbook.test']) who $$,
  $$ values
       ('dc_owner@opendealbook.test', '{buyer}'),
       ('dc_member@opendealbook.test', '{buyer}'),
       ('dc_buyer_law@opendealbook.test', '{buyer}'),
       ('DC_Seller@OpenDealbook.test', '{seller}'),
       ('dc_seller_law@opendealbook.test', '{seller}'),
       ('dc_lender@opendealbook.test', '{lender}'),
       ('dc_other_owner@opendealbook.test', '{}'),
       ('nobody@opendealbook.test', '{}') $$,
  'an address holds the side of the team, counsel, seller room or lender room it is in, in any letter case and in a declined room too'
);
select is(
  array(select public.deal_side_of_email('dc000000-0000-0000-0000-0000000000d2', 'dc_seller@opendealbook.test')),
  '{}'::public.deal_side[],
  'a side on one deal is not a side on another'
);

reset role;
select is(
  has_function_privilege('authenticated', 'public.deal_side_of_email(uuid, text)', 'execute'),
  false,
  'signed-in callers cannot look up who is on a deal by email'
);

-- ---- Grants ----
reset role;
select is(
  has_function_privilege('authenticated', 'public.seller_room_is_open(public.seller_room)', 'execute'),
  false,
  'signed-in callers cannot ask whether any seller room is open'
);

select * from finish();
rollback;
