begin;
select no_plan();

select tests.create_user('ous_owner');
select tests.create_user('ous_member');
select tests.create_user('ous_outsider');
select tests.create_user('ous_nameless');
select tests.login_as_service_role();
select public.create_team_account('Unknown Sends', tests.get_uid('ous_owner'), 'ous-team');
select public.create_team_account('Elsewhere', tests.get_uid('ous_outsider'), 'ous-other');
insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('ous-team'), tests.get_uid('ous_member'), 'member'),
  (tests.account_id('ous-team'), tests.get_uid('ous_nameless'), 'owner');
update public.accounts set name = 'Avery Owner' where id = tests.get_uid('ous_owner');
update public.accounts set name = ' ' where id = tests.get_uid('ous_nameless');

create temp table seq as
with inserted as (
  insert into public.outreach_sequence (account_id, name)
  values (tests.account_id('ous-team'), 'Two touches')
  returning id
)
select id from inserted;

create temp table enrollments (label text primary key, id uuid);
grant select on enrollments to authenticated;

with inserted as (
  insert into public.outreach_enrollment (account_id, sequence_id, target_email, current_step, status, error)
  select tests.account_id('ous-team'), (select id from seq), label || '@example.test', 2,
    case label when 'replied' then 'replied' when 'held' then 'held' else 'queued' end,
    'Send result unknown; check the mailbox'
  from unnest(array['mark', 'retry', 'stop', 'nameless', 'sent', 'member', 'replied', 'held']) as label
  returning id, split_part(target_email, '@', 1) as label
)
insert into enrollments select label, id from inserted;

insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status, sent_at)
select e.id, 2, e.label || '@example.test', 'Again', 'Second',
  case e.label when 'sent' then 'sent' else 'unknown' end,
  now() - interval '2 days'
from enrollments e;

insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
select e.id, 1, e.label || '@example.test', 'Hello', 'First', 'unknown'
from enrollments e where e.label = 'sent';

create temp view message_state as
select e.label, m.step_id, m.status, m.sent_at = now() as sent_now
from public.outreach_message m join enrollments e on e.id = m.enrollment_id;
grant select on message_state to authenticated;

create temp view enrollment_state as
select e.label, o.status, o.error
from public.outreach_enrollment o join enrollments e on e.id = o.id;
grant select on enrollment_state to authenticated;

select tests.login_as('ous_owner');

select lives_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'mark'), 'mark_sent') $$,
  'a deal manager marks an unknown send as sent'
);
select lives_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'retry'), 'retry') $$,
  'a deal manager retries an unknown send'
);
select lives_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'stop'), 'stop') $$,
  'a deal manager stops an enrollment after an unknown send'
);
select throws_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'sent'), 'retry') $$,
  'P0002', 'The current step has no unknown send', 'a current step that was sent cannot be resolved'
);

select lives_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'held'), 'retry') $$,
  'a deal manager resolves an unknown send while the enrollment is held'
);

select throws_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'replied'), 'stop') $$,
  'P0002', 'This enrollment is no longer waiting', 'an enrollment that left the queue cannot be resolved'
);

select tests.login_as('ous_nameless');
select lives_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'nameless'), 'stop') $$,
  'a deal manager with no name stops an enrollment'
);

select tests.login_as('ous_member');
select throws_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'member'), 'retry') $$,
  '42501', 'resolving an unknown send needs deals.manage', 'a member without deals.manage cannot resolve'
);

select tests.login_as('ous_outsider');
select throws_ok(
  $$ select public.resolve_unknown_outreach_send((select id from enrollments where label = 'member'), 'mark_sent') $$,
  'P0002', 'This enrollment was not found', 'another team is told the enrollment was not found'
);

select tests.login_as('ous_owner');
select throws_ok(
  $$ select public.resolve_unknown_outreach_send(gen_random_uuid(), 'mark_sent') $$,
  'P0002', 'This enrollment was not found', 'an enrollment that does not exist was not found'
);

select tests.login_as_service_role();

select results_eq(
  $$ select label, step_id, status, sent_now from message_state order by label, step_id $$,
  $$ values
       ('held', 2, 'retried', false),
       ('mark', 2, 'sent', true),
       ('member', 2, 'unknown', false),
       ('nameless', 2, 'unknown', false),
       ('replied', 2, 'unknown', false),
       ('retry', 2, 'retried', false),
       ('sent', 1, 'unknown', null),
       ('sent', 2, 'sent', false),
       ('stop', 2, 'unknown', false) $$,
  'mark sent stamps the send now, retry keeps the row as retried, stop and refusals leave it'
);

select lives_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ((select id from enrollments where label = 'retry'), 2, 'retry@example.test', 'Again', 'Second', 'sending') $$,
  'the next tick records a fresh send for a retried step'
);
select throws_ok(
  $$ insert into public.outreach_message (enrollment_id, step_id, to_email, subject, body, status)
     values ((select id from enrollments where label = 'retry'), 2, 'retry@example.test', 'Again', 'Second', 'sending') $$,
  '23505', null, 'a step still holds one live send, so a repeated tick hits the unique key'
);

select results_eq(
  $$ select label, status, error from enrollment_state order by label $$,
  $$ values
       ('held', 'held', null::text),
       ('mark', 'queued', null),
       ('member', 'queued', 'Send result unknown; check the mailbox'),
       ('nameless', 'failed', 'Stopped by a teammate after an unknown send'),
       ('replied', 'replied', 'Send result unknown; check the mailbox'),
       ('retry', 'queued', null),
       ('sent', 'queued', 'Send result unknown; check the mailbox'),
       ('stop', 'failed', 'Stopped by Avery Owner after an unknown send') $$,
  'mark sent and retry clear the error; only stop fails the enrollment, with who stopped it'
);

select * from finish();
rollback;
