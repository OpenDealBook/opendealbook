begin;
select no_plan();

select tests.create_user('tla_owner');
select tests.create_user('tla_lender');

select tests.login_as_service_role();
select public.create_team_account('TLA Acct', tests.get_uid('tla_owner'), 'tla-acct');
select public.append_deal_event('7a000000-0000-0000-0000-0000000000d1', 'deal',
  '7a000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tla-acct'), 'firm_id', tests.create_firm(tests.account_id('tla-acct')), 'owner_user_id', tests.get_uid('tla_owner'),
    'description', 'Activity deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('7a000000-0000-0000-0000-00000000f001', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', null, 'Opened only'),
  ('7a000000-0000-0000-0000-00000000f002', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', null, 'Worked'),
  ('7a000000-0000-0000-0000-00000000f003', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', null, 'Untouched');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('7a000000-0000-0000-0000-0000000000a1', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', 'Opened only', '7a000000-0000-0000-0000-00000000f001'),
  ('7a000000-0000-0000-0000-0000000000a2', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', 'Worked', '7a000000-0000-0000-0000-00000000f002'),
  ('7a000000-0000-0000-0000-0000000000a3', tests.account_id('tla-acct'), '7a000000-0000-0000-0000-0000000000d1', 'Untouched', '7a000000-0000-0000-0000-00000000f003');
insert into public.lender_room_activity (room_id, account_id, user_id, side, action, created_at)
values
  ('7a000000-0000-0000-0000-0000000000a1', tests.account_id('tla-acct'), tests.get_uid('tla_lender'), 'lender', 'room_opened', '2026-03-02'),
  ('7a000000-0000-0000-0000-0000000000a2', tests.account_id('tla-acct'), tests.get_uid('tla_lender'), 'lender', 'folder_opened', '2026-03-03'),
  ('7a000000-0000-0000-0000-0000000000a2', tests.account_id('tla-acct'), tests.get_uid('tla_lender'), 'lender', 'room_opened', '2026-03-05');

select tests.login_as('tla_owner');
select results_eq(
  $$ select room_name, last_lender_activity_at, last_lender_action_at
     from public.team_lender_rooms(tests.account_id('tla-acct')) order by room_name $$,
  $$ values
       ('Opened only', '2026-03-02'::timestamptz, null::timestamptz),
       ('Untouched', null::timestamptz, null::timestamptz),
       ('Worked', '2026-03-05'::timestamptz, '2026-03-03'::timestamptz) $$,
  'a room''s last lender action leaves out the lender opening the room'
);

select * from finish();
rollback;
