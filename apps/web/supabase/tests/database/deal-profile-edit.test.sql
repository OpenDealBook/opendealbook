begin;
select no_plan();

select tests.create_user('dp_owner');
select tests.create_user('dp_member');

select tests.login_as_service_role();
select public.create_team_account('DP Team', tests.get_uid('dp_owner'), 'dp-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('dp-team'), tests.get_uid('dp_member'), 'member');

insert into public.firm (id, account_id, name, name_confirmed) values
  ('d9000000-0000-0000-0000-0000000000f1', tests.account_id('dp-team'), 'Oakline', false),
  ('d9000000-0000-0000-0000-0000000000f2', tests.account_id('dp-team'), 'Cedar Dental', true);

select public.append_deal_event('d9000000-0000-0000-0000-0000000000d1', 'deal',
  'd9000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dp-team'), 'firm_id', 'd9000000-0000-0000-0000-0000000000f1',
    'owner_user_id', tests.get_uid('dp_owner'), 'description', 'Plumbing deal'), null, 'service');
select public.append_deal_event('d9000000-0000-0000-0000-0000000000d2', 'deal',
  'd9000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dp-team'), 'firm_id', 'd9000000-0000-0000-0000-0000000000f2',
    'owner_user_id', tests.get_uid('dp_owner'), 'description', 'Dental deal', 'code_name', 'Project Harbor'),
  null, 'service');
select public.append_deal_event('d9000000-0000-0000-0000-0000000000d2', 'deal',
  'd9000000-0000-0000-0000-0000000000d2', 'deal.updated',
  jsonb_build_object('code_name', 'Project Harbor'), null, 'service');

select tests.login_as('dp_owner');

select lives_ok(
  $$ update public.firm set name = 'Cedar Dental Group' where id = 'd9000000-0000-0000-0000-0000000000f2' $$,
  'an owner renames a business directly'
);
select throws_ok(
  $$ update public.firm set name = 'Harbor' where id = 'd9000000-0000-0000-0000-0000000000f2' $$,
  '23514', 'a code name must not contain the business name',
  'renaming a business into its code name is still refused'
);

select lives_ok(
  $$ select public.update_deal_profile('d9000000-0000-0000-0000-0000000000d1', 'Brennan Climate',
       jsonb_build_object('code_name', 'Project Oakline', 'location_raw', 'Columbus, OH')) $$,
  'the profile save checks the new code name against the new business name'
);
select is(
  (select row(f.name::text, f.name_confirmed, d.code_name, p.location_raw)::text
   from public.deal d join public.firm f on f.id = d.firm_id join public.deal_profile p on p.deal_id = d.id
   where d.id = 'd9000000-0000-0000-0000-0000000000d1'),
  row('Brennan Climate', true, 'Project Oakline', 'Columbus, OH')::text,
  'the profile save renames and confirms the business, sets the code name and the profile'
);

select public.update_deal_profile('d9000000-0000-0000-0000-0000000000d1', 'Brennan Climate',
  jsonb_build_object('code_name', 'Project Oakline', 'location_raw', null));
select is(
  (select location_raw from public.deal_profile where deal_id = 'd9000000-0000-0000-0000-0000000000d1'),
  null,
  'a profile field sent as null is cleared'
);

select throws_ok(
  $$ select public.update_deal_profile('d9000000-0000-0000-0000-0000000000d1', 'Birch Climate',
       jsonb_build_object('code_name', 'Project Birch Climate West')) $$,
  '23514', 'a code name must not contain the business name',
  'the profile save refuses a code name containing the new business name'
);
select is(
  (select f.name::text from public.deal d join public.firm f on f.id = d.firm_id
   where d.id = 'd9000000-0000-0000-0000-0000000000d1'),
  'Brennan Climate',
  'a refused profile save changes nothing'
);

select tests.login_as('dp_member');

select throws_ok(
  $$ select public.update_deal_profile('d9000000-0000-0000-0000-0000000000d1', 'Member Rename',
       jsonb_build_object('code_name', null)) $$,
  '42501', 'editing the deal profile needs deals.manage',
  'a member without deals.manage cannot save the profile'
);

select * from finish();
rollback;
