begin;
select no_plan();

select tests.create_user('lrl_owner');
select tests.create_user('lrl_other');

select tests.login_as_service_role();
select public.create_team_account('LRL Acct', tests.get_uid('lrl_owner'), 'lrl-acct');
select public.create_team_account('LRL Other', tests.get_uid('lrl_other'), 'lrl-other');

select public.append_deal_event('1f000000-0000-0000-0000-0000000000d1', 'deal',
  '1f000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('lrl-acct')), null, 'service');

reset role;

insert into public.lender_brand (domain, name) values ('link-a.test', 'Link A'), ('link-b.test', 'Link B');
insert into public.lender (id, account_id, name, website, domain) values
  ('1f000000-0000-0000-0000-0000000000a1', tests.account_id('lrl-acct'), 'Link A', 'https://link-a.test', 'link-a.test'),
  ('1f000000-0000-0000-0000-0000000000a2', tests.account_id('lrl-acct'), 'Link B', 'https://link-b.test', 'link-b.test'),
  ('1f000000-0000-0000-0000-0000000000a3', tests.account_id('lrl-other'), 'Other Bank', 'https://other.test', 'other.test');
insert into public.dr_folder (id, account_id, deal_id, name) values
  ('1f000000-0000-0000-0000-0000000000f1', tests.account_id('lrl-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Linked'),
  ('1f000000-0000-0000-0000-0000000000f2', tests.account_id('lrl-acct'), '1f000000-0000-0000-0000-0000000000d1', 'Unlinked');
insert into public.lender_room (id, account_id, deal_id, brand_domain, lender_id, name, private_folder_id) values
  ('1f000000-0000-0000-0000-0000000000b1', tests.account_id('lrl-acct'), '1f000000-0000-0000-0000-0000000000d1',
   'link-b.test', '1f000000-0000-0000-0000-0000000000a1', 'Linked', '1f000000-0000-0000-0000-0000000000f1'),
  ('1f000000-0000-0000-0000-0000000000b2', tests.account_id('lrl-acct'), '1f000000-0000-0000-0000-0000000000d1',
   'link-a.test', null, 'Unlinked', '1f000000-0000-0000-0000-0000000000f2');

set local session_replication_role = replica;
update public.lender_room set created_at = now() - interval '10 days'
where deal_id = '1f000000-0000-0000-0000-0000000000d1';
set local session_replication_role = origin;

select tests.login_as('lrl_owner');

select is(
  (select lender_id from public.lender_rooms_due_nudge(tests.account_id('lrl-acct'))
   where room_id = '1f000000-0000-0000-0000-0000000000b1'),
  '1f000000-0000-0000-0000-0000000000a1'::uuid,
  'a due room belongs to its linked lender, whatever its brand domain says');
select is(
  (select lender_id from public.lender_rooms_due_nudge(tests.account_id('lrl-acct'))
   where room_id = '1f000000-0000-0000-0000-0000000000b2'),
  null,
  'a due room with no link has no lender even when a saved lender has its domain');

select tests.login_as_service_role();

select throws_ok(
  $$ update public.lender_room set lender_id = '1f000000-0000-0000-0000-0000000000a3'
     where id = '1f000000-0000-0000-0000-0000000000b1' $$,
  '23503', null, 'a room cannot link a lender saved by another team');

delete from public.lender where id = '1f000000-0000-0000-0000-0000000000a1';

select is(
  (select lender_id from public.lender_room where id = '1f000000-0000-0000-0000-0000000000b1'),
  null, 'deleting the lender leaves the room, unlinked');

select * from finish();
rollback;
