begin;
select no_plan();

-- Team A works deals d1 and d2; its viewer holds no deals.work. Team B is
-- foreign to both.
select tests.create_user('daq_owner');
select tests.create_user('daq_member');
select tests.create_user('daq_viewer');
select tests.create_user('daq_foreign');

select tests.login_as_service_role();
select public.create_team_account('DAQ Acct', tests.get_uid('daq_owner'), 'daq-acct');
select public.create_team_account('DAQ Foreign', tests.get_uid('daq_foreign'), 'daq-foreign');

select public.append_deal_event('da900000-0000-0000-0000-0000000000d1', 'deal',
  'da900000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('daq-acct'), 'firm_id', tests.create_firm(tests.account_id('daq-acct')),
    'owner_user_id', tests.get_uid('daq_owner'), 'description', 'Question deal'), null, 'service');

select public.append_deal_event('da900000-0000-0000-0000-0000000000d2', 'deal',
  'da900000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('daq-acct'), 'firm_id', tests.create_firm(tests.account_id('daq-acct')),
    'owner_user_id', tests.get_uid('daq_owner'), 'description', 'Second deal'), null, 'service');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('daq-acct'), tests.get_uid('daq_member'), 'member'),
  (tests.account_id('daq-acct'), tests.get_uid('daq_viewer'), 'viewer');

-- Threads and questions.
select tests.login_as('daq_owner');

select lives_ok(
  $$ insert into public.deal_ai_thread (id, deal_id)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1') $$,
  'someone who works the deal starts a thread'
);

select lives_ok(
  $$ insert into public.deal_ai_question (id, thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000b1', 'da900000-0000-0000-0000-0000000000a1',
       'da900000-0000-0000-0000-0000000000d1', 'What was revenue?') $$,
  'someone who works the deal asks a question in a thread'
);

select results_eq(
  $$ select asked_by, status::text, answer, model, credits_used, steps, citations, finished_at from public.deal_ai_question
     where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  $$ values (tests.get_uid('daq_owner'), 'running', null::text, null::text, 0::numeric, '[]'::jsonb, '[]'::jsonb, null::timestamptz) $$,
  'a new question is the asker''s, running, unanswered, with no credits, steps or citations yet'
);

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question, asked_by)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
       'Ask as someone else', tests.get_uid('daq_member')) $$,
  '42501', null,
  'a question cannot be asked in another person''s name'
);

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1', 'A second one at once') $$,
  '23505', null,
  'a person whose question started moments ago cannot ask another'
);

select tests.login_as('daq_member');

select results_eq(
  $$ select id from public.deal_ai_question $$,
  array['da900000-0000-0000-0000-0000000000b1']::uuid[],
  'a teammate who works the deal reads the team''s questions'
);

select results_eq(
  $$ select id from public.deal_ai_thread $$,
  array['da900000-0000-0000-0000-0000000000a1']::uuid[],
  'a teammate who works the deal reads the team''s threads'
);

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d2', 'Wrong deal') $$,
  '23503', null,
  'a question belongs to the deal of its thread'
);

select lives_ok(
  $$ insert into public.deal_ai_question (id, thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000b2', 'da900000-0000-0000-0000-0000000000a1',
       'da900000-0000-0000-0000-0000000000d1', 'And EBITDA?') $$,
  'a teammate asks a follow-up in the same thread while another person''s question runs'
);

delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1';

select tests.login_as('daq_owner');

select throws_ok(
  $$ update public.deal_ai_question set status = 'answered', answer = 'Forged', citations = '[{"forged": true}]', finished_at = now()
     where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  '42501', null,
  'the asker''s own client cannot finish a question'
);

delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1';

select results_eq(
  $$ select status::text, answer from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  $$ values ('running', null::text) $$,
  'a running question survives a delete by a teammate and by its own asker'
);

select tests.login_as_service_role();

select throws_ok(
  $$ update public.deal_ai_question set status = 'answered', answer = 'No end time'
     where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  '23514', null,
  'a finished question records when it finished'
);

update public.deal_ai_question
set status = 'answered', answer = 'Revenue was 1.4 million.', model = 'claude-test', credits_used = 3.5,
  steps = '[{"tool": "search_documents"}]', citations = '[{"document_id": "x", "page": 1}]', finished_at = now()
where id = 'da900000-0000-0000-0000-0000000000b1';

select tests.login_as('daq_owner');

select results_eq(
  $$ select status::text, answer, model, credits_used, steps, citations, finished_at is not null
     from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  $$ values ('answered', 'Revenue was 1.4 million.', 'claude-test', 3.5::numeric,
       '[{"tool": "search_documents"}]'::jsonb, '[{"document_id": "x", "page": 1}]'::jsonb, true) $$,
  'the server finishes a question with its answer, model, credits, steps and citations'
);

select lives_ok(
  $$ insert into public.deal_ai_question (id, thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000b3', 'da900000-0000-0000-0000-0000000000a1',
       'da900000-0000-0000-0000-0000000000d1', 'Next one') $$,
  'once their question finishes, the asker can ask another'
);

delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1';

select is_empty(
  $$ select 1 from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b1' $$,
  'the asker deletes their own finished question'
);

-- A question left running for over 10 minutes counts as failed.
reset role;
update public.deal_ai_question set created_at = now() - interval '11 minutes'
where id = 'da900000-0000-0000-0000-0000000000b2';
update public.deal_ai_question set created_at = now() - interval '9 minutes'
where id = 'da900000-0000-0000-0000-0000000000b3';

select tests.login_as('daq_member');

select lives_ok(
  $$ insert into public.deal_ai_question (id, thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000b4', 'da900000-0000-0000-0000-0000000000a1',
       'da900000-0000-0000-0000-0000000000d1', 'After a stuck one') $$,
  'a question running for over 10 minutes does not block its asker'
);

select results_eq(
  $$ select status::text, finished_at is not null from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b2' $$,
  $$ values ('failed', true) $$,
  'the stuck question shows as failed once its asker asks again'
);

select tests.login_as('daq_owner');

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1', 'Too soon') $$,
  '23505', null,
  'a question running for under 10 minutes still blocks its asker'
);

reset role;
update public.deal_ai_question set created_at = now() - interval '11 minutes'
where id = 'da900000-0000-0000-0000-0000000000b4';

select tests.login_as('daq_owner');
delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b4';
delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b3';

select tests.login_as('daq_member');
delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b3';

select results_eq(
  $$ select id from public.deal_ai_question
     where id in ('da900000-0000-0000-0000-0000000000b3', 'da900000-0000-0000-0000-0000000000b4') order by id $$,
  array['da900000-0000-0000-0000-0000000000b3', 'da900000-0000-0000-0000-0000000000b4']::uuid[],
  'nobody deletes a question running under 10 minutes, and a teammate deletes no stuck question'
);

delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b4';

select is_empty(
  $$ select 1 from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b4' $$,
  'the asker deletes their question once it has run over 10 minutes'
);

select tests.login_as('daq_viewer');

select is_empty($$ select 1 from public.deal_ai_thread $$, 'a teammate who cannot work the deal reads no threads');
select is_empty($$ select 1 from public.deal_ai_question $$, 'a teammate who cannot work the deal reads no questions');

select throws_ok(
  $$ insert into public.deal_ai_thread (deal_id) values ('da900000-0000-0000-0000-0000000000d1') $$,
  '42501', null,
  'a teammate who cannot work the deal starts no thread'
);

select tests.login_as('daq_foreign');

select is_empty($$ select 1 from public.deal_ai_thread $$, 'another team reads no threads');
select is_empty($$ select 1 from public.deal_ai_question $$, 'another team reads no questions');

select throws_ok(
  $$ insert into public.deal_ai_thread (deal_id) values ('da900000-0000-0000-0000-0000000000d1') $$,
  '42501', null,
  'another team starts no thread on the deal'
);

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1', 'Peek') $$,
  '42501', null,
  'another team asks nothing in the team''s thread'
);

-- A thread holds up to 20 questions.
reset role;

update public.deal_ai_question set status = 'failed', finished_at = now()
where asked_by = tests.get_uid('daq_member') and status = 'running';

insert into public.deal_ai_thread (id, deal_id)
values ('da900000-0000-0000-0000-0000000000a2', 'da900000-0000-0000-0000-0000000000d2');

insert into public.deal_ai_question (thread_id, deal_id, asked_by, question, status, finished_at)
select 'da900000-0000-0000-0000-0000000000a2', 'da900000-0000-0000-0000-0000000000d2',
  tests.get_uid('daq_member'), 'Question ' || n, 'answered', now()
from generate_series(1, 20) n;

select tests.login_as('daq_member');

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a2', 'da900000-0000-0000-0000-0000000000d2', 'Twenty-first') $$,
  '23514', null,
  'a thread holds at most 20 questions'
);

-- ai_call_log links to the question and the asking user.
reset role;

select tests.login_as_service_role();

select public.reserve_ai_call(tests.account_id('daq-acct'), 'claude-ai-question', 0,
  p_deal_id => 'da900000-0000-0000-0000-0000000000d1',
  p_created_by => tests.get_uid('daq_owner'),
  p_question_id => 'da900000-0000-0000-0000-0000000000b3');

reset role;

select results_eq(
  $$ select created_by, question_id from public.ai_call_log where model = 'claude-ai-question' $$,
  $$ values (tests.get_uid('daq_owner'), 'da900000-0000-0000-0000-0000000000b3'::uuid) $$,
  'reserving an AI call records the asking user and their question'
);

delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b3';

select results_eq(
  $$ select question_id from public.ai_call_log where model = 'claude-ai-question' $$,
  array[null::uuid],
  'deleting a question keeps its AI calls in the log'
);

-- One call starts a thread with its first question, or adds a question to a
-- thread, and leaves nothing behind when the question is refused.
select tests.login_as('daq_member');

select lives_ok(
  $$ select public.start_deal_ai_question('da900000-0000-0000-0000-0000000000d2', 'Fresh thread') $$,
  'someone who works the deal starts a thread with its first question in one call'
);

select results_eq(
  $$ select q.question, q.asked_by, q.status::text
     from public.deal_ai_question q
     join public.deal_ai_thread t on t.id = q.thread_id
     where t.deal_id = 'da900000-0000-0000-0000-0000000000d2' and t.id <> 'da900000-0000-0000-0000-0000000000a2' $$,
  $$ values ('Fresh thread', tests.get_uid('daq_member'), 'running') $$,
  'the new thread holds exactly its first question, asked by the caller and running'
);

select throws_ok(
  $$ select public.start_deal_ai_question('da900000-0000-0000-0000-0000000000d2', 'Second at once') $$,
  '23505', 'duplicate key value violates unique constraint "ux_deal_ai_question_one_running"',
  'starting a thread while a question runs is refused as one running question'
);

select results_eq(
  $$ select count(*)::int from public.deal_ai_thread where deal_id = 'da900000-0000-0000-0000-0000000000d2' $$,
  array[2],
  'a refused question leaves no new thread behind'
);

reset role;
update public.deal_ai_question set status = 'answered', finished_at = now()
where asked_by = tests.get_uid('daq_member') and status = 'running';

select tests.login_as('daq_member');

select throws_ok(
  $$ select public.start_deal_ai_question('da900000-0000-0000-0000-0000000000d2', 'Twenty-first',
       'da900000-0000-0000-0000-0000000000a2') $$,
  '23514', 'a thread holds at most 20 questions',
  'adding to a full thread is refused as a full thread'
);

select lives_ok(
  $$ select public.start_deal_ai_question('da900000-0000-0000-0000-0000000000d2', 'Follow-up',
       (select id from public.deal_ai_thread
        where deal_id = 'da900000-0000-0000-0000-0000000000d2' and id <> 'da900000-0000-0000-0000-0000000000a2')) $$,
  'passing a thread adds the question to it'
);

select results_eq(
  $$ select count(*)::int from public.deal_ai_thread where deal_id = 'da900000-0000-0000-0000-0000000000d2' $$,
  array[2],
  'adding to a thread starts no new thread'
);

select results_eq(
  $$ select q.question from public.deal_ai_question q
     join public.deal_ai_thread t on t.id = q.thread_id
     where t.deal_id = 'da900000-0000-0000-0000-0000000000d2' and t.id <> 'da900000-0000-0000-0000-0000000000a2'
     order by q.created_at, q.question $$,
  array['Follow-up', 'Fresh thread'],
  'the thread holds its first question and the follow-up'
);

reset role;
update public.deal_ai_question set status = 'answered', finished_at = now()
where asked_by = tests.get_uid('daq_member') and status = 'running';

select tests.login_as('daq_foreign');

select throws_ok(
  $$ select public.start_deal_ai_question('da900000-0000-0000-0000-0000000000d1', 'Peek') $$,
  '42501', null,
  'another team cannot start a thread on the deal'
);

reset role;

select results_eq(
  $$ select count(*)::int from public.deal_ai_thread where deal_id = 'da900000-0000-0000-0000-0000000000d1' $$,
  array[1],
  'a refused outsider leaves no thread behind'
);

select function_privs_are(
  'public', 'start_deal_ai_question', array['uuid', 'text', 'uuid'], 'service_role', array[]::text[],
  'the server cannot start a question, which would have no asker'
);

-- The AI searches the deal's answered questions.
reset role;

insert into public.deal_ai_thread (id, deal_id)
values ('da900000-0000-0000-0000-0000000000a3', 'da900000-0000-0000-0000-0000000000d2');

insert into public.deal_ai_question (id, thread_id, deal_id, asked_by, question, answer, status, created_at, finished_at)
values
  ('da900000-0000-0000-0000-0000000000e1', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_member'), 'How is it treated?', 'Goodwill amortizes over 15 years.', 'answered', now(), now()),
  ('da900000-0000-0000-0000-0000000000e2', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_member'), 'How is it treated?', 'Goodwill amortizes over 15 years.', 'answered', now() - interval '1 day', now()),
  ('da900000-0000-0000-0000-0000000000e3', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_member'), 'Goodwill again?', 'Goodwill amortizes.', 'failed', now(), now()),
  ('da900000-0000-0000-0000-0000000000e4', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_viewer'), 'Goodwill now?', null, 'running', now(), null),
  ('da900000-0000-0000-0000-0000000000e5', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_member'), 'Goodwill budget?', 'Goodwill partly.', 'credits_ran_out', now(), now()),
  ('da900000-0000-0000-0000-0000000000e6', 'da900000-0000-0000-0000-0000000000a3', 'da900000-0000-0000-0000-0000000000d2',
    tests.get_uid('daq_member'), 'Other deal goodwill?', 'Goodwill amortizes here too.', 'answered', now(), now());

select tests.login_as('daq_owner');

select results_eq(
  $$ select question_id, thread_id, question, answer from public.search_deal_ai_answers('da900000-0000-0000-0000-0000000000d1', 'amortizes') $$,
  $$ values
       ('da900000-0000-0000-0000-0000000000e1'::uuid, 'da900000-0000-0000-0000-0000000000a1'::uuid, 'How is it treated?', 'Goodwill amortizes over 15 years.'),
       ('da900000-0000-0000-0000-0000000000e2'::uuid, 'da900000-0000-0000-0000-0000000000a1'::uuid, 'How is it treated?', 'Goodwill amortizes over 15 years.') $$,
  'a teammate finds answered questions on the deal by a word in the answer, newest first among equals'
);

select results_eq(
  $$ select question_id from public.search_deal_ai_answers('da900000-0000-0000-0000-0000000000d1', 'goodwill') $$,
  array['da900000-0000-0000-0000-0000000000e1', 'da900000-0000-0000-0000-0000000000e2']::uuid[],
  'failed, running and out-of-credits questions and other deals'' questions do not match'
);

select results_eq(
  $$ select count(*)::int from public.search_deal_ai_answers('da900000-0000-0000-0000-0000000000d1', 'goodwill', 1) $$,
  array[1],
  'search returns at most the requested number of answers'
);

select tests.login_as('daq_foreign');

select is_empty(
  $$ select 1 from public.search_deal_ai_answers('da900000-0000-0000-0000-0000000000d1', 'goodwill') $$,
  'another team finds no answers on the deal'
);

select function_privs_are(
  'public', 'search_deal_ai_answers', array['uuid', 'text', 'integer'], 'service_role', array[]::text[],
  'the server does not search answers'
);

reset role;

-- One summary row per thread that holds a question, for paging newest first.
select tests.login_as_service_role();
select public.append_deal_event('da900000-0000-0000-0000-0000000000d3', 'deal',
  'da900000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('daq-acct'), 'firm_id', tests.create_firm(tests.account_id('daq-acct')),
    'owner_user_id', tests.get_uid('daq_owner'), 'description', 'Summary deal'), null, 'service');
reset role;

insert into public.deal_ai_thread (id, deal_id)
values
  ('da900000-0000-0000-0000-0000000000f1', 'da900000-0000-0000-0000-0000000000d3'),
  ('da900000-0000-0000-0000-0000000000f2', 'da900000-0000-0000-0000-0000000000d3'),
  ('da900000-0000-0000-0000-0000000000f3', 'da900000-0000-0000-0000-0000000000d3');

insert into public.deal_ai_question (thread_id, deal_id, asked_by, question, answer, status, created_at, finished_at)
values
  ('da900000-0000-0000-0000-0000000000f1', 'da900000-0000-0000-0000-0000000000d3', tests.get_uid('daq_member'),
    'Later in f1', 'a', 'answered', '2026-11-01 11:00+00', now()),
  ('da900000-0000-0000-0000-0000000000f1', 'da900000-0000-0000-0000-0000000000d3', tests.get_uid('daq_member'),
    'First in f1', 'a', 'answered', '2026-11-01 09:00+00', now()),
  ('da900000-0000-0000-0000-0000000000f2', 'da900000-0000-0000-0000-0000000000d3', tests.get_uid('daq_member'),
    'Only in f2', 'a', 'answered', '2026-11-01 10:00+00', now());

select tests.login_as('daq_owner');

select results_eq(
  $$ select id, deal_id, account_id, deal_name, first_question, last_asked_at
     from public.deal_ai_thread_summary
     where deal_id = 'da900000-0000-0000-0000-0000000000d3'
     order by last_asked_at desc, id desc $$,
  $$ values
       ('da900000-0000-0000-0000-0000000000f1'::uuid, 'da900000-0000-0000-0000-0000000000d3'::uuid, tests.account_id('daq-acct'),
         'Fixture business', 'First in f1', '2026-11-01 11:00+00'::timestamptz),
       ('da900000-0000-0000-0000-0000000000f2'::uuid, 'da900000-0000-0000-0000-0000000000d3'::uuid, tests.account_id('daq-acct'),
         'Fixture business', 'Only in f2', '2026-11-01 10:00+00'::timestamptz) $$,
  'each thread with a question shows its deal, first question and latest ask, newest first, and an empty thread is absent'
);

select tests.login_as('daq_foreign');

select is_empty(
  $$ select 1 from public.deal_ai_thread_summary $$,
  'another team sees no thread summaries'
);

select table_privs_are(
  'public', 'deal_ai_thread_summary', 'service_role', array[]::text[],
  'the server reads no thread summaries'
);

reset role;

-- A locked team writes no threads or questions, but the server still
-- finishes a question that was running.
insert into public.deal_ai_question (id, thread_id, deal_id, asked_by, question, status, finished_at)
values
  ('da900000-0000-0000-0000-0000000000b5', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_owner'), 'Finished before the lock', 'answered', now()),
  ('da900000-0000-0000-0000-0000000000b6', 'da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1',
    tests.get_uid('daq_owner'), 'Running at the lock', 'running', null);

update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('daq-acct');
select public.set_team_account_billing(true);

select tests.login_as('daq_owner');

select throws_ok(
  $$ insert into public.deal_ai_thread (deal_id) values ('da900000-0000-0000-0000-0000000000d1') $$,
  '42501', 'team is read-only',
  'a locked team starts no thread'
);

select throws_ok(
  $$ insert into public.deal_ai_question (thread_id, deal_id, question)
     values ('da900000-0000-0000-0000-0000000000a1', 'da900000-0000-0000-0000-0000000000d1', 'Locked') $$,
  '42501', 'team is read-only',
  'a locked team asks no question'
);

select throws_ok(
  $$ delete from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b5' $$,
  '42501', 'team is read-only',
  'a locked team deletes no question'
);

select tests.login_as_service_role();

select lives_ok(
  $$ update public.deal_ai_question set status = 'credits_ran_out', finished_at = now()
     where id = 'da900000-0000-0000-0000-0000000000b6' $$,
  'the server finishes a running question on a locked team'
);

select results_eq(
  $$ select status::text from public.deal_ai_question where id = 'da900000-0000-0000-0000-0000000000b6' $$,
  array['credits_ran_out'],
  'the running question on a locked team is finished'
);

select * from finish();
rollback;
