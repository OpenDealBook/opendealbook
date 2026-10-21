begin;
select no_plan();

select tests.create_user('ph_owner');
select tests.create_user('ph_other');

select tests.login_as_service_role();
select public.create_team_account('Phoneco', tests.get_uid('ph_owner'), 'phoneco');

select is(
  (select phone from public.accounts where id = tests.get_uid('ph_owner')),
  null,
  'a new person has no phone'
);

select tests.login_as('ph_owner');

select lives_ok(
  $$ update public.accounts set phone = '+1 555 0100' where id = tests.get_uid('ph_owner') $$,
  'a person sets their own phone'
);

select throws_ok(
  $$ update public.accounts set phone = '+1 555 0199' where id = tests.account_id('phoneco') $$,
  '23514',
  null,
  'a team account has no phone'
);

select tests.login_as('ph_other');
update public.accounts set phone = '+1 555 0666' where id = tests.get_uid('ph_owner');

select tests.login_as_service_role();
select is(
  (select phone from public.accounts where id = tests.get_uid('ph_owner')),
  '+1 555 0100',
  'nobody else changes a person''s phone'
);

select tests.login_as('ph_owner');

select throws_ok(
  $$ update public.accounts set phone = repeat('5', 51) where id = tests.get_uid('ph_owner') $$,
  '23514',
  null,
  'a phone longer than 50 characters is refused'
);

select lives_ok(
  $$ update public.accounts set phone_asked_at = now() where id = tests.get_uid('ph_owner') $$,
  'a person records that they were asked for their phone'
);

-- ---- Phones on the deal's people and main contacts ----
select tests.create_user('ph_lender');
select tests.create_user('ph_seller');
select tests.create_user('ph_counsel');

select tests.login_as_service_role();
select public.append_deal_event('9e000000-0000-0000-0000-0000000000d1', 'deal',
  '9e000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('phoneco'), 'owner_user_id', tests.get_uid('ph_owner'),
    'description', 'Phone deal'), null, 'service');

reset role;
update public.accounts set phone = '+1 555 0101' where id = tests.get_uid('ph_lender');
update public.accounts set phone = '+1 555 0102' where id = tests.get_uid('ph_seller');
update public.accounts set phone = '+1 555 0103' where id = tests.get_uid('ph_counsel');

set local session_replication_role = replica;
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('9e000000-0000-0000-0000-00000000f001', tests.account_id('phoneco'), '9e000000-0000-0000-0000-0000000000d1', 'Uploads'),
  ('9e000000-0000-0000-0000-00000000f002', tests.account_id('phoneco'), '9e000000-0000-0000-0000-0000000000d1', 'Bank');
insert into public.seller_room (id, account_id, deal_id, uploads_folder_id) values
  ('9e000000-0000-0000-0000-0000000000a5', tests.account_id('phoneco'), '9e000000-0000-0000-0000-0000000000d1',
    '9e000000-0000-0000-0000-00000000f001');
insert into public.seller_room_member (room_id, user_id, email, name) values
  ('9e000000-0000-0000-0000-0000000000a5', tests.get_uid('ph_seller'), 'ph_seller@test.com', 'Sam Seller');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id) values
  ('9e000000-0000-0000-0000-0000000000a1', tests.account_id('phoneco'), '9e000000-0000-0000-0000-0000000000d1',
    'First Bank', '9e000000-0000-0000-0000-00000000f002');
insert into public.lender_room_member (room_id, user_id, email) values
  ('9e000000-0000-0000-0000-0000000000a1', tests.get_uid('ph_lender'), 'ph_lender@test.com');
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name, phone) values
  (tests.account_id('phoneco'), '9e000000-0000-0000-0000-0000000000d1', 'seller', tests.get_uid('ph_counsel'),
    'ph_counsel@test.com', 'Cy Counsel', '+1 555 0999');
insert into public.deal_main_contact (deal_id, side, lender_room_id, user_id) values
  ('9e000000-0000-0000-0000-0000000000d1', 'buyer', null, tests.get_uid('ph_owner')),
  ('9e000000-0000-0000-0000-0000000000d1', 'lender', '9e000000-0000-0000-0000-0000000000a1', tests.get_uid('ph_lender')),
  ('9e000000-0000-0000-0000-0000000000d1', 'seller', null, tests.get_uid('ph_seller'));
set local session_replication_role = origin;

select tests.login_as('ph_owner');

select results_eq(
  $$ select e.source, e.phone
     from public.deal_people('9e000000-0000-0000-0000-0000000000d1') p, unnest(p.entries) e
     order by e.source $$,
  $$ values ('counsel', '+1 555 0999'), ('lender_room', '+1 555 0101'),
            ('seller_room', '+1 555 0102'), ('team', '+1 555 0100') $$,
  'deal people show the profile phone for team, lender and seller, and counsel''s own phone'
);

reset role;
select results_eq(
  $$ select side::text, phone from public.deal_main_contact_cards('9e000000-0000-0000-0000-0000000000d1')
     order by side $$,
  $$ values ('buyer', '+1 555 0100'), ('lender', '+1 555 0101'), ('seller', '+1 555 0102') $$,
  'main contact cards show the profile phone'
);

select * from finish();
rollback;
