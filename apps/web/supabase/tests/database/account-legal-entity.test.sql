begin;
select no_plan();

select tests.create_user('le_owner');
select tests.create_user('le_other');

select tests.login_as_service_role();
select public.create_team_account('Acme', tests.get_uid('le_owner'), 'le-acme');
select public.create_team_account('Other', tests.get_uid('le_other'), 'le-other');

select is(
  (select legal_entity_name from public.accounts where id = tests.account_id('le-acme')),
  null,
  'a new team has no legal entity name'
);

select tests.login_as('le_owner');

select lives_ok(
  $$ update public.accounts set legal_entity_name = 'Acme Holdings LLC' where id = tests.account_id('le-acme') $$,
  'the team''s owner sets its legal entity name'
);
select is(
  (select legal_entity_name from public.accounts where id = tests.account_id('le-acme')),
  'Acme Holdings LLC',
  'the legal entity name is stored on the team'
);
select throws_ok(
  $$ update public.accounts set legal_entity_name = 'Owner Personal LLC' where id = tests.get_uid('le_owner') $$,
  '23514', null, 'a personal account has no legal entity name'
);

select tests.login_as('le_other');
update public.accounts set legal_entity_name = 'Other Edit LLC' where id = tests.account_id('le-acme');

select tests.login_as_service_role();
select is(
  (select legal_entity_name from public.accounts where id = tests.account_id('le-acme')),
  'Acme Holdings LLC',
  'another team does not change it'
);

select tests.login_as('le_other');
select lives_ok(
  $$ update public.accounts set legal_entity_name = 'Other Co LLC' where id = tests.account_id('le-other') $$,
  'another team sets its own'
);

select * from finish();
rollback;
