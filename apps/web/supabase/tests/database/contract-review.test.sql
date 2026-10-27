begin;
select no_plan();

-- Team "CR Team" owns deal d1, which has counsel on both sides, and deal d2,
-- which has none. cr_owner owns the team; cr_manager manages deals; cr_member
-- is on the team without deals.manage. On d1's APA, v1 is a hidden buyer
-- draft, v2 is shared with the seller side and v3 is a later version. d1 also
-- has an LOI at version l1. d2's APA is at version w1.
select tests.create_user('cr_owner');
select tests.create_user('cr_manager');
select tests.create_user('cr_member');
select tests.create_user('cr_buyer_law');
select tests.create_user('cr_seller_law');
select tests.create_user('cr_stranger');
select tests.create_user('cr_lead');
select tests.create_user('cr_admin');

select tests.login_as_service_role();
select public.create_team_account('CR Team', tests.get_uid('cr_owner'), 'cr-team');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d1', 'deal',
  'c7000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cr-team'), 'firm_id', tests.create_firm(tests.account_id('cr-team')), 'owner_user_id', tests.get_uid('cr_owner'),
    'description', 'Reviewed deal'), null, 'service');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d2', 'deal',
  'c7000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cr-team'), 'firm_id', tests.create_firm(tests.account_id('cr-team')), 'owner_user_id', tests.get_uid('cr_owner'),
    'description', 'Deal without counsel'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values
  (tests.get_uid('cr_manager'), tests.account_id('cr-team'), 'owner'),
  (tests.get_uid('cr_member'), tests.account_id('cr-team'), 'member'),
  (tests.get_uid('cr_lead'), tests.account_id('cr-team'), 'deal_lead'),
  (tests.get_uid('cr_admin'), tests.account_id('cr-team'), 'admin');

insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values
  (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('cr_buyer_law'), 'cr_buyer_law@tuckin.test'),
  (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('cr_seller_law'), 'cr_seller_law@tuckin.test');

insert into public.contract (id, deal_id, account_id, type)
values
  ('c7000000-0000-0000-0000-0000000000c1', 'c7000000-0000-0000-0000-0000000000d1', tests.account_id('cr-team'), 'apa'),
  ('c7000000-0000-0000-0000-0000000000c2', 'c7000000-0000-0000-0000-0000000000d1', tests.account_id('cr-team'), 'loi'),
  ('c7000000-0000-0000-0000-0000000000c3', 'c7000000-0000-0000-0000-0000000000d2', tests.account_id('cr-team'), 'apa');

insert into public.contract_version (id, contract_id, account_id, version, source, party, shared_at)
values
  ('c7000000-0000-0000-0000-0000000000a1', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cr-team'), 1, 'upload', 'buyer', null),
  ('c7000000-0000-0000-0000-0000000000a2', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cr-team'), 2, 'upload', 'buyer', now()),
  ('c7000000-0000-0000-0000-0000000000a3', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cr-team'), 3, 'upload', 'buyer', now()),
  ('c7000000-0000-0000-0000-0000000000b1', 'c7000000-0000-0000-0000-0000000000c2', tests.account_id('cr-team'), 1, 'upload', 'buyer', now()),
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-0000000000c3', tests.account_id('cr-team'), 1, 'upload', 'buyer', now());

-- ---- The gate by default ----
select tests.login_as('cr_manager');

select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  false,
  'an APA version with no review is not ready to sign'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000b1'),
  true,
  'an LOI version is ready to sign without review by default'
);

-- ---- Asking for review ----
select lives_ok(
  $$ insert into public.contract_review_request (account_id, contract_version_id)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2') $$,
  'a deal manager asks counsel to review a version'
);
select results_eq(
  $$ select requested_by, contract_version_id from public.contract_review_request
     where contract_version_id = 'c7000000-0000-0000-0000-0000000000a2' $$,
  $$ values (tests.get_uid('cr_manager'), 'c7000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'the request records who asked and for which version'
);
select isnt(
  (select requested_at from public.contract_review_request),
  null,
  'the request records when it was asked'
);
select lives_ok(
  $$ insert into public.contract_review_request (account_id, contract_version_id)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a1') $$,
  'a deal manager asks for review of an internal draft'
);

select tests.login_as('cr_buyer_law');
select results_eq(
  $$ select contract_version_id from public.contract_review_request order by contract_version_id $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a1'::uuid), ('c7000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'buyer''s counsel read the review requests on the deal'
);
select tests.login_as('cr_seller_law');
select results_eq(
  $$ select contract_version_id from public.contract_review_request $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'seller''s counsel read review requests only on versions shown to the seller side'
);

-- ---- Who may ask whether a version is ready ----
select lives_ok(
  $$ select public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2') $$,
  'counsel on the deal may ask whether a version is ready to sign'
);
select tests.login_as('cr_stranger');
select throws_ok(
  $$ select public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'someone outside the deal cannot ask whether a version is ready to sign'
);
select tests.login_as_service_role();
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  false,
  'the server may ask whether a version is ready to sign'
);

-- ---- Counsel decide their own side ----
select tests.login_as('cr_buyer_law');

select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, note, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2', 'buyer', 'approved', 'Fine by us',
       tests.get_uid('cr_buyer_law'), false) $$,
  'buyer''s counsel approves a version for the buyer side'
);
select throws_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2', 'seller', 'approved',
       tests.get_uid('cr_buyer_law'), false) $$,
  '42501', null, 'buyer''s counsel cannot decide for the seller side'
);
select throws_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', 'buyer', 'approved',
       tests.get_uid('cr_buyer_law'), true) $$,
  '42501', null, 'counsel never record a decision as made without counsel'
);

select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  false,
  'one side approving is not enough'
);

select tests.login_as('cr_seller_law');

select throws_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a1', 'seller', 'approved',
       tests.get_uid('cr_seller_law'), false) $$,
  '42501', null, 'seller''s counsel cannot decide on a version the seller side was never shown'
);
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, note, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2', 'seller', 'approved_with_comments',
       'See the indemnity cap', tests.get_uid('cr_seller_law'), false) $$,
  'seller''s counsel approves a shared version with comments'
);
select results_eq(
  $$ select side::text, decision::text from public.contract_review_decision $$,
  $$ values ('seller', 'approved_with_comments') $$,
  'seller''s counsel read only their own side''s decisions'
);

select tests.login_as('cr_manager');

select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  true,
  'a version both sides approved is ready to sign'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a3'),
  false,
  'approvals never carry over to a new version'
);

select tests.login_as('cr_buyer_law');
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2', 'buyer', 'changes_needed',
       tests.get_uid('cr_buyer_law'), false) $$,
  'buyer''s counsel changes their decision on the same version'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  false,
  'the latest decision counts, so the version is no longer ready'
);
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a2', 'buyer', 'approved',
       tests.get_uid('cr_buyer_law'), false) $$,
  'buyer''s counsel approves the same version again'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a2'),
  true,
  'the latest approval makes the version ready again'
);
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', 'buyer', 'changes_needed',
       tests.get_uid('cr_buyer_law'), false) $$,
  'buyer''s counsel asks for changes on the next version'
);
select tests.login_as('cr_seller_law');
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', 'seller', 'approved',
       tests.get_uid('cr_seller_law'), false) $$,
  'seller''s counsel approves the next version'
);
select tests.login_as('cr_manager');
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a3'),
  false,
  'a version a side wants changed is not ready to sign'
);

-- ---- The team with counsel on its side ----
select throws_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a1', 'buyer', 'approved',
       tests.get_uid('cr_manager'), true) $$,
  '42501', null, 'a deal manager cannot confirm for the buyer side while it has counsel'
);
select results_eq(
  $$ select side::text, decision::text from public.contract_review_decision
     where contract_version_id = 'c7000000-0000-0000-0000-0000000000a2' order by decided_at $$,
  $$ values ('buyer', 'approved'), ('seller', 'approved_with_comments'), ('buyer', 'changes_needed'), ('buyer', 'approved') $$,
  'a deal manager reads every decision on both sides, history included'
);

select tests.login_as('cr_member');
select results_eq(
  $$ select count(*)::int from public.contract_review_decision
     where contract_version_id = 'c7000000-0000-0000-0000-0000000000a2' $$,
  $$ values (4) $$,
  'any team member reads every decision on both sides'
);
select results_eq(
  $$ select count(*)::int from public.contract_review_request $$,
  $$ values (2) $$,
  'any team member reads the review requests'
);
select throws_ok(
  $$ insert into public.contract_review_request (account_id, contract_version_id)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, 'a team member without deals.manage cannot ask for review'
);

-- ---- Sides without counsel confirm for themselves ----
select tests.login_as('cr_manager');
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000e1', 'buyer', 'approved',
       tests.get_uid('cr_manager'), true) $$,
  'a deal manager confirms for a buyer side without counsel'
);
select throws_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000e1', 'seller', 'approved',
       tests.get_uid('cr_manager'), true) $$,
  '42501', null, 'a deal manager cannot confirm for the seller side'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000e1'),
  false,
  'the seller side has still to confirm'
);

select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.contract_review_decision (account_id, contract_version_id, side, decision, decided_by, without_counsel)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000e1', 'seller', 'approved',
       tests.get_uid('cr_owner'), true) $$,
  'the server records the seller''s own confirmation'
);
select tests.login_as('cr_manager');
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000e1'),
  true,
  'both parties confirming without counsel makes the version ready'
);
select results_eq(
  $$ select bool_and(without_counsel) from public.contract_review_decision
     where contract_version_id = 'c7000000-0000-0000-0000-0000000000e1' $$,
  $$ values (true) $$,
  'the record shows the version was approved without counsel'
);

-- ---- Sending anyway ----
select throws_ok(
  $$ insert into public.contract_signing_override (account_id, contract_version_id, reason)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', null) $$,
  '23502', null, 'an override needs a reason'
);
select throws_ok(
  $$ insert into public.contract_signing_override (account_id, contract_version_id, reason)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', '   ') $$,
  '23514', null, 'a blank reason is no reason'
);
select tests.login_as('cr_member');
select throws_ok(
  $$ insert into public.contract_signing_override (account_id, contract_version_id, reason)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', 'Closing tonight') $$,
  '42501', null, 'a team member without deals.manage cannot override'
);
select tests.login_as('cr_owner');
select lives_ok(
  $$ insert into public.contract_signing_override (account_id, contract_version_id, reason)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000a3', 'Closing tonight') $$,
  'the team owner sends for signature anyway, with a reason'
);
select results_eq(
  $$ select overridden_by, reason from public.contract_signing_override $$,
  $$ values (tests.get_uid('cr_owner'), 'Closing tonight') $$,
  'the override records who sent anyway and why'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a3'),
  true,
  'an overridden version is ready to sign'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a1'),
  false,
  'an override covers only its own version'
);
select tests.login_as('cr_member');
select results_eq(
  $$ select reason from public.contract_signing_override $$,
  $$ values ('Closing tonight') $$,
  'any team member reads the overrides'
);

-- ---- Gate settings ----
select tests.login_as('cr_manager');
select lives_ok(
  $$ insert into public.contract_review_gate_default_change (account_id, contract_type, required)
     values (tests.account_id('cr-team'), 'loi', true) $$,
  'a deal manager turns the gate on for the team''s LOIs'
);
select results_eq(
  $$ select changed_by, was_required, required from public.contract_review_gate_default_change $$,
  $$ values (tests.get_uid('cr_manager'), false, true) $$,
  'a team default change logs who made it, from and to'
);
select isnt(
  (select changed_at from public.contract_review_gate_default_change),
  null,
  'a team default change logs when it was made'
);
select throws_ok(
  $$ update public.contract_review_gate_default_change set required = false $$,
  '42501', null, 'the team default log cannot be rewritten'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000b1'),
  false,
  'the team default gates an LOI'
);

select lives_ok(
  $$ insert into public.deal_contract_review_gate_change (account_id, deal_id, contract_type, required)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d1', 'apa', false) $$,
  'a deal manager turns the APA gate off for one deal'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a1'),
  true,
  'the deal''s own setting overrides the team default'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000e1'),
  true,
  'another deal keeps the team default'
);
select lives_ok(
  $$ insert into public.deal_contract_review_gate_change (account_id, deal_id, contract_type, required)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d1', 'apa', true) $$,
  'a deal manager turns the APA gate back on'
);
select is(
  public.contract_version_signing_ready('c7000000-0000-0000-0000-0000000000a1'),
  false,
  'the latest deal change wins'
);
select results_eq(
  $$ select changed_by, was_required, required from public.deal_contract_review_gate_change
     order by changed_at, required $$,
  $$ values (tests.get_uid('cr_manager'), true, false), (tests.get_uid('cr_manager'), false, true) $$,
  'every deal change logs who made it, from and to'
);
select throws_ok(
  $$ update public.deal_contract_review_gate_change set required = false $$,
  '42501', null, 'the change log cannot be rewritten'
);

select tests.login_as('cr_member');
select throws_ok(
  $$ insert into public.deal_contract_review_gate_change (account_id, deal_id, contract_type, required)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d1', 'apa', false) $$,
  '42501', null, 'a team member without deals.manage cannot change a deal''s gate'
);

select tests.login_as('cr_member');
select throws_ok(
  $$ insert into public.contract_review_gate_default_change (account_id, contract_type, required)
     values (tests.account_id('cr-team'), 'apa', false) $$,
  '42501', null, 'a team member without deals.manage cannot change the team default'
);
select tests.login_as('cr_lead');
select throws_ok(
  $$ insert into public.contract_review_gate_default_change (account_id, contract_type, required)
     values (tests.account_id('cr-team'), 'apa', false) $$,
  '42501', null, 'a deal lead cannot change the team default'
);
select lives_ok(
  $$ insert into public.deal_contract_review_gate_change (account_id, deal_id, contract_type, required)
     values (tests.account_id('cr-team'), 'c7000000-0000-0000-0000-0000000000d2', 'loi', false) $$,
  'a deal lead still changes one deal''s gate'
);
select tests.login_as('cr_admin');
select lives_ok(
  $$ insert into public.contract_review_gate_default_change (account_id, contract_type, required)
     values (tests.account_id('cr-team'), 'apa', false) $$,
  'a team admin changes the team default'
);

-- ---- The deal's log ----
reset role;
select results_eq(
  $$ select event_type, count(*)::int from public.deal_event
     where deal_id = 'c7000000-0000-0000-0000-0000000000d1'
       and event_type in ('contract.review_requested', 'contract.review_decided',
         'contract.signing_overridden', 'deal.contract_review_gate_changed')
     group by event_type order by event_type $$,
  $$ values ('contract.review_decided', 6), ('contract.review_requested', 2),
            ('contract.signing_overridden', 1), ('deal.contract_review_gate_changed', 2) $$,
  'every request, decision, override and deal gate change is on the deal''s log'
);
select results_eq(
  $$ select payload ->> 'version_id', payload ->> 'id' from public.deal_event
     where deal_id = 'c7000000-0000-0000-0000-0000000000d1'
       and event_type = 'contract.signing_overridden' $$,
  $$ select contract_version_id::text, id::text from public.contract_signing_override
     where account_id = tests.account_id('cr-team') $$,
  'the logged event names the version and the row'
);

select * from finish();
rollback;
