begin;
select no_plan();

select enum_has_labels(
  'public', 'milestone_kind',
  array['loi_deadline', 'loi_signed', 'diligence_end', 'financing_contingency',
        'apa_signing', 'closing', 'effective', 'custom'],
  'LOI signed is a fixed milestone that follows the LOI deadline'
);

select tests.create_user('ls_owner');

select tests.login_as_service_role();
select public.create_team_account('LS Team', tests.get_uid('ls_owner'), 'ls-team');
select public.append_deal_event('7e100000-0000-0000-0000-0000000000d1', 'deal',
  '7e100000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ls-team'), 'owner_user_id', tests.get_uid('ls_owner'),
    'description', 'LOI signed deal'), null, 'service');

select tests.login_as('ls_owner');

select public.append_deal_event('7e100000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e100000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
  '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-02"}'::jsonb);
select public.append_deal_event('7e100000-0000-0000-0000-0000000000d1', 'deal_milestone',
  '7e100000-0000-0000-0000-0000000000c2', 'deal_milestone.set',
  '{"kind": "loi_deadline", "target_on": "2026-10-20", "actual_on": null}'::jsonb);

select results_eq(
  $$ select kind::text, actual_on, target_on, shared from public.deal_milestone
     where deal_id = '7e100000-0000-0000-0000-0000000000d1' order by kind $$,
  $$ values ('loi_deadline', null::date, '2026-10-20'::date, false),
            ('loi_signed', '2026-10-02'::date, null::date, true) $$,
  'LOI signed sits beside the LOI deadline and starts shared, as APA signing does'
);

select throws_ok(
  $$ select public.append_deal_event('7e100000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e100000-0000-0000-0000-0000000000c3', 'deal_milestone.set',
       '{"kind": "loi_signed", "target_on": null, "actual_on": "2026-10-03"}'::jsonb) $$,
  '23505',
  null,
  'a deal has one LOI signed milestone'
);

select * from finish();
rollback;
