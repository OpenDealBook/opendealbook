begin;
select no_plan();

select tests.create_user('lp_owner');
select tests.create_user('lp_member');
select tests.create_user('lp_outsider');

select tests.login_as_service_role();
select public.create_team_account('LP Team', tests.get_uid('lp_owner'), 'lp-team');
select public.create_team_account('LP Other', tests.get_uid('lp_outsider'), 'lp-other');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('lp-team'), tests.get_uid('lp_member'), 'member');

insert into public.public_business (id, name) values
  ('e7000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC'),
  ('e7000000-0000-0000-0000-0000000000b2', 'Bolt Roofing Inc'),
  ('e7000000-0000-0000-0000-0000000000b3', 'Cedar Paving Co'),
  ('e7000000-0000-0000-0000-0000000000b4', 'Delta HVAC LLC'),
  ('e7000000-0000-0000-0000-0000000000b5', 'Elm Landscaping'),
  ('e7000000-0000-0000-0000-0000000000b6', 'Fir Masonry LLC'),
  ('e7000000-0000-0000-0000-0000000000b7', 'Grove Electric LLC'),
  ('e7000000-0000-0000-0000-0000000000b8', 'Hill Bakery LLC'),
  ('e7000000-0000-0000-0000-0000000000b9', 'Iron Works LLC');

insert into public.ppp_loan (loan_number, business_id, borrower_name, jobs_reported, loan_amount) values
  ('lp-ppp-1', 'e7000000-0000-0000-0000-0000000000b1', 'Acme Plumbing', 12, 150000),
  ('lp-ppp-2', null, 'Bolt Roofing and Siding', 40, 900000);
insert into public.sba_loan (id, source_key, business_id, program, borrower_name, jobs_supported) values
  ('e7000000-0000-0000-0000-0000000005a1', 'lp-sba-1', 'e7000000-0000-0000-0000-0000000000b1', 'sba_7a', 'Acme Plumbing', 15),
  ('e7000000-0000-0000-0000-0000000005a2', 'lp-sba-2', null, 'sba_504', 'Acme Plumbing Holdings', 18);
insert into public.form_5500_filing (ack_id, business_id, ein, sponsor_name, participant_count, plan_year_begin) values
  ('lp-5500-1', 'e7000000-0000-0000-0000-0000000000b1', '123456789', 'Acme Plumbing', 20, '2023-01-01'),
  ('lp-5500-2', 'e7000000-0000-0000-0000-0000000000b1', '123456789', 'Acme Plumbing', 25, '2024-01-01');
insert into public.state_registry_entity (state, entity_number, business_id, name, formation_date, source, fetched_at) values
  ('TX', 'lp-1', 'e7000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC', '2001-05-01', 'api', now());

insert into public.business_match_review (account_id, business_id, sba_loan_id, score, status, reviewed_by, reviewed_at) values
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000b1', 'e7000000-0000-0000-0000-0000000005a2', 0.7, 'accepted', tests.get_uid('lp_owner'), now());
insert into public.business_match_review (account_id, business_id, ppp_loan_number, score) values
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000b2', 'lp-ppp-2', 0.7);

insert into public.firm (id, account_id, name, city, state, public_business_id) values
  ('e7000000-0000-0000-0000-0000000000f1', tests.account_id('lp-team'), 'Acme Plumbing', 'Austin', 'TX', 'e7000000-0000-0000-0000-0000000000b1'),
  ('e7000000-0000-0000-0000-0000000000f2', tests.account_id('lp-team'), 'Bolt Roofing', 'Tulsa', 'OK', 'e7000000-0000-0000-0000-0000000000b2'),
  ('e7000000-0000-0000-0000-0000000000f3', tests.account_id('lp-team'), 'Cedar Paving', null, null, 'e7000000-0000-0000-0000-0000000000b3'),
  ('e7000000-0000-0000-0000-0000000000f4', tests.account_id('lp-team'), 'Delta HVAC', null, null, 'e7000000-0000-0000-0000-0000000000b4'),
  ('e7000000-0000-0000-0000-0000000000f5', tests.account_id('lp-team'), 'Elm Landscaping', null, null, 'e7000000-0000-0000-0000-0000000000b5'),
  ('e7000000-0000-0000-0000-0000000000f8', tests.account_id('lp-team'), 'Fir Masonry', null, null, 'e7000000-0000-0000-0000-0000000000b6'),
  ('e7000000-0000-0000-0000-000000000f09', tests.account_id('lp-team'), 'Grove Electric', null, null, 'e7000000-0000-0000-0000-0000000000b7'),
  ('e7000000-0000-0000-0000-000000000f10', tests.account_id('lp-team'), 'Hill Bakery', null, null, 'e7000000-0000-0000-0000-0000000000b8'),
  ('e7000000-0000-0000-0000-000000000f11', tests.account_id('lp-team'), 'Iron Works', null, null, 'e7000000-0000-0000-0000-0000000000b9'),
  ('e7000000-0000-0000-0000-0000000000f6', tests.account_id('lp-team'), 'Hand Entered Firm', null, null, null),
  ('e7000000-0000-0000-0000-0000000000f7', tests.account_id('lp-other'), 'Acme Plumbing', 'Austin', 'TX', 'e7000000-0000-0000-0000-0000000000b1');

insert into public.firm_email (account_id, firm_id, email, provider) values
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f1', 'owner@acme.test', 'apify'),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f1', 'office@acme.test', 'apify'),
  (tests.account_id('lp-other'), 'e7000000-0000-0000-0000-0000000000f7', 'owner@acme.test', 'apify');

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model, created_at) values
  ('e7000000-0000-0000-0000-0000000000c0', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f1', false, '{Too small}', 'm', now() - interval '1 day'),
  ('e7000000-0000-0000-0000-0000000000c1', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f1', true, '{Inside the deal box}', 'm', now()),
  ('e7000000-0000-0000-0000-0000000000c2', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f2', false, '{Too small}', 'm', now()),
  ('e7000000-0000-0000-0000-0000000000c3', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f3', true, '{Inside the deal box}', 'm', now()),
  ('e7000000-0000-0000-0000-0000000000c4', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f4', true, '{Inside the deal box}', 'm', now()),
  ('e7000000-0000-0000-0000-0000000000c5', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000f8', false, '{Too small}', 'm', now()),
  ('e7000000-0000-0000-0000-0000000000c6', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-000000000f09', true, '{Inside the deal box}', 'm', now());

insert into public.firm_verdict_approval (verdict_id, account_id, approved_by, reason) values
  ('e7000000-0000-0000-0000-0000000000c1', tests.account_id('lp-team'), tests.get_uid('lp_owner'), null),
  ('e7000000-0000-0000-0000-0000000000c2', tests.account_id('lp-team'), tests.get_uid('lp_owner'), 'Owner is retiring'),
  ('e7000000-0000-0000-0000-0000000000c4', tests.account_id('lp-team'), tests.get_uid('lp_owner'), null),
  ('e7000000-0000-0000-0000-0000000000c6', tests.account_id('lp-team'), tests.get_uid('lp_owner'), null);
insert into public.firm_verdict_revocation (verdict_id, account_id, revoked_by, reason) values
  ('e7000000-0000-0000-0000-0000000000c4', tests.account_id('lp-team'), tests.get_uid('lp_owner'), 'Sold to a competitor');

insert into public.workflow (id, account_id, name)
values ('e7000000-0000-0000-0000-0000000000d1', tests.account_id('lp-team'), 'Vet firms');
insert into public.workflow_version (id, account_id, workflow_id, schema_version, graph, published_at, published_by)
values ('e7000000-0000-0000-0000-0000000000d2', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000d1', 2,
  '{"nodes": [{"id": "decide", "type": "decision_model", "config": {}}], "edges": []}', now(), tests.get_uid('lp_owner'));
insert into public.workflow_run (id, account_id, workflow_id, version_id, trigger_kind, trigger_ref, trigger_node_id)
values ('e7000000-0000-0000-0000-0000000000d3', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000d1',
  'e7000000-0000-0000-0000-0000000000d2', 'manual', 'click-1', 'start');
insert into public.workflow_step_run (id, account_id, run_id, node_id, status, finished_at, idempotency_key, output)
values ('e7000000-0000-0000-0000-0000000000d4', tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000d3',
  'decide', 'succeeded', now(), 'lp-run:decide:0', '{"verdictId": "e7000000-0000-0000-0000-0000000000c5"}');
insert into public.workflow_approval (step_run_id, account_id, approved, decided_by)
values ('e7000000-0000-0000-0000-0000000000d4', tests.account_id('lp-team'), false, tests.get_uid('lp_owner'));

insert into public.outreach_sequence (id, account_id, name) values
  ('e7000000-0000-0000-0000-0000000000a1', tests.account_id('lp-team'), 'Default');
alter table public.outreach_enrollment disable trigger outreach_enrollment_timestamps;
insert into public.outreach_enrollment (account_id, sequence_id, firm_id, target_email, status, created_at) values
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000f1', 'owner@acme.test', 'stopped', now() - interval '1 day'),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000f1', 'owner@acme.test', 'sent', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000f2', 'owner@bolt.test', 'replied', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000f3', 'owner@cedar.test', 'held', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-0000000000f5', 'owner@elm.test', 'suppressed', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-000000000f09', 'owner@grove.test', 'queued', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-000000000f10', 'owner@hill.test', 'bounced', now()),
  (tests.account_id('lp-team'), 'e7000000-0000-0000-0000-0000000000a1', 'e7000000-0000-0000-0000-000000000f11', 'owner@iron.test', 'failed', now());
alter table public.outreach_enrollment enable trigger outreach_enrollment_timestamps;

select tests.login_as('lp_member');

select results_eq(
  $$ select name, city, state, jobs, ppp_loan_amount, headcount, business_age_years, sources::text[],
            needs_review, verdict, approval, email_count, outreach
     from public.lead_pipeline order by name $$,
  $$ values
     ('Acme Plumbing'::varchar, 'Austin', 'TX', 18, 150000::numeric, 25, extract(year from age('2001-05-01'::date))::int,
      '{ppp,sba_7a,sba_504,form_5500,state_registry}'::text[], false, 'fit', 'approved', 2, 'done'),
     ('Bolt Roofing', 'Tulsa', 'OK', null, null, null, null, '{}', true, 'not_fit', 'overridden', 0, 'replied'),
     ('Cedar Paving', null, null, null, null, null, null, '{}', false, 'fit', 'awaiting_approval', 0, 'awaiting_approval'),
     ('Delta HVAC', null, null, null, null, null, null, '{}', false, 'fit', 'revoked', 0, 'not_started'),
     ('Elm Landscaping', null, null, null, null, null, null, '{}', false, null, null, 0, 'stopped'),
     ('Fir Masonry', null, null, null, null, null, null, '{}', false, 'not_fit', 'rejected', 0, 'not_started'),
     ('Grove Electric', null, null, null, null, null, null, '{}', false, 'fit', 'approved', 0, 'sending'),
     ('Hill Bakery', null, null, null, null, null, null, '{}', false, null, null, 0, 'bounced'),
     ('Iron Works', null, null, null, null, null, null, '{}', false, null, null, 0, 'stopped') $$,
  'a member sees the team''s pulled firms with their signals, sources, match, verdict, emails and outreach'
);

select tests.login_as('lp_outsider');

select results_eq(
  $$ select name, email_count from public.lead_pipeline $$,
  $$ values ('Acme Plumbing'::varchar, 1) $$,
  'another team sees only its own firms and its own found emails'
);

select results_eq(
  $$ select state from public.lead_pipeline_state $$,
  $$ values ('TX'::text) $$,
  'the state filter lists only states of the team''s pulled firms'
);

select * from finish();
rollback;
