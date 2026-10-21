begin;
select no_plan();

-- Team "AG Team" owns deal g1, sitting at loi_accepted with no counsel.
select tests.create_user('ag_owner');
select tests.create_user('ag_buyer_law');
select tests.create_user('ag_seller_law');

select tests.login_as_service_role();
select public.create_team_account('AG Team', tests.get_uid('ag_owner'), 'ag-team');
select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
  'a9000000-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
    'description', 'Gate deal', 'stage', 'loi_accepted'), null, 'service');

-- ---- No skipping past pa_accepted ----
select tests.login_as('ag_owner');
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "announcement"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'a deal cannot jump past pa_accepted to announcement without counsel'
);
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "integration"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'a deal cannot jump past pa_accepted to integration without counsel'
);

select tests.login_as_service_role();
insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values
  (tests.account_id('ag-team'), 'a9000000-0000-0000-0000-0000000000a1', 'buyer',
    tests.get_uid('ag_buyer_law'), 'ag_buyer_law@tuckin.test'),
  (tests.account_id('ag-team'), 'a9000000-0000-0000-0000-0000000000a1', 'seller',
    tests.get_uid('ag_seller_law'), 'ag_seller_law@tuckin.test');

select tests.login_as('ag_owner');
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "announcement"}') $$,
  'a deal with counsel on both sides moves past pa_accepted'
);

select tests.login_as_service_role();
delete from public.deal_counsel
where deal_id = 'a9000000-0000-0000-0000-0000000000a1' and side = 'seller';

select tests.login_as('ag_owner');
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "integration"}') $$,
  'a deal already past pa_accepted moves on after counsel are removed'
);
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "pa_submitted"}') $$,
  'a deal steps back before pa_accepted without counsel'
);
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a1', 'deal',
       'a9000000-0000-0000-0000-0000000000a1', 'deal.stage_changed', '{"stage": "integration"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'a deal that stepped back cannot skip past pa_accepted again without counsel'
);

-- ---- The gate follows stage meaning, not position ----
-- g2 sits at loi_accepted with no counsel. The team moves announcement ahead
-- of pa_accepted and due_diligence behind it.
select tests.login_as_service_role();
select public.append_deal_event('a9000000-0000-0000-0000-0000000000a2', 'deal',
  'a9000000-0000-0000-0000-0000000000a2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
    'description', 'Reordered gate deal', 'stage', 'loi_accepted'), null, 'service');

reset role;
update public.pipeline_stage set sort_order = 100
where account_id = tests.account_id('ag-team') and key = 'announcement';
update public.pipeline_stage set sort_order = 9
where account_id = tests.account_id('ag-team') and key = 'due_diligence';
update public.pipeline_stage set sort_order = 6
where account_id = tests.account_id('ag-team') and key = 'announcement';

select tests.login_as('ag_owner');
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a2', 'deal',
       'a9000000-0000-0000-0000-0000000000a2', 'deal.stage_changed', '{"stage": "announcement"}') $$,
  'P0001',
  'An APA needs buyer''s counsel and seller''s counsel on the deal',
  'announcement stays gated when the team orders it before pa_accepted'
);
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a2', 'deal',
       'a9000000-0000-0000-0000-0000000000a2', 'deal.stage_changed', '{"stage": "due_diligence"}') $$,
  'due_diligence stays open when the team orders it after pa_accepted'
);

-- ---- A team without a pa_accepted stage has no stage gate ----
select tests.create_user('ag_renamed_owner');
select tests.login_as_service_role();
select public.create_team_account('AG Renamed', tests.get_uid('ag_renamed_owner'), 'ag-renamed');
reset role;
update public.pipeline_stage set key = 'pa_signed'
where account_id = tests.account_id('ag-renamed') and key = 'pa_accepted';
select tests.login_as_service_role();
select public.append_deal_event('a9000000-0000-0000-0000-0000000000b1', 'deal',
  'a9000000-0000-0000-0000-0000000000b1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ag-renamed'), 'owner_user_id', tests.get_uid('ag_renamed_owner'),
    'description', 'Renamed gate deal', 'stage', 'loi_accepted'), null, 'service');

select tests.login_as('ag_renamed_owner');
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000b1', 'deal',
       'a9000000-0000-0000-0000-0000000000b1', 'deal.stage_changed', '{"stage": "announcement"}') $$,
  'a team that renamed pa_accepted moves to announcement without counsel'
);
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000b2', 'deal',
       'a9000000-0000-0000-0000-0000000000b2', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ag-renamed'), 'owner_user_id', tests.get_uid('ag_renamed_owner'),
         'description', 'Renamed late deal', 'stage', 'integration')) $$,
  'a team that renamed pa_accepted creates a deal at integration'
);

-- ---- No new deal at pa_accepted or later ----
select tests.login_as('ag_owner');
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a3', 'deal',
       'a9000000-0000-0000-0000-0000000000a3', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
         'description', 'Late deal', 'stage', 'pa_accepted')) $$,
  'P0001',
  'A new deal cannot start at PA Accepted or a later stage',
  'a user cannot create a deal at pa_accepted'
);
select throws_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a3', 'deal',
       'a9000000-0000-0000-0000-0000000000a3', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
         'description', 'Late deal', 'stage', 'integration')) $$,
  'P0001',
  'A new deal cannot start at PA Accepted or a later stage',
  'a user cannot create a deal past pa_accepted'
);
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a4', 'deal',
       'a9000000-0000-0000-0000-0000000000a4', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
         'description', 'Submitted deal', 'stage', 'pa_submitted')) $$,
  'a user creates a deal at pa_submitted'
);

select tests.login_as_service_role();
select lives_ok(
  $$ select public.append_deal_event('a9000000-0000-0000-0000-0000000000a5', 'deal',
       'a9000000-0000-0000-0000-0000000000a5', 'deal.created',
       jsonb_build_object('account_id', tests.account_id('ag-team'), 'owner_user_id', tests.get_uid('ag_owner'),
         'description', 'Seeded late deal', 'stage', 'integration'), null, 'service') $$,
  'seeding and system imports create a deal past pa_accepted'
);

select * from finish();
rollback;
