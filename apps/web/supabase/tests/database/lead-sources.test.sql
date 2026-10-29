begin;
select no_plan();

select tests.create_user('ls_owner');
select tests.create_user('ls_owner_2');

select tests.login_as_service_role();
select public.create_team_account('LS Acct', tests.get_uid('ls_owner'), 'ls-acct');
select public.create_team_account('LS Acct 2', tests.get_uid('ls_owner_2'), 'ls-acct-2');

reset role;

insert into public.public_business (id, name, ein, match_key)
values ('e5000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC', '123456789', 'acme plumbing|78701|12');

insert into public.ppp_loan (loan_number, business_id, borrower_name, state, jobs_reported, loan_amount)
values ('1234567890', 'e5000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC', 'TX', 12, 150000);

insert into public.sba_loan (business_id, program, borrower_name, state, loan_amount, source_key)
values ('e5000000-0000-0000-0000-0000000000b1', 'sba_7a', 'Acme Plumbing LLC', 'TX', 500000, 'acme-7a-1');

insert into public.form_5500_filing (ack_id, business_id, ein, sponsor_name, participant_count)
values ('20240101000000NAL0001', 'e5000000-0000-0000-0000-0000000000b1', '123456789', 'Acme Plumbing LLC', 14);

insert into public.state_registry_entity (state, entity_number, business_id, name, source, fetched_at)
values
  ('TX', 'fresh-1', 'e5000000-0000-0000-0000-0000000000b1', 'Acme Plumbing LLC', 'api', now() - interval '89 days'),
  ('TX', 'edge-90', null, 'Edge Co', 'bulk_file', now() - interval '90 days'),
  ('TX', 'stale-1', null, 'Stale Co', 'bulk_file', now() - interval '200 days');

insert into public.lead_import (source, filename) values ('ppp', 'ppp-tx.csv');

insert into public.firm (id, account_id, name, public_business_id, ein, naics_code, revenue_estimate)
values
  ('e5000000-0000-0000-0000-0000000000f1', tests.account_id('ls-acct'), 'Acme Plumbing',
   'e5000000-0000-0000-0000-0000000000b1', '123456789', '238220', 2500000),
  ('e5000000-0000-0000-0000-0000000000f2', tests.account_id('ls-acct-2'), 'Acme Plumbing',
   'e5000000-0000-0000-0000-0000000000b1', null, null, null);

insert into public.firm_email (account_id, firm_id, email, provider)
values
  (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000f1', 'owner@acme.test', 'apify'),
  (tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2', 'other@acme.test', 'apify');

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model)
values
  ('e5000000-0000-0000-0000-0000000000a1', tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000f1',
   true, array['Inside the deal box'], 'gpt-test'),
  ('e5000000-0000-0000-0000-0000000000a2', tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2',
   true, array['Inside the deal box'], 'gpt-test');

select throws_ok(
  $$ insert into public.firm (account_id, name, ein) values (tests.account_id('ls-acct'), 'Bad EIN', '12-3456789') $$,
  '23514', null,
  'an EIN is stored as nine digits'
);

select throws_ok(
  $$ insert into public.firm_email (account_id, firm_id, email, provider)
     values (tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f1', 'x@acme.test', 'apify') $$,
  '23503', null,
  'an email cannot be filed under a firm owned by another team'
);

select ok(public.registry_entity_needs_fetch('TX', 'missing'), 'an unknown registry entity needs a fetch');
select ok(not public.registry_entity_needs_fetch('TX', 'fresh-1'), 'a record younger than 90 days is reused');
select ok(public.registry_entity_needs_fetch('TX', 'edge-90'), 'a record 90 days old is refetched');
select ok(public.registry_entity_needs_fetch('TX', 'stale-1'), 'a stale record is refetched');

select tests.login_as('ls_owner_2');

select is((select count(*)::int from public.public_business where id = 'e5000000-0000-0000-0000-0000000000b1'), 1, 'any signed-in user reads public businesses');
select is((select count(*)::int from public.ppp_loan where loan_number = '1234567890'), 1, 'any signed-in user reads PPP loans');
select is((select count(*)::int from public.sba_loan where source_key = 'acme-7a-1'), 1, 'any signed-in user reads SBA loans');
select is((select count(*)::int from public.form_5500_filing where ack_id = '20240101000000NAL0001'), 1, 'any signed-in user reads Form 5500 filings');
select is((select count(*)::int from public.state_registry_entity where entity_number in ('fresh-1', 'edge-90', 'stale-1')), 3, 'any signed-in user reads registry entities');

select throws_ok(
  $$ insert into public.ppp_loan (loan_number, borrower_name) values ('999', 'Sneaky') $$,
  '42501', null, 'a signed-in user cannot write PPP loans'
);
select throws_ok(
  $$ insert into public.sba_loan (program, borrower_name, source_key) values ('sba_504', 'Sneaky', 'k') $$,
  '42501', null, 'a signed-in user cannot write SBA loans'
);
select throws_ok(
  $$ insert into public.form_5500_filing (ack_id, ein, sponsor_name) values ('x', '999999999', 'Sneaky') $$,
  '42501', null, 'a signed-in user cannot write Form 5500 filings'
);
select throws_ok(
  $$ update public.state_registry_entity set fetched_at = now() $$,
  '42501', null, 'a signed-in user cannot write registry entities'
);
select throws_ok(
  $$ insert into public.public_business (name) values ('Sneaky') $$,
  '42501', null, 'a signed-in user cannot write public businesses'
);
select throws_ok(
  $$ select * from public.lead_import $$,
  '42501', null, 'import runs are not readable by signed-in users'
);

select results_eq(
  $$ select email from public.firm_email $$,
  $$ values ('other@acme.test') $$,
  'a team sees only its own looked-up emails'
);
select throws_ok(
  $$ insert into public.firm_email (account_id, firm_id, email, provider)
     values (tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2', 'y@acme.test', 'apify') $$,
  '42501', null, 'emails are written only by the service role'
);

select results_eq(
  $$ select id from public.firm_verdict $$,
  $$ values ('e5000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'a team sees only its own verdicts'
);
select throws_ok(
  $$ insert into public.firm_verdict (account_id, firm_id, fit, reasons, model)
     values (tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2', false, '{}', 'x') $$,
  '42501', null, 'verdicts are written only by the service role'
);
select throws_ok(
  $$ insert into public.firm_verdict_approval (verdict_id, account_id)
     values ('e5000000-0000-0000-0000-0000000000a1', tests.account_id('ls-acct')) $$,
  '42501', null, 'a person cannot approve another team''s verdict'
);
select lives_ok(
  $$ insert into public.firm_verdict_approval (verdict_id, account_id)
     values ('e5000000-0000-0000-0000-0000000000a2', tests.account_id('ls-acct-2')) $$,
  'a team member approves their own verdict'
);
select is(
  (select approved_by from public.firm_verdict_approval where verdict_id = 'e5000000-0000-0000-0000-0000000000a2'),
  tests.get_uid('ls_owner_2'),
  'the approval records the approving person'
);

select lives_ok(
  $$ select public.save_provider_credential(tests.account_id('ls-acct-2'), 'letters', 'lob-key-acct2') $$,
  'a team stores its own letter provider key'
);
select throws_ok(
  $$ select public.save_provider_credential(tests.account_id('ls-acct'), 'letters', 'lob-key-stolen') $$,
  '42501', null, 'a team cannot store a key on another team'
);

select throws_ok(
  $$ insert into public.outreach_letter (account_id, enrollment_id, step_ordinal, provider, address_line1, city, state, postal_code)
     values (tests.account_id('ls-acct-2'), gen_random_uuid(), 1, 'lob', '1 Main', 'Austin', 'TX', '78701') $$,
  '42501', null, 'letter sends are recorded only by the service role'
);

select tests.login_as('ls_owner');

select results_eq(
  $$ select email from public.firm_email $$,
  $$ values ('owner@acme.test') $$,
  'the other team sees only its own looked-up emails'
);
select is_empty(
  $$ select 1 from public.provider_credential $$,
  'a team does not see another team''s provider keys'
);

select tests.logout();

select throws_ok(
  $$ select * from public.ppp_loan $$,
  '42501', null, 'anonymous visitors cannot read public source records'
);

reset role;

insert into public.outreach_sequence (id, account_id, name)
values ('e5000000-0000-0000-0000-0000000000c1', tests.account_id('ls-acct'), 'Letters');

insert into public.outreach_step (account_id, sequence_id, ordinal, subject, body)
values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1', 1, 's', 'b');

select is(
  (select channel::text from public.outreach_step where sequence_id = 'e5000000-0000-0000-0000-0000000000c1'),
  'email',
  'a step written without a channel is an email step'
);
select lives_ok(
  $$ insert into public.outreach_step (account_id, sequence_id, ordinal, subject, body, channel)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1', 2, 's', 'b', 'letter') $$,
  'a step can be a letter'
);

select lives_ok(
  $$ insert into public.ai_call_log (account_id, firm_id, model)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000f1', 'gpt-test') $$,
  'a model call can be logged against a firm'
);

update public.firm_verdict set created_at = now() - interval '1 day'
where id = 'e5000000-0000-0000-0000-0000000000a1';

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model)
values ('e5000000-0000-0000-0000-0000000000a3', tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000f1',
        false, array['Too small'], 'gpt-test');

select throws_ok(
  $$ insert into public.sba_loan (program, borrower_name, source_key) values ('sba_7a', 'Acme Plumbing LLC', 'acme-7a-1') $$,
  '23505', null, 'an SBA record is stored once per source key'
);

insert into public.state_registry_officer (entity_id, name, title)
select id, 'Pat Owner', 'Managing Member' from public.state_registry_entity where entity_number = 'fresh-1';

select throws_ok(
  $$ insert into public.public_business (name, ein) values ('Acme Again', '123456789') $$,
  '23505', null, 'one public business per EIN'
);
select throws_ok(
  $$ insert into public.public_business (name, match_key) values ('Acme Again', 'acme plumbing|78701|12') $$,
  '23505', null, 'one public business per name and address key'
);

select is(
  (select row(status::text, rows_read, rows_written, rows_rejected)::text from public.lead_import where filename = 'ppp-tx.csv'),
  row('running', 0, 0, 0)::text,
  'an import run starts running with zero counts'
);
select lives_ok(
  $$ update public.ppp_loan set import_id = (select id from public.lead_import where filename = 'ppp-tx.csv') $$,
  'a source record names the import run that wrote it'
);

select throws_ok(
  $$ update public.firm set naics_code = '23822a' where id = 'e5000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'a NAICS code is two to six digits'
);

select throws_ok(
  $$ insert into public.provider_credential (account_id, kind, provider)
     values (tests.account_id('ls-acct-2'), 'letters', 'postgrid') $$,
  '23505', null, 'a team keeps one provider per kind'
);

select lives_ok(
  $$ insert into public.outreach_step (account_id, sequence_id, ordinal, body, channel)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1', 3, 'b', 'letter') $$,
  'a letter step needs no subject'
);
select throws_ok(
  $$ insert into public.outreach_step (account_id, sequence_id, ordinal, body)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1', 4, 'b') $$,
  '23514', null, 'an email step needs a subject'
);

insert into public.business_match_review (id, account_id, ppp_loan_number, business_id, score)
values ('e5000000-0000-0000-0000-0000000000e1', tests.account_id('ls-acct-2'), '1234567890',
        'e5000000-0000-0000-0000-0000000000b1', 0.6);

select throws_ok(
  $$ insert into public.business_match_review (account_id, ppp_loan_number, form_5500_ack_id, business_id, score)
     values (tests.account_id('ls-acct-2'), '1234567890', '20240101000000NAL0001', 'e5000000-0000-0000-0000-0000000000b1', 0.6) $$,
  '23514', null, 'a review names exactly one source record'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, ppp_loan_number, business_id, score)
     values (tests.account_id('ls-acct-2'), '1234567890', 'e5000000-0000-0000-0000-0000000000b1', 0.7) $$,
  '23505', null, 'a team reviews a candidate match once'
);
select is(
  (select status::text from public.business_match_review where id = 'e5000000-0000-0000-0000-0000000000e1'),
  'pending',
  'a weak match waits for review'
);

select tests.login_as('ls_owner');

select is_empty(
  $$ select 1 from public.business_match_review $$,
  'a team does not see another team''s match reviews'
);
select is(
  (select count(*)::int from public.state_registry_officer
   where entity_id = (select id from public.state_registry_entity where entity_number = 'fresh-1')),
  1,
  'any signed-in user reads registry officers'
);
select throws_ok(
  $$ insert into public.state_registry_officer (entity_id, name)
     select id, 'Sneaky' from public.state_registry_entity limit 1 $$,
  '42501', null, 'a signed-in user cannot write registry officers'
);

select throws_ok(
  $$ insert into public.outreach_enrollment (account_id, sequence_id, firm_id, target_email)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1', 'e5000000-0000-0000-0000-0000000000f1', 'owner@acme.test') $$,
  '23514', null, 'a firm whose latest verdict is unapproved cannot be enrolled'
);
select throws_ok(
  $$ insert into public.firm_verdict_approval (verdict_id, account_id)
     values ('e5000000-0000-0000-0000-0000000000a3', tests.account_id('ls-acct')) $$,
  '23514', null, 'overriding a not-fit verdict needs a reason'
);
select lives_ok(
  $$ insert into public.firm_verdict_approval (verdict_id, account_id, reason)
     values ('e5000000-0000-0000-0000-0000000000a3', tests.account_id('ls-acct'), 'Owner is retiring; size is fine for us') $$,
  'a deal manager overrides a not-fit verdict with a reason'
);
select results_eq(
  $$ select verdict_id, body from public.decision_fact $$,
  $$ values ('e5000000-0000-0000-0000-0000000000a3'::uuid, 'Owner is retiring; size is fine for us') $$,
  'an override reason becomes a team fact'
);
select lives_ok(
  $$ insert into public.outreach_enrollment (id, account_id, sequence_id, firm_id, target_email)
     values ('e5000000-0000-0000-0000-0000000000d1', tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000c1',
             'e5000000-0000-0000-0000-0000000000f1', 'owner@acme.test') $$,
  'an approved firm can be enrolled'
);
select throws_ok(
  $$ insert into public.firm_verdict_revocation (verdict_id, account_id, reason)
     values ('e5000000-0000-0000-0000-0000000000a3', tests.account_id('ls-acct'), ' ') $$,
  '23514', null, 'revoking an approval needs a reason'
);
select lives_ok(
  $$ insert into public.firm_verdict_revocation (verdict_id, account_id, reason)
     values ('e5000000-0000-0000-0000-0000000000a3', tests.account_id('ls-acct'), 'Owner asked us not to write') $$,
  'a deal manager revokes an approval with a reason'
);
select is(
  (select status from public.outreach_enrollment where id = 'e5000000-0000-0000-0000-0000000000d1'),
  'stopped',
  'revoking an approval stops the firm''s queued outreach'
);
select is(
  (select count(*)::int from public.decision_fact where body = 'Owner asked us not to write'),
  1,
  'a revoke reason becomes a team fact'
);
select throws_ok(
  $$ update public.outreach_enrollment set status = 'queued' where id = 'e5000000-0000-0000-0000-0000000000d1' $$,
  '23514', null, 'a revoked firm cannot be queued again'
);

select lives_ok(
  $$ update public.decision_fact set body = 'Owner asked us never to write' where body = 'Owner asked us not to write' $$,
  'a deal manager edits a team fact'
);
select is(
  (select count(*)::int from public.decision_fact where body = 'Owner asked us never to write'),
  1,
  'the edit is kept'
);
select lives_ok(
  $$ delete from public.decision_fact where verdict_id = 'e5000000-0000-0000-0000-0000000000a3' and body like 'Owner is retiring%' $$,
  'a deal manager deletes a team fact'
);
select is((select count(*)::int from public.decision_fact where verdict_id is not null), 1, 'the deleted fact is gone');
select lives_ok(
  $$ insert into public.decision_fact (account_id, body) values (tests.account_id('ls-acct'), 'We never buy franchises') $$,
  'a deal manager types a fact by hand'
);
select is(
  (select created_by from public.decision_fact where body = 'We never buy franchises'),
  tests.get_uid('ls_owner'),
  'a typed fact records who wrote it'
);
select throws_ok(
  $$ insert into public.decision_fact (account_id, body) values (tests.account_id('ls-acct-2'), 'Planted') $$,
  '42501', null, 'a fact cannot be typed into another team'
);

select tests.login_as('ls_owner_2');

select is_empty(
  $$ select 1 from public.decision_fact $$,
  'a team does not see another team''s facts, and approving a fit verdict leaves no fact'
);
select lives_ok(
  $$ update public.business_match_review
     set status = 'accepted', reviewed_by = tests.get_uid('ls_owner_2'), reviewed_at = now()
     where id = 'e5000000-0000-0000-0000-0000000000e1' $$,
  'a team accepts a weak match for itself'
);
select throws_ok(
  $$ update public.business_match_review set status = 'rejected', reviewed_by = null
     where id = 'e5000000-0000-0000-0000-0000000000e1' $$,
  '23514', null, 'a reviewed match names its reviewer'
);
select is(
  (select business_id from public.ppp_loan where loan_number = '1234567890'),
  'e5000000-0000-0000-0000-0000000000b1'::uuid,
  'a team review leaves the shared record untouched'
);

reset role;

select hasnt_column('public', 'firm', 'owner_name', 'owner names replace the single owner name');
select is(
  (select owner_names from public.firm where id = 'e5000000-0000-0000-0000-0000000000f2'),
  '{}'::text[],
  'a firm with no known owners has an empty owner list'
);
select lives_ok(
  $$ update public.firm set owner_names = array['Pat Owner', 'Sam Owner'], profile_generated_at = now(), profile_model = 'gpt-test'
     where id = 'e5000000-0000-0000-0000-0000000000f1' $$,
  'a firm keeps several owners and notes when and by which model its profile was written'
);

select throws_ok(
  $$ insert into public.business_match_review (account_id, form_5500_ack_id, business_id, score)
     values (tests.account_id('ls-acct'), '20240101000000NAL0001', 'e5000000-0000-0000-0000-0000000000b1', 0.9) $$,
  '23514', null, 'a match at 0.9 or above links on its own and is never reviewed'
);
select throws_ok(
  $$ insert into public.business_match_review (account_id, form_5500_ack_id, business_id, score)
     values (tests.account_id('ls-acct'), '20240101000000NAL0001', 'e5000000-0000-0000-0000-0000000000b1', 0.59) $$,
  '23514', null, 'a match below 0.6 is dropped, not reviewed'
);

insert into public.outreach_sequence (id, account_id, name)
values ('e5000000-0000-0000-0000-0000000000c2', tests.account_id('ls-acct-2'), 'Team 2');
insert into public.outreach_enrollment (id, account_id, sequence_id, firm_id, target_email)
values ('e5000000-0000-0000-0000-0000000000d2', tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000c2',
        'e5000000-0000-0000-0000-0000000000f2', 'other@acme.test');

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model, created_at)
values ('e5000000-0000-0000-0000-0000000000a4', tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2',
        true, array['Rerun'], 'gpt-test', now() + interval '1 second');

select is(
  (select status from public.outreach_enrollment where id = 'e5000000-0000-0000-0000-0000000000d2'),
  'held',
  'a new unapproved verdict holds the firm''s queued outreach'
);
select throws_ok(
  $$ insert into public.outreach_enrollment (account_id, sequence_id, firm_id, target_email)
     values (tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000c2', 'e5000000-0000-0000-0000-0000000000f2', 'x@acme.test') $$,
  '23514', null, 'a firm whose newest verdict waits for approval cannot be enrolled'
);

select tests.login_as('ls_owner_2');
insert into public.firm_verdict_approval (verdict_id, account_id)
values ('e5000000-0000-0000-0000-0000000000a4', tests.account_id('ls-acct-2'));
reset role;

select is(
  (select status from public.outreach_enrollment where id = 'e5000000-0000-0000-0000-0000000000d2'),
  'queued',
  'approving the new verdict releases the held outreach'
);

insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model, created_at)
values ('e5000000-0000-0000-0000-0000000000a5', tests.account_id('ls-acct-2'), 'e5000000-0000-0000-0000-0000000000f2',
        true, array['Rerun again'], 'gpt-test', now() + interval '2 seconds');
select tests.login_as('ls_owner_2');
insert into public.firm_verdict_approval (verdict_id, account_id)
values ('e5000000-0000-0000-0000-0000000000a5', tests.account_id('ls-acct-2'));
insert into public.firm_verdict_revocation (verdict_id, account_id, reason)
values ('e5000000-0000-0000-0000-0000000000a5', tests.account_id('ls-acct-2'), 'Changed our mind');
reset role;

select is(
  (select status from public.outreach_enrollment where id = 'e5000000-0000-0000-0000-0000000000d2'),
  'stopped',
  'revoking stops outreach for good'
);

select throws_ok(
  $$ insert into public.outreach_letter (account_id, enrollment_id, step_ordinal, provider, address_line1, city, state, postal_code)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000d1', 1, 'lob', '1 Main', 'Austin', 'TX', '78701') $$,
  '23514', null, 'a team that never set a letter cap sends no letters'
);

insert into public.outreach_setting (account_id, daily_cap, letter_monthly_cap)
values (tests.account_id('ls-acct'), 10, 2);

select lives_ok(
  $$ insert into public.outreach_letter (account_id, enrollment_id, step_ordinal, provider, address_line1, city, state, postal_code, created_at)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000d1', 1, 'lob', '1 Main', 'Austin', 'TX', '78701',
             date_trunc('month', now() at time zone 'utc') at time zone 'utc' - interval '1 second') $$,
  'a letter from last month is recorded'
);
select lives_ok(
  $$ insert into public.outreach_letter (account_id, enrollment_id, step_ordinal, provider, address_line1, city, state, postal_code, status)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000d1', 1, 'lob', '1 Main', 'Austin', 'TX', '78701', 'failed'),
            (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000d1', 2, 'lob', '1 Main', 'Austin', 'TX', '78701', 'queued') $$,
  'letters up to the monthly cap are recorded, last month''s letter not counted'
);
select throws_ok(
  $$ insert into public.outreach_letter (account_id, enrollment_id, step_ordinal, provider, address_line1, city, state, postal_code)
     values (tests.account_id('ls-acct'), 'e5000000-0000-0000-0000-0000000000d1', 3, 'lob', '1 Main', 'Austin', 'TX', '78701') $$,
  '23514', null, 'a letter past the monthly cap is refused, failed letters included'
);

select lives_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ('e5000000-0000-0000-0000-0000000000d1', 1, 'owner@acme.test', 's', 'b', 'sending') $$,
  'a send is recorded as sending before it goes out'
);
select throws_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ('e5000000-0000-0000-0000-0000000000d1', 1, 'owner@acme.test', 's', 'b', 'sending') $$,
  '23505', null, 'one message per enrollment step'
);
select throws_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ('e5000000-0000-0000-0000-0000000000d1', 2, 'owner@acme.test', 's', 'b', 'queued') $$,
  '23514', null, 'a message is sending, sent or failed'
);

select lives_ok(
  $$ update public.outreach_message
     set status = 'sent', provider_message_id = 'msg-1', sent_at = now(), error = null
     where enrollment_id = 'e5000000-0000-0000-0000-0000000000d1' $$,
  'the background sender settles a message it recorded'
);
select tests.login_as_service_role();
select throws_ok(
  $$ update public.outreach_message set body = 'rewritten' where enrollment_id = 'e5000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'the background sender cannot rewrite what was sent'
);
select lives_ok(
  $$ update public.outreach_message set status = 'failed', error = 'bounced'
     where enrollment_id = 'e5000000-0000-0000-0000-0000000000d1' $$,
  'the background sender updates status, provider id, sent time and error'
);
select tests.login_as('ls_owner');
select throws_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ('e5000000-0000-0000-0000-0000000000d1', 9, 'owner@acme.test', 's', 'b', 'sent') $$,
  '42501', null, 'a signed-in user cannot record a message'
);
select throws_ok(
  $$ update public.outreach_message set status = 'sent' where enrollment_id = 'e5000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'a signed-in user cannot change a message'
);
reset role;

insert into public.notifications (account_id, body, dedupe_key)
values (tests.account_id('ls-acct'), 'Deal moved', 'deal_event:42');
select throws_ok(
  $$ insert into public.notifications (account_id, body, dedupe_key) values (tests.account_id('ls-acct'), 'Deal moved', 'deal_event:42') $$,
  '23505', null, 'a notice with the same dedupe key is stored once'
);
select lives_ok(
  $$ insert into public.notifications (account_id, body) values (tests.account_id('ls-acct'), 'One'), (tests.account_id('ls-acct'), 'Two') $$,
  'notices without a dedupe key are never deduplicated'
);

select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.relay_cursor (name, last_global_seq) values ('deal-notifications', 41)
     on conflict (name) do update set last_global_seq = excluded.last_global_seq $$,
  'a relay records how far it has read'
);
select is(
  (select last_global_seq from public.relay_cursor where name = 'deal-notifications'),
  41::bigint,
  'the relay reads its cursor back'
);
select tests.login_as('ls_owner');
select throws_ok(
  $$ select * from public.relay_cursor $$,
  '42501', null, 'relay cursors are service-role only'
);

select * from finish();
rollback;
