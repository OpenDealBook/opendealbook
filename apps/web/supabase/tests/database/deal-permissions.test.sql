begin;
select no_plan();

-- Four principals against the real roles/role_permissions seed:
-- a personal-account owner, a team owner, a team member on a limited role,
-- and a user who belongs to no account.
select tests.create_user('solo');
select tests.create_user('team_owner');
select tests.create_user('limited_member');
select tests.create_user('outsider');

select tests.login_as_service_role();
select public.create_team_account('Perm Team', tests.get_uid('team_owner'), 'perm-team');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('perm-team'), tests.get_uid('limited_member'), 'member');

-- ---- personal-account owner holds every permission on their own account ----
select is(
  public.has_permission(tests.get_uid('solo'),
    (select id from public.accounts where primary_owner_user_id = tests.get_uid('solo') and is_personal_account),
    'deals.manage'),
  true,
  'a personal-account owner holds deals.manage via the primary-owner branch'
);
select is(
  public.has_permission(tests.get_uid('solo'),
    (select id from public.accounts where primary_owner_user_id = tests.get_uid('solo') and is_personal_account),
    'deals.create'),
  true,
  'a personal-account owner holds deals.create'
);
select is(
  public.has_permission(tests.get_uid('solo'),
    (select id from public.accounts where primary_owner_user_id = tests.get_uid('solo') and is_personal_account),
    'checklists.manage'),
  true,
  'a personal-account owner holds checklists.manage'
);
select tests.login_as('solo');
select is(
  public.has_role_on_account((select id from public.accounts where primary_owner_user_id = tests.get_uid('solo') and is_personal_account)),
  true,
  'a personal-account owner has a role on their own account'
);

-- ---- team owner holds the managing permissions ----
select is(
  public.has_permission(tests.get_uid('team_owner'), tests.account_id('perm-team'), 'deals.manage'),
  true,
  'a team owner holds deals.manage'
);
select is(
  public.has_permission(tests.get_uid('team_owner'), tests.account_id('perm-team'), 'checklists.manage'),
  true,
  'a team owner holds checklists.manage'
);
select tests.login_as('team_owner');
select is(
  public.has_role_on_account(tests.account_id('perm-team')),
  true,
  'a team owner has a role on the team account'
);

-- ---- team member on the member role: belongs, but lacks the deal permissions ----
select is(
  public.has_permission(tests.get_uid('limited_member'), tests.account_id('perm-team'), 'settings.manage'),
  true,
  'a member holds the settings.manage the member role is seeded with'
);
select is(
  public.has_permission(tests.get_uid('limited_member'), tests.account_id('perm-team'), 'deals.manage'),
  false,
  'a member does not hold deals.manage'
);
select is(
  public.has_permission(tests.get_uid('limited_member'), tests.account_id('perm-team'), 'deals.create'),
  false,
  'a member does not hold deals.create'
);
select is(
  public.has_permission(tests.get_uid('limited_member'), tests.account_id('perm-team'), 'checklists.manage'),
  false,
  'a member does not hold checklists.manage'
);
select tests.login_as('limited_member');
select is(
  public.has_role_on_account(tests.account_id('perm-team')),
  true,
  'a member has a role on the team account'
);

-- ---- non-member has no permission and no role ----
select is(
  public.has_permission(tests.get_uid('outsider'), tests.account_id('perm-team'), 'deals.manage'),
  false,
  'a non-member holds no deals.manage'
);
select is(
  public.has_permission(tests.get_uid('outsider'), tests.account_id('perm-team'), 'settings.manage'),
  false,
  'a non-member holds no settings.manage'
);
select tests.login_as('outsider');
select is(
  public.has_role_on_account(tests.account_id('perm-team')),
  false,
  'a non-member has no role on the team account'
);

select * from finish();
rollback;
