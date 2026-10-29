begin;
select no_plan();

select tests.create_user('aie_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Embed Team', tests.get_uid('aie_owner'), 'ai-embed-team');

select tests.login_as('aie_owner');
select public.save_llm_endpoint(
  p_account_id => tests.account_id('ai-embed-team'),
  p_provider => 'openai',
  p_model => 'gpt-x',
  p_base_url => 'https://api.openai.com/v1',
  p_api_key => 'sk-embed',
  p_embedding_model => 'text-embedding-3-small'
);

select is(
  (select row(chat_model, model)::text from public.llm_endpoint where account_id = tests.account_id('ai-embed-team')),
  row('gpt-x', 'text-embedding-3-small')::text,
  'saving the provider writes the chat model and the embedding model'
);

select public.save_llm_endpoint(
  p_account_id => tests.account_id('ai-embed-team'),
  p_provider => 'openai',
  p_model => 'gpt-y',
  p_base_url => 'https://api.openai.com/v1',
  p_embedding_model => 'text-embedding-3-large'
);

select is(
  (select row(chat_model, model)::text from public.llm_endpoint where account_id = tests.account_id('ai-embed-team')),
  row('gpt-y', 'text-embedding-3-large')::text,
  'a later save without a new key changes both models'
);

select public.save_llm_endpoint(
  p_account_id => tests.account_id('ai-embed-team'),
  p_provider => 'openai',
  p_model => 'gpt-y',
  p_base_url => 'https://api.openai.com/v1'
);

select is(
  (select model from public.llm_endpoint where account_id = tests.account_id('ai-embed-team')),
  null,
  'a save without an embedding model clears it'
);

select hasnt_column('public', 'llm_endpoint', 'api_key_secret_ref', 'llm_endpoint no longer names an env-held key');

select * from finish();
rollback;
