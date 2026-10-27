begin;
select no_plan();

select tests.create_user('lw_owner');
select tests.create_user('lw_member');
select tests.login_as_service_role();
select public.create_team_account('Lob Hooks', tests.get_uid('lw_owner'), 'lw-team');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('lw-team'), tests.get_uid('lw_member'), 'member');

select tests.login_as('lw_owner');
select lives_ok(
  $$ select public.save_provider_credential(tests.account_id('lw-team'), 'letters', 'lob-key', null, 'hook-secret') $$,
  'a settings manager saves the Lob key with its webhook secret'
);

select tests.login_as_service_role();
select is(
  public.letter_webhook_secret(tests.account_id('lw-team')),
  'hook-secret',
  'the service role reads the webhook secret'
);

select tests.login_as('lw_owner');
select public.save_provider_credential(tests.account_id('lw-team'), 'letters', 'lob-key-2', null, null);
select tests.login_as_service_role();
select is(
  public.letter_webhook_secret(tests.account_id('lw-team')),
  'hook-secret',
  'replacing the key keeps the webhook secret'
);
select results_eq(
  $$ select api_key from public.provider_key(tests.account_id('lw-team'), 'letters') $$,
  $$ values ('lob-key-2') $$,
  'the new key is stored'
);

select tests.login_as('lw_owner');
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('lw-team'), 'email_lookup', 'apify-key', null, 'hook') $$,
  '22023', 'only letters take a webhook secret', 'email lookup takes no webhook secret'
);

select tests.login_as('lw_member');
select throws_ok(
  $$ select public.letter_webhook_secret(tests.account_id('lw-team')) $$,
  '42501', null, 'a member cannot read the webhook secret'
);
select throws_ok(
  $$ select webhook_secret_id from public.provider_credential $$,
  '42501', null, 'a member cannot read the webhook secret id'
);

select tests.login_as_service_role();
create temp table hook_secret as
select webhook_secret_id as id from public.provider_credential
where account_id = tests.account_id('lw-team') and kind = 'letters';

select tests.login_as('lw_owner');
select public.disconnect_provider_credential(tests.account_id('lw-team'), 'letters');
select tests.login_as_service_role();
select is(
  (select count(*) from vault.secrets where id = (select id from hook_secret)),
  0::bigint, 'disconnecting deletes the webhook secret from the vault'
);

select * from finish();
rollback;
