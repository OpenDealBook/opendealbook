begin;
select no_plan();

select tests.create_user('dns_owner');
select tests.create_user('dns_member');

select tests.login_as_service_role();
select public.create_team_account('Spelling Team', tests.get_uid('dns_owner'), 'dns-team');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('dns-team'), tests.get_uid('dns_member'), 'member');

select is(
  (select diligence_name_spelling::text from public.accounts where id = tests.account_id('dns-team')),
  'source_priority',
  'a team shows background search names by source priority until it chooses otherwise'
);

select tests.login_as('dns_owner');

select lives_ok(
  $$ update public.accounts set diligence_name_spelling = 'newest_record' where id = tests.account_id('dns-team') $$,
  'a member with settings.manage chooses newest record spelling'
);

select throws_ok(
  $$ update public.accounts set diligence_name_spelling = 'alphabetical' where id = tests.account_id('dns-team') $$,
  '22P02',
  null,
  'an unknown name spelling is refused'
);

select tests.login_as('dns_member');
update public.accounts set diligence_name_spelling = 'source_priority' where id = tests.account_id('dns-team');

select tests.login_as_service_role();
select is(
  (select diligence_name_spelling::text from public.accounts where id = tests.account_id('dns-team')),
  'newest_record',
  'a member without settings.manage does not change the name spelling'
);

select * from finish();
rollback;
