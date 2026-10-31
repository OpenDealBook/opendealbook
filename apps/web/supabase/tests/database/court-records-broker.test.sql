begin;
select no_plan();

select tests.create_user('crb_owner');
select tests.login_as_service_role();
select public.create_team_account('Broker A', tests.get_uid('crb_owner'), 'crb-team-a');
select public.create_team_account('Broker B', tests.get_uid('crb_owner'), 'crb-team-b');
insert into public.firm (id, account_id, name, website) values
  ('0e1f0000-0000-4000-8000-00000000000a', tests.account_id('crb-team-a'), 'Rowan Fixture Plumbing', 'rowan.example'),
  ('0e1f0000-0000-4000-8000-00000000000b', tests.account_id('crb-team-b'), 'Harbour Supply', 'harbour.example');

select tests.login_as('crb_owner');
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', 'k') $$,
  '22023', 'pick Baselayer or Middesk', 'court records need a broker'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', 'k', p_provider => 'lexisnexis') $$,
  '22023', 'pick Baselayer or Middesk', 'court records take only Baselayer or Middesk'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('crb-team-a'), 'courts', 'k', p_provider => 'baselayer') $$,
  '22023', 'only court records pick a broker', 'other kinds keep their fixed provider'
);

select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', 'baselayer-key-a', p_provider => 'baselayer');
select tests.login_as_service_role();
select results_eq(
  $$ select api_key, provider, base_url from public.provider_key(tests.account_id('crb-team-a'), 'court_records') $$,
  $$ values ('baselayer-key-a', 'baselayer', 'https://api.baselayer.com') $$,
  'a Baselayer key is read back at the Baselayer address'
);

select tests.login_as('crb_owner');
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', null, p_provider => 'middesk') $$,
  '23514', 'paste an API key', 'switching brokers needs the new broker''s key'
);
select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', 'middesk-key-a', p_provider => 'middesk');
select tests.login_as_service_role();
select results_eq(
  $$ select api_key, provider, base_url from public.provider_key(tests.account_id('crb-team-a'), 'court_records') $$,
  $$ values ('middesk-key-a', 'middesk', 'https://api.middesk.com/v1') $$,
  'saving Middesk replaces Baselayer as the team''s broker'
);
select is(
  (select count(*) from vault.decrypted_secrets where decrypted_secret = 'baselayer-key-a'),
  0::bigint, 'the replaced Baselayer key is gone from the vault'
);
select is(
  (select count(*) from public.provider_credential where account_id = tests.account_id('crb-team-a') and kind = 'court_records'),
  1::bigint, 'a team connects one broker'
);

insert into public.middesk_business (account_id, firm_id, business_id)
values (tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000a', 'mdsk-biz-rowan');
select throws_ok(
  $$ insert into public.middesk_business (account_id, firm_id, business_id)
     values (tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000b', 'mdsk-biz-harbour') $$,
  '23503', null, 'a Middesk business belongs to a firm of the same team'
);

select tests.login_as('crb_owner');
select throws_ok(
  $$ select business_id from public.middesk_business $$,
  '42501', null, 'team owners never read Middesk business ids'
);

select tests.login_as_service_role();
delete from public.firm where id = '0e1f0000-0000-4000-8000-00000000000a';
select is_empty(
  $$ select 1 from public.middesk_business where firm_id = '0e1f0000-0000-4000-8000-00000000000a' $$,
  'deleting a firm forgets its Middesk business'
);

select tests.login_as_service_role();
insert into public.firm (id, account_id, name, website) values
  ('0e1f0000-0000-4000-8000-00000000000c', tests.account_id('crb-team-a'), 'Kestrel Roofing', 'kestrel.example');
select results_eq(
  $$ select business_id, claimed from public.claim_middesk_business(tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000c') $$,
  $$ values (null::text, true) $$,
  'the first run to check a firm claims it'
);
select results_eq(
  $$ select business_id, claimed from public.claim_middesk_business(tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000c') $$,
  $$ values (null::text, false) $$,
  'a second run waits while the claim is fresh'
);
update public.middesk_business set claimed_at = now() - interval '3 minutes'
where firm_id = '0e1f0000-0000-4000-8000-00000000000c';
select results_eq(
  $$ select business_id, claimed from public.claim_middesk_business(tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000c') $$,
  $$ values (null::text, true) $$,
  'a claim older than 2 minutes is taken over'
);
update public.middesk_business set business_id = 'mdsk-biz-kestrel', claimed_at = now() - interval '1 day'
where firm_id = '0e1f0000-0000-4000-8000-00000000000c';
select results_eq(
  $$ select business_id, claimed from public.claim_middesk_business(tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000c') $$,
  $$ values ('mdsk-biz-kestrel'::text, false) $$,
  'a firm with a Middesk business returns it, however old'
);
insert into public.middesk_business (account_id, firm_id, business_id)
values (tests.account_id('crb-team-b'), '0e1f0000-0000-4000-8000-00000000000b', 'mdsk-biz-harbour');

select tests.login_as('crb_owner');
select throws_ok(
  $$ select * from public.claim_middesk_business(tests.account_id('crb-team-a'), '0e1f0000-0000-4000-8000-00000000000c') $$,
  '42501', null, 'team owners never claim Middesk businesses'
);
select public.save_provider_credential(tests.account_id('crb-team-a'), 'court_records', 'baselayer-key-a2', p_provider => 'baselayer');
select tests.login_as_service_role();
select is_empty(
  $$ select 1 from public.middesk_business where account_id = tests.account_id('crb-team-a') $$,
  'saving a court records key forgets the team''s Middesk businesses'
);
select isnt_empty(
  $$ select 1 from public.middesk_business where account_id = tests.account_id('crb-team-b') $$,
  'other teams keep theirs'
);

select * from finish();
rollback;
