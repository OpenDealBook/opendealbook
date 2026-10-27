begin;
select no_plan();

select tests.create_user('lt_a_owner');
select tests.create_user('lt_b_owner');
select tests.create_user('lt_b_member');
select tests.login_as_service_role();
select public.create_team_account('Letters A', tests.get_uid('lt_a_owner'), 'lt-team-a');
select public.create_team_account('Letters B', tests.get_uid('lt_b_owner'), 'lt-team-b');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('lt-team-b'), tests.get_uid('lt_b_member'), 'member');
insert into public.outreach_setting (account_id, daily_cap, letter_monthly_cap)
values (tests.account_id('lt-team-b'), 10, 5);

select lives_ok(
  $$ insert into public.outreach_letter
       (account_id, provider, idempotency_key, address_line1, city, state, postal_code)
     values (tests.account_id('lt-team-b'), 'lob', 'run-1:letter:0', '1 Main St', 'Austin', 'TX', '78701') $$,
  'a letter sent straight from a workflow needs no enrollment'
);
select throws_ok(
  $$ insert into public.outreach_letter
       (account_id, provider, idempotency_key, address_line1, city, state, postal_code)
     values (tests.account_id('lt-team-b'), 'lob', 'run-1:letter:0', '1 Main St', 'Austin', 'TX', '78701') $$,
  '23505', null, 'one idempotency key records one letter'
);

select tests.login_as('lt_b_owner');
select lives_ok(
  $$ update public.outreach_setting
     set letter_return_name = 'Letters B', letter_return_address_line1 = '9 Elm St',
         letter_return_city = 'Austin', letter_return_state = 'TX', letter_return_postal_code = '78702'
     where account_id = tests.account_id('lt-team-b') $$,
  'a deal manager sets the letter return address'
);
select lives_ok(
  $$ insert into public.letter_template (account_id, name, body)
     values (tests.account_id('lt-team-b'), 'Intro', 'Dear {{ recipient.name | owner }},') $$,
  'a deal manager adds a letter template'
);
select throws_ok(
  $$ insert into public.letter_template (account_id, name, body)
     values (tests.account_id('lt-team-b'), 'Blank', ' ') $$,
  '23514', null, 'a letter template needs a body'
);

select tests.login_as('lt_b_member');
select results_eq(
  $$ select name from public.letter_template $$,
  $$ values ('Intro') $$,
  'a member reads the team letter templates'
);
select throws_ok(
  $$ insert into public.letter_template (account_id, name, body)
     values (tests.account_id('lt-team-b'), 'Member', 'Hello') $$,
  '42501', null, 'a member without deals.manage cannot add a letter template'
);

select tests.login_as('lt_a_owner');
select is_empty(
  $$ select id from public.letter_template $$,
  'another team sees no letter templates'
);

select tests.login_as_service_role();
delete from public.accounts where id = tests.account_id('lt-team-b');
select is_empty(
  $$ select id from public.outreach_letter where idempotency_key = 'run-1:letter:0' $$,
  'deleting a team deletes its letters'
);

select * from finish();
rollback;
