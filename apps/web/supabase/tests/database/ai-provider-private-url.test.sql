begin;
select no_plan();

select set_config('odb.allow_private_ai_url', 'off', true);

select tests.create_user('aipu_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Private URL Team', tests.get_uid('aipu_owner'), 'ai-private-url-team');

select tests.login_as('aipu_owner');

select throws_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'http://127.0.0.1:4510/v1',
    p_api_key => 'sk-local'
  )$$,
  '22023',
  'use a public https base URL',
  'a private http base URL is refused when private AI URLs are not allowed'
);

select set_config('odb.allow_private_ai_url', 'on', true);

select lives_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'http://127.0.0.1:4510/v1',
    p_api_key => 'sk-local'
  )$$,
  'a private http base URL saves on a stack that allows private AI URLs'
);

select is(
  (select base_url from public.llm_endpoint where account_id = tests.account_id('ai-private-url-team')),
  'http://127.0.0.1:4510/v1',
  'the private base URL is stored as given'
);

select * from finish();
rollback;
