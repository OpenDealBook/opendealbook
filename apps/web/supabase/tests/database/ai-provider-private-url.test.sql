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

select set_config('odb.private_ai_hosts', ' LLM.Corp.Internal:443, 10.0.0.8:4510,[fd00::1]', true);

select lives_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'https://llm.corp.internal/v1',
    p_api_key => 'sk-listed'
  )$$,
  'a listed host name saves in any case, its port implied by https'
);

select lives_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'http://10.0.0.8:4510/v1',
    p_api_key => 'sk-listed'
  )$$,
  'a listed private host:port saves over http'
);

select lives_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'https://[fd00::1]:8443/v1',
    p_api_key => 'sk-listed'
  )$$,
  'a listed bracketed IPv6 host saves on any port'
);

select throws_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'http://10.0.0.8/v1',
    p_api_key => 'sk-listed'
  )$$,
  '22023',
  'use a public https base URL',
  'a listed host:port does not cover another port'
);

select throws_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-private-url-team'),
    p_provider => 'openai_compatible',
    p_model => 'llama-3',
    p_base_url => 'http://10.0.0.9:4510/v1',
    p_api_key => 'sk-listed'
  )$$,
  '22023',
  'use a public https base URL',
  'a private host the operator does not list is refused'
);

select set_config('odb.private_ai_hosts', '', true);

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

reset role;
select ok(
  not has_function_privilege('anon', 'odb.operator_lists_private_ai_host(text)', 'execute')
    and not has_function_privilege('authenticated', 'odb.operator_lists_private_ai_host(text)', 'execute')
    and not has_function_privilege('service_role', 'odb.operator_lists_private_ai_host(text)', 'execute'),
  'only save_llm_endpoint can ask whether the operator lists a private AI host'
);

select * from finish();
rollback;
