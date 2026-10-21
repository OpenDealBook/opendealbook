begin;
select no_plan();

select tests.create_user('pt_owner');
select tests.create_user('pt_mate');
select tests.create_user('pt_peer');

select tests.login_as_service_role();
select public.create_team_account('PT Team', tests.get_uid('pt_owner'), 'pt-team');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('pt_mate'), tests.account_id('pt-team'), 'member'),
  (tests.get_uid('pt_peer'), tests.account_id('pt-team'), 'member');

insert into public.personal_todo (id, account_id, user_id, title, created_by) values
  ('9d000000-0000-0000-0000-000000000001', tests.account_id('pt-team'), tests.get_uid('pt_mate'),
    'Tell the seller/broker the room is closing', tests.get_uid('pt_mate')),
  ('9d000000-0000-0000-0000-000000000002', tests.account_id('pt-team'), tests.get_uid('pt_owner'),
    'Call the lender', tests.get_uid('pt_mate'));

select lives_ok(
  $$ delete from auth.users where id = tests.get_uid('pt_mate') $$,
  'a person who holds to-dos can be deleted'
);

select is_empty(
  $$ select 1 from public.personal_todo where id = '9d000000-0000-0000-0000-000000000001' $$,
  'their own to-dos go with them'
);

select results_eq(
  $$ select user_id, created_by from public.personal_todo where id = '9d000000-0000-0000-0000-000000000002' $$,
  $$ values (tests.get_uid('pt_owner'), null::uuid) $$,
  'a to-do they created for someone else stays, with no creator'
);

-- ---- Due date ----
select tests.login_as('pt_owner');

select lives_ok(
  $$ insert into public.personal_todo (id, account_id, title, due_at)
     values ('9d000000-0000-0000-0000-000000000003', tests.account_id('pt-team'), 'Send the LOI', '2026-11-01T17:00:00Z') $$,
  'a person sets a due date on their own to-do'
);
select lives_ok(
  $$ insert into public.personal_todo (id, account_id, title)
     values ('9d000000-0000-0000-0000-000000000004', tests.account_id('pt-team'), 'No date') $$,
  'a to-do needs no due date'
);
select lives_ok(
  $$ update public.personal_todo set due_at = '2026-11-02T17:00:00Z' where id = '9d000000-0000-0000-0000-000000000004' $$,
  'and gets one later'
);
select results_eq(
  $$ select id, due_at from public.personal_todo where id in ('9d000000-0000-0000-0000-000000000003', '9d000000-0000-0000-0000-000000000004') order by id $$,
  $$ values ('9d000000-0000-0000-0000-000000000003'::uuid, '2026-11-01T17:00:00Z'::timestamptz),
            ('9d000000-0000-0000-0000-000000000004'::uuid, '2026-11-02T17:00:00Z'::timestamptz) $$,
  'the dates are stored'
);

select tests.login_as('pt_peer');
update public.personal_todo set due_at = '2030-01-01T00:00:00Z' where id = '9d000000-0000-0000-0000-000000000003';
select tests.login_as_service_role();
select is(
  (select due_at from public.personal_todo where id = '9d000000-0000-0000-0000-000000000003'),
  '2026-11-01T17:00:00Z'::timestamptz, 'a teammate cannot change another person''s due date'
);

-- ---- Assignee ----
select tests.create_user('pt_analyst');
select tests.create_user('pt_outsider');
reset role;
insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('pt_analyst'), tests.account_id('pt-team'), 'member');

select tests.login_as('pt_owner');
select lives_ok(
  $$ insert into public.personal_todo (id, account_id, user_id, title)
     values ('9d000000-0000-0000-0000-000000000005', tests.account_id('pt-team'), tests.get_uid('pt_analyst'), 'Pull the leases') $$,
  'a team member assigns a to-do to a teammate'
);
select throws_ok(
  $$ insert into public.personal_todo (account_id, user_id, title)
     values (tests.account_id('pt-team'), tests.get_uid('pt_outsider'), 'Not on the team') $$,
  '42501', null, 'nobody outside the team can be assigned'
);
select results_eq(
  $$ select title from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  $$ values ('Pull the leases'::text) $$,
  'the creator still sees a to-do they assigned away'
);

select tests.login_as('pt_analyst');
select results_eq(
  $$ select title from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  $$ values ('Pull the leases'::text) $$,
  'the assignee sees it'
);
select lives_ok(
  $$ select public.assign_personal_todo('9d000000-0000-0000-0000-000000000005', tests.get_uid('pt_peer')) $$,
  'the assignee reassigns it to another teammate'
);
select is_empty(
  $$ select 1 from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  'and no longer sees it'
);

select throws_ok(
  $$ select public.assign_personal_todo('9d000000-0000-0000-0000-000000000005', tests.get_uid('pt_analyst')) $$,
  '42501', null, 'a former assignee cannot take it back'
);

select tests.login_as('pt_peer');
select throws_ok(
  $$ select public.assign_personal_todo('9d000000-0000-0000-0000-000000000005', tests.get_uid('pt_outsider')) $$,
  '42501', null, 'nor can it be reassigned outside the team'
);
select lives_ok(
  $$ update public.personal_todo set done = true where id = '9d000000-0000-0000-0000-000000000005' $$,
  'the new assignee works it'
);

select tests.login_as('pt_owner');
select results_eq(
  $$ select user_id, done from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  $$ values (tests.get_uid('pt_peer'), true) $$,
  'the creator sees who holds it and that it is done'
);

select tests.login_as('pt_analyst');
delete from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005';
select tests.login_as('pt_owner');
select isnt_empty(
  $$ select 1 from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  'a former assignee cannot delete it'
);
select lives_ok(
  $$ delete from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  'the creator deletes it'
);
select is_empty(
  $$ select 1 from public.personal_todo where id = '9d000000-0000-0000-0000-000000000005' $$,
  'and it is gone'
);

select * from finish();
rollback;
