begin;
select no_plan();

select tests.create_user('ak_owner');
select tests.create_user('ak_admin');
select tests.create_user('ak_member');
select tests.create_user('ak_people_lead');
select tests.create_user('ak_analyst');

select tests.login_as_service_role();
select public.create_team_account('Keys Co', tests.get_uid('ak_owner'), 'keys-co');

reset role;

insert into public.roles (name, hierarchy_level) values ('people_lead', 50);
insert into public.role_permissions (role, permission) values
  ('people_lead', 'members.manage'),
  ('analyst', 'api_keys.manage');

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('keys-co'), tests.get_uid('ak_admin'), 'admin'),
  (tests.account_id('keys-co'), tests.get_uid('ak_member'), 'member'),
  (tests.account_id('keys-co'), tests.get_uid('ak_people_lead'), 'people_lead'),
  (tests.account_id('keys-co'), tests.get_uid('ak_analyst'), 'analyst');

select is(
  (select array_agg(role::text order by role) from public.role_permissions where permission = 'api_keys.manage' and role in ('owner', 'admin', 'member')),
  array['admin', 'owner'],
  'owner and admin hold api_keys.manage by default and member does not'
);

select tests.login_as('ak_owner');
select lives_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Owner key', '\x00', 'odb_own', '{read}', tests.get_uid('ak_owner')) $$,
  'an owner creates a key'
);

select tests.login_as('ak_admin');
select lives_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Admin key', '\x00', 'odb_adm', '{read}', tests.get_uid('ak_admin')) $$,
  'an admin creates a key'
);
select results_eq(
  $$ select name::text from public.api_key where account_id = tests.account_id('keys-co') order by name $$,
  array['Admin key', 'Owner key'],
  'an admin lists the team''s keys'
);
select lives_ok(
  $$ update public.api_key set revoked_at = now() where key_prefix = 'odb_adm' $$,
  'an admin revokes a key'
);

select tests.login_as('ak_analyst');
select lives_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Analyst key', '\x00', 'odb_ana', '{read}', tests.get_uid('ak_analyst')) $$,
  'a role granted api_keys.manage creates a key'
);
select results_eq(
  $$ select count(*)::int from public.api_key where account_id = tests.account_id('keys-co') $$,
  array[3],
  'a role granted api_keys.manage lists the team''s keys'
);
select lives_ok(
  $$ update public.api_key set revoked_at = now() where key_prefix = 'odb_ana' $$,
  'a role granted api_keys.manage revokes a key'
);
select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Forged', '\x00', 'odb_frg', '{read}', tests.get_uid('ak_owner')) $$,
  '42501', null, 'a holder still cannot create a key in someone else''s name'
);

select tests.login_as('ak_people_lead');
select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Lead key', '\x00', 'odb_led', '{read}', tests.get_uid('ak_people_lead')) $$,
  '42501', null, 'members.manage alone does not create a key'
);
select is_empty(
  $$ select 1 from public.api_key where account_id = tests.account_id('keys-co') $$,
  'members.manage alone does not list keys'
);
update public.api_key set revoked_at = now() where key_prefix = 'odb_own';

select tests.login_as('ak_member');
select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('keys-co'), 'Member key', '\x00', 'odb_mem', '{read}', tests.get_uid('ak_member')) $$,
  '42501', null, 'a member without api_keys.manage cannot create a key'
);
select is_empty(
  $$ select 1 from public.api_key where account_id = tests.account_id('keys-co') $$,
  'a member without api_keys.manage cannot list keys'
);
update public.api_key set revoked_at = now() where key_prefix = 'odb_own';

select tests.login_as_service_role();
select results_eq(
  $$ select key_prefix, revoked_at is not null from public.api_key
     where account_id = tests.account_id('keys-co') order by key_prefix $$,
  $$ values ('odb_adm'::text, true), ('odb_ana'::text, true), ('odb_own'::text, false) $$,
  'holders revoked their keys and non-holders revoked nothing'
);

select tests.login_as('ak_analyst');
update public.api_key set revoked_at = now() where key_prefix = 'odb_own';

select tests.login_as_service_role();
select isnt(
  (select revoked_at from public.api_key where key_prefix = 'odb_own'),
  null,
  'any holder revokes a key another holder created'
);

select tests.login_as('ak_owner');
select throws_ok(
  $$ update public.api_key set revoked_at = null where key_prefix = 'odb_adm' $$,
  '42501', 'a revoked API key stays revoked', 'a holder cannot un-revoke a key'
);

select tests.login_as_service_role();
select lives_ok(
  $$ update public.api_key set revoked_at = null where key_prefix = 'odb_ana' $$,
  'the service role can un-revoke a key'
);

insert into public.api_key (account_id, name, key_hash, key_prefix, created_by)
values
  (tests.account_id('keys-co'), 'Admin live', extensions.digest('adminsecret', 'sha256'), 'odb_al', tests.get_uid('ak_admin')),
  (tests.account_id('keys-co'), 'Owner live', extensions.digest('ownersecret', 'sha256'), 'odb_ol', tests.get_uid('ak_owner')),
  (tests.account_id('keys-co'), 'Analyst live', extensions.digest('analystsecret', 'sha256'), 'odb_nl', tests.get_uid('ak_analyst'));

select is(
  public.verify_api_key('odb_al', 'adminsecret'),
  tests.account_id('keys-co'),
  'a key works while its creator holds api_keys.manage'
);

reset role;
update public.accounts_memberships set account_role = 'member'
where account_id = tests.account_id('keys-co') and user_id = tests.get_uid('ak_admin');

select isnt(
  (select revoked_at from public.api_key where key_prefix = 'odb_al'),
  null,
  'demoting the creator out of api_keys.manage revokes their key'
);
select is(
  (select revoked_at from public.api_key where key_prefix = 'odb_ol'),
  null,
  'demoting one holder leaves other holders'' keys live'
);

update public.accounts_memberships set account_role = 'admin'
where account_id = tests.account_id('keys-co') and user_id = tests.get_uid('ak_admin');
select tests.login_as_service_role();

select is(
  public.verify_api_key('odb_al', 'adminsecret'),
  null,
  're-granting api_keys.manage does not revive a revoked key'
);

reset role;
delete from public.role_permissions where role = 'analyst' and permission = 'api_keys.manage';

select isnt(
  (select revoked_at from public.api_key where key_prefix = 'odb_nl'),
  null,
  'removing api_keys.manage from the creator''s role revokes their key'
);

insert into public.api_key (account_id, name, key_hash, key_prefix, created_by)
values (tests.account_id('keys-co'), 'Leaver', extensions.digest('leaversecret', 'sha256'), 'odb_lv', tests.get_uid('ak_admin'));
delete from public.accounts_memberships
where account_id = tests.account_id('keys-co') and user_id = tests.get_uid('ak_admin');

select isnt(
  (select revoked_at from public.api_key where key_prefix = 'odb_lv'),
  null,
  'the creator leaving the team revokes their key'
);
select is(
  (select revoked_at from public.api_key where key_prefix = 'odb_ol'),
  null,
  'the owner''s key is still live'
);

select tests.create_user('ak_x_old');
select tests.create_user('ak_x_new');
select tests.create_user('ak_l_owner');
select tests.create_user('ak_l_admin');
select tests.login_as_service_role();
select public.create_team_account('Transfer Co', tests.get_uid('ak_x_old'), 'transfer-co');
select public.create_team_account('Locked Keys', tests.get_uid('ak_l_owner'), 'locked-keys');
reset role;

insert into public.api_key (account_id, name, key_hash, key_prefix, created_by)
values (tests.account_id('transfer-co'), 'Old owner', '\x00', 'odb_xo', tests.get_uid('ak_x_old'));
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('transfer-co'), tests.get_uid('ak_x_new'), 'owner');
update public.accounts_memberships set account_role = 'member'
where account_id = tests.account_id('transfer-co') and user_id = tests.get_uid('ak_x_old');

select is(
  (select revoked_at from public.api_key where key_prefix = 'odb_xo'),
  null,
  'the primary owner keeps their key while their membership role lacks the permission'
);

update public.accounts set primary_owner_user_id = tests.get_uid('ak_x_new')
where id = tests.account_id('transfer-co');

select isnt(
  (select revoked_at from public.api_key where key_prefix = 'odb_xo'),
  null,
  'handing primary ownership away revokes the former owner''s key when nothing else grants the permission'
);

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('locked-keys'), tests.get_uid('ak_l_admin'), 'admin');
insert into public.api_key (account_id, name, key_hash, key_prefix, created_by)
values
  (tests.account_id('locked-keys'), 'Locked admin', '\x00', 'odb_la', tests.get_uid('ak_l_admin')),
  (tests.account_id('locked-keys'), 'Locked owner', '\x00', 'odb_lo', tests.get_uid('ak_l_owner'));
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('locked-keys');

select tests.login_as('ak_l_owner');
select lives_ok(
  $$ update public.accounts_memberships set account_role = 'member'
     where account_id = tests.account_id('locked-keys') and user_id = tests.get_uid('ak_l_admin') $$,
  'a locked team''s owner demotes a key holder'
);
select throws_ok(
  $$ update public.api_key set name = 'Renamed' where key_prefix = 'odb_lo' $$,
  '42501', 'team is read-only', 'a locked team cannot rename a key'
);
select throws_ok(
  $$ update public.api_key set revoked_at = now(), name = 'Renamed' where key_prefix = 'odb_lo' $$,
  '42501', 'team is read-only', 'a locked team cannot change anything else while revoking'
);
select throws_ok(
  $$ update public.api_key set revoked_at = null where key_prefix = 'odb_la' $$,
  '42501', 'a revoked API key stays revoked', 'a locked team cannot un-revoke a key'
);
select lives_ok(
  $$ update public.api_key set revoked_at = now() where key_prefix = 'odb_lo' $$,
  'a locked team revokes a key'
);

select tests.login_as_service_role();
select results_eq(
  $$ select key_prefix, revoked_at is not null, name::text from public.api_key
     where account_id = tests.account_id('locked-keys') order by key_prefix $$,
  $$ values ('odb_la'::text, true, 'Locked admin'::text), ('odb_lo'::text, true, 'Locked owner'::text) $$,
  'on a locked team the demoted holder''s key is revoked and nothing else changed'
);
reset role;

select lives_ok(
  $$ delete from public.accounts where id = tests.account_id('keys-co') $$,
  'a team with live keys can still be deleted'
);

select * from finish();
rollback;
