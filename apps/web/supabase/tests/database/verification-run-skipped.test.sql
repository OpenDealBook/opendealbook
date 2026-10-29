begin;
select no_plan();

select tests.create_user('vrs_owner');
select tests.login_as_service_role();
select public.create_team_account('VRS Team', tests.get_uid('vrs_owner'), 'vrs-team');

select public.append_deal_event('dddddddd-0000-0000-0000-0000000000a1', 'deal',
  'dddddddd-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('vrs-team'), 'firm_id', tests.create_firm(tests.account_id('vrs-team')),
    'owner_user_id', tests.get_uid('vrs_owner'), 'description', 'VRS Deal'), null, 'service');

insert into public.verification_run (id, account_id, deal_id, status, trigger)
values ('dddddddd-0000-0000-0000-000000000011', tests.account_id('vrs-team'),
  'dddddddd-0000-0000-0000-0000000000a1', 'running', 'ingest');

select lives_ok(
  $$ update public.verification_run
     set status = 'skipped', skipped_reason = 'The monthly AI limit is reached', finished_at = now()
     where id = 'dddddddd-0000-0000-0000-000000000011' $$,
  'a running verification run can be marked skipped'
);

select is(
  (select row(status::text, skipped_reason)::text from public.verification_run
   where id = 'dddddddd-0000-0000-0000-000000000011'),
  row('skipped', 'The monthly AI limit is reached')::text,
  'a skipped run keeps the reason it was skipped'
);

select * from finish();
rollback;
