begin;
select no_plan();

select tests.create_user('owner_u');
select tests.create_user('member_u');
select tests.create_user('outsider_u');

select tests.login_as_service_role();
select public.set_team_rename_limit('off');
select public.create_team_account('Acme', tests.get_uid('owner_u'), 'acme');
select public.create_team_account('Globex', tests.get_uid('outsider_u'), 'globex');

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('acme'), tests.get_uid('member_u'), 'member');

create temp table team as select tests.account_id('acme') as id;
create temp table rival as select tests.account_id('globex') as id;
grant select on team, rival to authenticated;

select tests.login_as('owner_u');
update public.accounts set name = 'Initech Partners' where id = (select id from team);
select is(
  (select slug from public.accounts where id = (select id from team)),
  'initech-partners',
  'renaming a team moves its slug to the new name'
);

select tests.login_as('member_u');
select is(
  public.team_account_current_slug('acme'),
  'initech-partners',
  'the old slug resolves to the current slug'
);

select tests.login_as('owner_u');
update public.accounts set name = 'Globex' where id = (select id from team);
select is(
  (select slug from public.accounts where id = (select id from team)),
  'globex-1',
  'a rename onto a taken slug gets a counter suffix'
);

update public.accounts set name = 'GLOBEX!' where id = (select id from team);
select is(
  (select slug from public.accounts where id = (select id from team)),
  'globex-1',
  'a rename that slugifies to the current slug keeps it'
);

select tests.login_as('member_u');
select is(
  public.team_account_current_slug('acme'),
  'globex-1',
  'the first slug follows every later rename'
);
select is(
  public.team_account_current_slug('initech-partners'),
  'globex-1',
  'an intermediate slug follows every later rename'
);

select tests.login_as('owner_u');
update public.accounts set name = 'Acme' where id = (select id from team);
select is(
  (select slug from public.accounts where id = (select id from team)),
  'acme',
  'a team can rename back onto its own former slug'
);
select lives_ok(
  $$ update public.accounts set name = 'Initech Partners' where id = (select id from team) $$,
  'a team can leave a reclaimed slug again'
);

select tests.login_as('member_u');
select is(
  public.team_account_current_slug('acme'),
  'initech-partners',
  'a reclaimed then abandoned slug resolves to the current slug'
);

select tests.login_as('outsider_u');
select is(
  public.team_account_current_slug('acme'),
  null,
  'a non-member cannot resolve the old slug'
);

select tests.login_as_service_role();
select is(
  (public.create_team_account('Acme', tests.get_uid('outsider_u'), 'acme')).slug,
  'acme-1',
  'a new team asking for a reserved slug gets a counter suffix'
);
select is(
  (public.create_team_account('Acme', tests.get_uid('outsider_u'))).slug,
  'acme-2',
  'a new team whose name derives a reserved slug gets a counter suffix'
);

select tests.login_as('outsider_u');
update public.accounts set name = 'Acme' where id = (select id from rival);
select is(
  (select slug from public.accounts where id = (select id from rival)),
  'acme-3',
  'a rename onto a slug reserved by another team gets a counter suffix'
);

select tests.login_as('owner_u');
select throws_ok(
  $$ update public.accounts set slug = 'hand-typed' where id = (select id from team) $$,
  '42501',
  null,
  'the owner cannot write a slug directly'
);

select tests.login_as_service_role();
select is(
  (public.create_team_account(repeat('Long ', 20), tests.get_uid('outsider_u'))).slug,
  rtrim(left(repeat('long-', 20), 64), '-'),
  'a slug derived from a long name is trimmed to 64 characters'
);
select is(
  (public.create_team_account(repeat('Long ', 20), tests.get_uid('outsider_u'))).slug,
  rtrim(left(repeat('long-', 20), 62), '-') || '-1',
  'a trimmed slug leaves room for its counter suffix'
);
select throws_ok(
  $$ select public.create_team_account('!!!', tests.get_uid('outsider_u')) $$,
  'P0001',
  'team name must contain a letter or number',
  'a new team whose name has no usable characters is refused'
);

select tests.login_as('owner_u');
select throws_ok(
  $$ update public.accounts set name = '!!!' where id = (select id from team) $$,
  'P0001',
  'team name must contain a letter or number',
  'a rename to a name with no usable characters is refused'
);

select * from finish();
rollback;
