begin;
select no_plan();

select tests.create_user('ps_owner');
select tests.create_user('ps_member');

select tests.login_as_service_role();
select public.create_team_account('PS Acct', tests.get_uid('ps_owner'), 'ps-acct');

-- ---- Default stages seeded at account creation ----
select is(
  (select count(*)::int from public.pipeline_stage where account_id = tests.account_id('ps-acct')),
  9,
  'a new team account is seeded with the 9 default pipeline stages'
);
select results_eq(
  $$ select key from public.pipeline_stage where account_id = tests.account_id('ps-acct') order by sort_order $$,
  $$ values ('sourcing'),('pre_nda'),('nda_signed'),('loi_submitted'),('loi_accepted'),('pa_submitted'),('pa_accepted'),('announcement'),('integration') $$,
  'default stages are seeded in the specified order'
);
select is(
  (select count(*)::int from public.pipeline_stage where account_id = tests.account_id('ps-acct') and is_terminal),
  0,
  'no seeded stage is terminal'
);

-- A personal account created through the auth trigger is seeded too.
select is(
  (select count(*)::int from public.pipeline_stage ps
     join public.accounts a on a.id = ps.account_id
     where a.primary_owner_user_id = tests.get_uid('ps_member') and a.is_personal_account),
  9,
  'a new personal account is also seeded with the default pipeline stages'
);

-- ---- deal.stage validated against the account pipeline ----
select tests.login_as('ps_owner');
select lives_ok(
  $$ select public.append_deal_event('cccccccc-0000-0000-0000-0000000000f1', 'deal',
       'cccccccc-0000-0000-0000-0000000000f1', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ps-acct'), 'description', 'defaults to sourcing')) $$,
  'a deal defaults to the sourcing stage which exists in the pipeline'
);
select throws_ok(
  $$ select public.append_deal_event('cccccccc-0000-0000-0000-0000000000f2', 'deal',
       'cccccccc-0000-0000-0000-0000000000f2', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ps-acct'), 'description', 'bad stage', 'stage', 'nonexistent')) $$,
  '23503',
  null,
  'a deal with a stage outside the account pipeline is rejected by the fk'
);

-- ---- Reordering a stage ----
select lives_ok(
  $$ update public.pipeline_stage set sort_order = 11 where account_id = tests.account_id('ps-acct') and key = 'integration' $$,
  'a member with deals.manage can reorder a stage'
);
select is(
  (select sort_order from public.pipeline_stage where account_id = tests.account_id('ps-acct') and key = 'integration'),
  11,
  'the reordered stage takes its new sort order'
);

select * from finish();
rollback;
