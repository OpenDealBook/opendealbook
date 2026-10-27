begin;
select no_plan();

select tests.create_user('sd_owner');
select tests.login_as_service_role();
select public.create_team_account('Sample Team', tests.get_uid('sd_owner'), 'sample-team');

select is(
  (select sample_deals_seeded_at from public.accounts where id = tests.account_id('sample-team')),
  null,
  'a new team has not had its sample deals yet'
);

select isnt(
  public.seed_sample_deals(tests.account_id('sample-team'), tests.get_uid('sd_owner'), true),
  null,
  'the first seed hands back the sample document to store'
);

select results_eq(
  $$ select count(*)::int from public.deal where account_id = tests.account_id('sample-team') $$,
  $$ values (4) $$,
  'four sample deals are seeded'
);
select results_eq(
  $$ select count(*)::int from public.dr_document d join public.deal x on x.id = d.deal_id
     where x.account_id = tests.account_id('sample-team') $$,
  $$ values (1) $$,
  'one sample document is recorded'
);
select isnt(
  (select sample_deals_seeded_at from public.accounts where id = tests.account_id('sample-team')),
  null,
  'the team is marked as seeded'
);
select is_empty(
  $$ select d.id from public.deal d where d.account_id = tests.account_id('sample-team')
     and (d.capture_method <> 'example'
       or d.stage not in (select s.key from public.pipeline_stage s where s.account_id = d.account_id)) $$,
  'every sample deal is marked as an example at a stage the pipeline has'
);
select is_empty(
  $$ select d.storage_path from public.dr_document d join public.deal x on x.id = d.deal_id
     where x.account_id = tests.account_id('sample-team') and d.storage_path !~ '^deal/[0-9a-f-]+/[0-9a-f-]+-[a-z0-9.-]+$' $$,
  'the sample file is stored under a key storage accepts'
);

-- deleted examples never come back on a later visit
reset role;
delete from public.deal where account_id = tests.account_id('sample-team');
delete from public.firm where account_id = tests.account_id('sample-team');
select tests.login_as_service_role();
select is(
  public.seed_sample_deals(tests.account_id('sample-team'), tests.get_uid('sd_owner'), true),
  null,
  'a later visit seeds nothing'
);
select results_eq(
  $$ select count(*)::int from public.firm where account_id = tests.account_id('sample-team') $$,
  $$ values (0) $$,
  'deleted examples stay deleted'
);

-- a failed seed leaves nothing behind
select public.create_team_account('Broken Team', tests.get_uid('sd_owner'), 'broken-team');
select throws_ok(
  $$ select public.seed_sample_deals(tests.account_id('broken-team'), '00000000-0000-0000-0000-00000000dead', true) $$,
  null, null,
  'seeding for an unknown person fails'
);
select results_eq(
  $$ select count(*)::int from public.firm where account_id = tests.account_id('broken-team') $$,
  $$ values (0) $$,
  'a failed seed leaves no sample firm'
);
select is(
  (select sample_deals_seeded_at from public.accounts where id = tests.account_id('broken-team')),
  null,
  'a failed seed leaves the team unmarked'
);

-- reloading replaces the examples and leaves real deals alone
select public.create_team_account('Reload Team', tests.get_uid('sd_owner'), 'reload-team');
select public.append_deal_event('5d000000-0000-0000-0000-0000000000d1', 'deal',
  '5d000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('reload-team'), 'firm_id', tests.create_firm(tests.account_id('reload-team')), 'owner_user_id', tests.get_uid('sd_owner'),
    'description', 'A real deal'), null, 'service');
select public.seed_sample_deals(tests.account_id('reload-team'), tests.get_uid('sd_owner'), true);
create temporary table first_examples as
  select id from public.deal where account_id = tests.account_id('reload-team') and capture_method = 'example';
create temporary table first_files as
  select d.storage_path from public.dr_document d join first_examples f on f.id = d.deal_id;
create temporary table reloaded as
  select public.seed_sample_deals(tests.account_id('reload-team'), tests.get_uid('sd_owner'), false) as result;

select isnt((select result from reloaded), null, 'reloading seeds a fresh set');
select results_eq(
  $$ select jsonb_array_elements_text(result -> 'removed_paths') from reloaded $$,
  $$ select storage_path from first_files $$,
  'a reload hands back the old example files to remove from storage'
);
select results_eq(
  $$ select id from public.deal where account_id = tests.account_id('reload-team')
     and (capture_method is distinct from 'example') $$,
  $$ values ('5d000000-0000-0000-0000-0000000000d1'::uuid) $$,
  'the real deal survives a reload'
);
select results_eq(
  $$ select count(*)::int from public.deal where account_id = tests.account_id('reload-team') and capture_method = 'example' $$,
  $$ values (4) $$,
  'a reload leaves exactly one set of examples'
);
select is_empty(
  $$ select id from first_examples intersect
     select id from public.deal where account_id = tests.account_id('reload-team') $$,
  'the old examples are gone'
);
select is_empty(
  $$ select e.id from public.deal_event e join first_examples f on f.id = e.deal_id $$,
  'the old examples leave no history behind to replay'
);
select results_eq(
  $$ select count(*)::int from public.firm where account_id = tests.account_id('reload-team') and name like '[Example]%' $$,
  $$ values (4) $$,
  'a reload leaves exactly one set of example businesses'
);

select * from finish();
rollback;
