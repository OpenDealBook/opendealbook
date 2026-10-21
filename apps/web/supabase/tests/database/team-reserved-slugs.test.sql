begin;
select no_plan();

select tests.create_user('owner_u');

select tests.login_as_service_role();
select public.set_team_rename_limit('off');

select public.create_team_account('Settings', tests.get_uid('owner_u'));
select is(
  (select slug from public.accounts where name = 'Settings'),
  'settings-1',
  'a team named after an app route gets a counter suffix'
);

select public.create_team_account('Acme', tests.get_uid('owner_u'), 'deals');
select is(
  (select slug from public.accounts where name = 'Acme'),
  'deals-1',
  'an explicit reserved slug gets a counter suffix'
);

select public.create_team_account('Globex', tests.get_uid('owner_u'));
select tests.login_as('owner_u');
update public.accounts set name = 'Create Team' where name = 'Globex';
select is(
  (select slug from public.accounts where name = 'Create Team'),
  'create-team-1',
  'a rename onto a reserved slug gets a counter suffix'
);

select tests.login_as_service_role();
select public.create_team_account(w, tests.get_uid('owner_u'))
from unnest(array['Billing', 'Todos', 'Outreach', 'Underwriting', 'Counsel']) as w;
select is(
  (select array_agg(slug order by slug) from public.accounts where name in ('Billing', 'Todos', 'Outreach', 'Underwriting', 'Counsel')),
  array['billing-1', 'counsel-1', 'outreach-1', 'todos-1', 'underwriting-1'],
  'every reserved word is suffixed'
);

select * from finish();
rollback;
