begin;
select no_plan();

select tests.create_user('owner_u');
select tests.create_user('member_u');
select tests.create_user('admin_u');
select tests.create_user('super_u');

update auth.users
  set raw_app_meta_data = raw_app_meta_data || '{"role": "super-admin"}'::jsonb
  where id = tests.get_uid('super_u');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), tests.get_uid('super_u'), 'totp', 'verified', now(), now());

select tests.login_as_service_role();
select public.create_team_account('Acme', tests.get_uid('owner_u'), 'acme');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('acme'), tests.get_uid('member_u'), 'member'),
  (tests.account_id('acme'), tests.get_uid('admin_u'), 'admin'),
  (tests.account_id('acme'), tests.get_uid('super_u'), 'member');

create temp table team as select tests.account_id('acme') as id;
grant select on team to authenticated, service_role;

create function pg_temp.forget_last_rename() returns void as $$
  update public.accounts set renamed_at = now() - interval '31 days' where id = (select id from team);
$$ language sql;

select is(
  (select team_rename_limit::text from public.config),
  'monthly',
  'renames are limited to one per 30 days until the app says otherwise'
);

select tests.login_as('owner_u');
select lives_ok(
  $$ update public.accounts set name = 'Initech' where id = (select id from team) $$,
  'the first rename after creation is allowed'
);
select is(
  public.team_rename_allowed_at((select renamed_at from public.accounts where id = (select id from team))),
  (select renamed_at + interval '30 days' from public.accounts where id = (select id from team)),
  'the next rename is allowed 30 days after the last one'
);
select throws_ok(
  $$ update public.accounts set name = 'Globex' where id = (select id from team) $$,
  'ODB01',
  'team was renamed recently',
  'a second rename within 30 days is refused'
);
select is(
  (select name::text from public.accounts where id = (select id from team)),
  'Initech',
  'a refused rename leaves the name unchanged'
);

reset role;
select pg_temp.forget_last_rename();
select tests.login_as('owner_u');
select lives_ok(
  $$ update public.accounts set name = 'INITECH!' where id = (select id from team) $$,
  'a rename is allowed again once 30 days have passed'
);
select is(
  (select slug from public.accounts where id = (select id from team)),
  'initech',
  'a rename that keeps the slug still goes through'
);
select throws_ok(
  $$ update public.accounts set name = 'Globex' where id = (select id from team) $$,
  'ODB01',
  'team was renamed recently',
  'a rename that kept the slug starts the 30 days'
);

select throws_ok(
  $$ update public.accounts set renamed_at = null where id = (select id from team) $$,
  '42501',
  null,
  'members cannot reset the rename clock'
);

reset role;
select pg_temp.forget_last_rename();
select tests.login_as('member_u');
update public.accounts set name = 'Member Picked' where id = (select id from team);
select isnt(
  (select name::text from public.accounts where id = (select id from team)),
  'Member Picked',
  'a plain member cannot rename the team'
);
select tests.login_as('admin_u');
update public.accounts set name = 'Admin Picked' where id = (select id from team);
select is(
  (select name::text from public.accounts where id = (select id from team)),
  'Admin Picked',
  'a non-owner holding settings.manage can rename the team'
);
update public.accounts
  set picture_url = 'https://example.com/x.png', public_data = '{"tagline": "Deals"}'
  where id = (select id from team);
select is(
  (select picture_url::text || ' ' || (public_data ->> 'tagline') from public.accounts where id = (select id from team)),
  'https://example.com/x.png Deals',
  'a non-owner holding settings.manage can change the team picture and public profile'
);
select throws_ok(
  $$ update public.accounts set slug = 'hand-picked' where id = (select id from team) $$,
  '42501',
  null,
  'a non-owner cannot write the slug'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', tests.get_uid('super_u'),
    'role', 'authenticated',
    'aal', 'aal2',
    'app_metadata', json_build_object('role', 'super-admin')
  )::text,
  true
);
select is(
  public.team_rename_allowed_at((select renamed_at from public.accounts where id = (select id from team))),
  null,
  'a super-admin has no rename wait'
);
select lives_ok(
  $$ update public.accounts set name = 'Super Picked' where id = (select id from team) $$,
  'a super-admin may rename within 30 days'
);

select tests.login_as_service_role();
select lives_ok(
  $$ update public.accounts set name = 'Service Picked' where id = (select id from team) $$,
  'the service role may rename within 30 days'
);

select tests.login_as('owner_u');
select throws_ok(
  $$ select public.set_team_rename_limit('off') $$,
  '42501',
  null,
  'users cannot turn the limit off'
);

select tests.login_as_service_role();
select public.set_team_rename_limit('off');

select tests.login_as('owner_u');
select is(
  public.team_rename_allowed_at((select renamed_at from public.accounts where id = (select id from team))),
  null,
  'with the limit off there is no rename wait'
);
select lives_ok(
  $$ update public.accounts set name = 'Off One' where id = (select id from team);
     update public.accounts set name = 'Off Two' where id = (select id from team) $$,
  'with the limit off renames are unlimited'
);

select * from finish();
rollback;
