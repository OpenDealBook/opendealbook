begin;
select no_plan();

select tests.create_user('lhl_owner');
select tests.create_user('lhl_other');
select tests.create_user('lhl_saver');

select tests.login_as_service_role();
select public.create_team_account('LHL Acct', tests.get_uid('lhl_owner'), 'lhl-acct');
select public.create_team_account('LHL Other', tests.get_uid('lhl_other'), 'lhl-other');

select public.append_deal_event('1e000000-0000-0000-0000-0000000000d1', 'deal',
  '1e000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lhl-acct'), 'firm_id', tests.create_firm(tests.account_id('lhl-acct'))), null, 'service');
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d2', 'deal',
  '1e000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lhl-acct'), 'firm_id', tests.create_firm(tests.account_id('lhl-acct'))), null, 'service');
select public.append_deal_event('1e000000-0000-0000-0000-0000000000d3', 'deal',
  '1e000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lhl-other'), 'firm_id', tests.create_firm(tests.account_id('lhl-other'))), null, 'service');

reset role;

insert into public.lender_brand (domain, name) values
  ('hist-a.test', 'Hist A'), ('WWW.Hist-A.test', 'Hist A'), ('hist-b.test', 'Hist B'), ('hist-c.test', 'Hist C');
insert into public.lender (id, account_id, name, website, domain) values
  ('1e000000-0000-0000-0000-0000000000b0', tests.account_id('lhl-acct'), 'Hist B', 'https://hist-b.test', 'hist-b.test');
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('1e000000-0000-0000-0000-0000000000f1', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1', 'One'),
  ('1e000000-0000-0000-0000-0000000000f2', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1', 'Two'),
  ('1e000000-0000-0000-0000-0000000000f3', tests.account_id('lhl-other'), '1e000000-0000-0000-0000-0000000000d3', 'Three'),
  ('1e000000-0000-0000-0000-0000000000f4', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Four'),
  ('1e000000-0000-0000-0000-0000000000f5', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Five'),
  ('1e000000-0000-0000-0000-0000000000f6', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1', 'Six');
insert into public.lender_room (id, account_id, deal_id, brand_domain, lender_id, name, private_folder_id) values
  ('1e000000-0000-0000-0000-0000000000a1', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1',
   'hist-a.test', null, 'Plain domain', '1e000000-0000-0000-0000-0000000000f1'),
  ('1e000000-0000-0000-0000-0000000000a2', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1',
   'WWW.Hist-A.test', null, 'www and case', '1e000000-0000-0000-0000-0000000000f2'),
  ('1e000000-0000-0000-0000-0000000000a3', tests.account_id('lhl-other'), '1e000000-0000-0000-0000-0000000000d3',
   'hist-a.test', null, 'Other team', '1e000000-0000-0000-0000-0000000000f3'),
  ('1e000000-0000-0000-0000-0000000000a4', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2',
   'hist-a.test', '1e000000-0000-0000-0000-0000000000b0', 'Linked to B', '1e000000-0000-0000-0000-0000000000f4'),
  ('1e000000-0000-0000-0000-0000000000a5', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2',
   'hist-b.test', null, 'B domain, unlinked', '1e000000-0000-0000-0000-0000000000f5'),
  ('1e000000-0000-0000-0000-0000000000a6', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1',
   'hist-c.test', null, 'C domain', '1e000000-0000-0000-0000-0000000000f6');
update public.lender_room set lender_id = null where id = '1e000000-0000-0000-0000-0000000000a5';

select tests.login_as('lhl_owner');

select lives_ok(
  $$ insert into public.lender (id, account_id, name, website, domain)
     values ('1e000000-0000-0000-0000-0000000000a0', tests.account_id('lhl-acct'), 'Hist A', 'https://hist-a.test', 'hist-a.test') $$,
  'the team saves a lender on a domain its unlinked rooms use'
);

select results_eq(
  $$ select room_id from public.lender_history('1e000000-0000-0000-0000-0000000000a0') order by room_id $$,
  $$ values ('1e000000-0000-0000-0000-0000000000a1'::uuid), ('1e000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'saving the lender links the team''s unlinked rooms on its domain, whatever the www. and case, and history shows them'
);
select results_eq(
  $$ select room_id from public.lender_history('1e000000-0000-0000-0000-0000000000b0') order by room_id $$,
  $$ values ('1e000000-0000-0000-0000-0000000000a4'::uuid) $$,
  'history follows the room''s link, not its domain'
);

select lives_ok(
  $$ update public.lender set website = 'https://hist-c.test', domain = 'hist-c.test'
     where id = '1e000000-0000-0000-0000-0000000000b0' $$,
  'the team moves a lender to another domain'
);
select results_eq(
  $$ select room_id from public.lender_history('1e000000-0000-0000-0000-0000000000b0') order by room_id $$,
  $$ values ('1e000000-0000-0000-0000-0000000000a4'::uuid), ('1e000000-0000-0000-0000-0000000000a6'::uuid) $$,
  'saving a lender on a new domain links the unlinked rooms there and keeps the rooms already linked'
);

select tests.login_as_service_role();

select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000a3'),
  null, 'another team''s room on the same domain stays unlinked'
);
select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000a5'),
  null, 'a room on a domain the lender left stays unlinked'
);

reset role;
insert into public.lender_brand (domain, name) values ('Www.hist-a.test', 'Hist A');
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('1e000000-0000-0000-0000-0000000000f7', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Seven'),
  ('1e000000-0000-0000-0000-0000000000f8', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Eight');
insert into public.lender_room (id, account_id, deal_id, brand_domain, lender_id, name, private_folder_id) values
  ('1e000000-0000-0000-0000-0000000000a7', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2',
   'Www.hist-a.test', null, 'New room on a saved domain', '1e000000-0000-0000-0000-0000000000f7'),
  ('1e000000-0000-0000-0000-0000000000a8', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2',
   'hist-c.test', '1e000000-0000-0000-0000-0000000000a0', 'New room linked by hand', '1e000000-0000-0000-0000-0000000000f8');

select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000a7'),
  '1e000000-0000-0000-0000-0000000000a0'::uuid,
  'a new room on a saved lender''s domain, whatever the www. and case, is linked to it'
);
select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000a8'),
  '1e000000-0000-0000-0000-0000000000a0'::uuid,
  'a new room keeps the lender it was linked to, even on another saved lender''s domain'
);

-- The backfill in 20261031140000_lender_history_by_link.sql, run against rooms
-- left unlinked from before it.
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('1e000000-0000-0000-0000-0000000000f9', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2', 'Nine'),
  ('1e000000-0000-0000-0000-0000000000fa', tests.account_id('lhl-other'), '1e000000-0000-0000-0000-0000000000d3', 'Ten');
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id) values
  ('1e000000-0000-0000-0000-0000000000a9', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d2',
   'WWW.Hist-A.test', 'Unlinked before the backfill', '1e000000-0000-0000-0000-0000000000f9'),
  ('1e000000-0000-0000-0000-0000000000aa', tests.account_id('lhl-other'), '1e000000-0000-0000-0000-0000000000d3',
   'Www.hist-a.test', 'Other team, no saved lender', '1e000000-0000-0000-0000-0000000000fa');
update public.lender_room set lender_id = null where id = '1e000000-0000-0000-0000-0000000000a9';

update public.lender_room r set lender_id = l.id
from public.lender l
where l.account_id = r.account_id
  and r.lender_id is null
  and regexp_replace(lower(r.brand_domain), '^www\.', '') = l.domain;

select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000a9'),
  '1e000000-0000-0000-0000-0000000000a0'::uuid,
  'the backfill links an unlinked room to the one saved lender on its domain in its team'
);
select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000aa'),
  null,
  'the backfill leaves a room unlinked when its team saved no lender on its domain'
);

-- A teammate who may save lenders but cannot read the team's rooms.
insert into public.roles (name, hierarchy_level) values ('lhl_lender_saver', 60);
insert into public.role_permissions (role, permission) values ('lhl_lender_saver', 'deals.manage');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('lhl-acct'), tests.get_uid('lhl_saver'), 'lhl_lender_saver');
insert into public.lender_brand (domain, name) values ('hist-d.test', 'Hist D');
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('1e000000-0000-0000-0000-0000000000fb', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1', 'Eleven');
insert into public.lender_room (id, account_id, deal_id, brand_domain, name, private_folder_id) values
  ('1e000000-0000-0000-0000-0000000000ab', tests.account_id('lhl-acct'), '1e000000-0000-0000-0000-0000000000d1',
   'hist-d.test', 'Room the saver cannot read', '1e000000-0000-0000-0000-0000000000fb');

select tests.login_as('lhl_saver');

select is_empty(
  $$ select 1 from public.lender_room where id = '1e000000-0000-0000-0000-0000000000ab' $$,
  'the saver cannot read the room'
);
select lives_ok(
  $$ insert into public.lender (id, account_id, name, website, domain)
     values ('1e000000-0000-0000-0000-0000000000d0', tests.account_id('lhl-acct'), 'Hist D', 'https://hist-d.test', 'hist-d.test') $$,
  'a teammate with deals.manage but not deals.work saves a lender'
);

reset role;

select is(
  (select lender_id from public.lender_room where id = '1e000000-0000-0000-0000-0000000000ab'),
  '1e000000-0000-0000-0000-0000000000d0'::uuid,
  'the room the saver cannot read is still linked to the saved lender'
);

select * from finish();
rollback;
