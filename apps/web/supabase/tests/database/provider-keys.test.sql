begin;
select no_plan();

select tests.create_user('pk_a_owner');
select tests.create_user('pk_b_owner');
select tests.login_as_service_role();
select public.create_team_account('Keys A', tests.get_uid('pk_a_owner'), 'pk-team-a');
select public.create_team_account('Keys B', tests.get_uid('pk_b_owner'), 'pk-team-b');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('pk-team-b'), tests.get_uid('pk_a_owner'), 'member');

select tests.login_as('pk_b_owner');
select public.save_provider_credential(tests.account_id('pk-team-b'), 'email_lookup', 'apify-key-b', null);
select public.save_provider_credential(tests.account_id('pk-team-b'), 'letters', 'lob-key-b', null);

select tests.login_as_service_role();
create temp table b_secret as
select api_key_secret_id as id from public.provider_credential
where account_id = tests.account_id('pk-team-b') and kind = 'letters';
grant select on b_secret to authenticated;

select results_eq(
  $$ select kind::text, provider, base_url, actor_id from public.provider_credential
     where account_id = tests.account_id('pk-team-b') order by kind $$,
  $$ values ('email_lookup', 'apify', 'https://api.apify.com/v2', 'vdrmota/contact-info-scraper'),
            ('letters', 'lob', 'https://api.lob.com/v1', null) $$,
  'each kind uses its fixed provider and address, and email lookup starts on the default actor'
);
select results_eq(
  $$ select api_key, actor_id, provider, base_url from public.provider_key(tests.account_id('pk-team-b'), 'email_lookup') $$,
  $$ values ('apify-key-b', 'vdrmota/contact-info-scraper', 'apify', 'https://api.apify.com/v2') $$,
  'the service role reads the email lookup key, actor, provider and address'
);
select results_eq(
  $$ select api_key, actor_id, provider, base_url from public.provider_key(tests.account_id('pk-team-b'), 'letters') $$,
  $$ values ('lob-key-b', null::text, 'lob', 'https://api.lob.com/v1') $$,
  'the service role reads the letters key, provider and address'
);
select hasnt_column(
  'public', 'provider_credential', 'api_key_secret_ref',
  'keys live only in the vault, never as an env reference'
);
select is_empty(
  $$ select * from public.provider_key(tests.account_id('pk-team-a'), 'letters') $$,
  'a team without a key gets none'
);

select tests.login_as('pk_a_owner');
select results_eq(
  $$ select kind::text, provider from public.provider_credential where account_id = tests.account_id('pk-team-b') order by kind $$,
  $$ values ('email_lookup', 'apify'), ('letters', 'lob') $$,
  'a member sees which providers their team uses'
);
select throws_ok(
  $$ select api_key_secret_id from public.provider_credential $$,
  '42501', null, 'a member cannot read the vault secret id'
);
select throws_ok(
  $$ select * from public.provider_key(tests.account_id('pk-team-b'), 'letters') $$,
  '42501', null, 'a member cannot read the key'
);
select throws_ok(
  $$ insert into public.provider_credential (account_id, kind, provider, api_key_secret_id)
     values (tests.account_id('pk-team-a'), 'letters', 'lob', (select id from b_secret)) $$,
  '42501', null, 'a settings manager cannot point their team at another team''s key'
);
select throws_ok(
  $$ delete from public.provider_credential where account_id = tests.account_id('pk-team-b') $$,
  '42501', null, 'a member cannot delete another team''s keys'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-b'), 'letters', 'lob-key-stolen', null) $$,
  '42501', null, 'a member cannot change their team''s keys'
);
select throws_ok(
  $$ select public.disconnect_provider_credential(tests.account_id('pk-team-b'), 'letters') $$,
  '42501', null, 'a member cannot disconnect their team''s keys'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-a'), 'letters', null, null) $$,
  '23514', 'paste an API key', 'a first save needs a key'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-a'), 'registry', 'reg-key', null) $$,
  '22023', 'registry takes no key', 'registry has no key'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-a'), 'email_lookup', 'k', 'acme/../../admin') $$,
  '22P02', 'use an Apify actor id', 'an actor id is a plain Apify actor name'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-a'), 'letters', 'k', 'acme~scraper') $$,
  '22023', 'only email lookup takes an actor', 'letters take no actor'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-a'), 'courts', 'k', 'acme~scraper') $$,
  '22023', 'only email lookup takes an actor', 'federal courts take no actor'
);
select public.save_provider_credential(tests.account_id('pk-team-a'), 'courts', 'cl-token-a');
select tests.login_as_service_role();
select results_eq(
  $$ select api_key, actor_id, provider, base_url from public.provider_key(tests.account_id('pk-team-a'), 'courts') $$,
  $$ values ('cl-token-a', null::text, 'courtlistener', 'https://www.courtlistener.com/api/rest/v4') $$,
  'federal courts use the team''s CourtListener token at the CourtListener v4 address'
);

select tests.login_as('pk_b_owner');
select public.save_provider_credential(tests.account_id('pk-team-b'), 'email_lookup', null, 'acme~site-contacts');
select tests.login_as_service_role();
select results_eq(
  $$ select api_key, actor_id from public.provider_key(tests.account_id('pk-team-b'), 'email_lookup') $$,
  $$ values ('apify-key-b', 'acme/site-contacts') $$,
  'changing the actor keeps the stored key, and the actor is stored with a slash'
);

update public.provider_credential set base_url = 'https://api.apify.com/v1'
where account_id = tests.account_id('pk-team-b') and kind = 'email_lookup';
select tests.login_as('pk_b_owner');
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('pk-team-b'), 'email_lookup', null, null) $$,
  '23514', 'paste an API key', 'a changed provider address needs a fresh key'
);

select public.disconnect_provider_credential(tests.account_id('pk-team-b'), 'letters');
select tests.login_as_service_role();
select is(
  (select count(*) from vault.secrets where id = (select id from b_secret)),
  0::bigint, 'disconnecting deletes the key from the vault'
);
select is_empty(
  $$ select 1 from public.provider_credential where account_id = tests.account_id('pk-team-b') and kind = 'letters' $$,
  'disconnecting removes the provider'
);

create temp table b_lookup_secret as
select api_key_secret_id as id from public.provider_credential
where account_id = tests.account_id('pk-team-b') and kind = 'email_lookup';
delete from public.accounts where slug = 'pk-team-b';
select is(
  (select count(*) from vault.secrets where id = (select id from b_lookup_secret)),
  0::bigint, 'deleting a team deletes its provider keys from the vault'
);

select * from finish();
rollback;
