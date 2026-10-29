begin;
select no_plan();

select tests.create_user('aiae_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Anthropic Team', tests.get_uid('aiae_owner'), 'ai-anthropic-team');

select tests.login_as('aiae_owner');

select throws_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-anthropic-team'),
    p_provider => 'anthropic',
    p_model => 'claude-x',
    p_base_url => '',
    p_api_key => 'sk-ant',
    p_embedding_model => 'voyage-3'
  )$$,
  'Anthropic has no embeddings API; leave Embedding model empty',
  'an Anthropic provider cannot be saved with an embedding model'
);

select lives_ok(
  $$select public.save_llm_endpoint(
    p_account_id => tests.account_id('ai-anthropic-team'),
    p_provider => 'anthropic',
    p_model => 'claude-x',
    p_base_url => '',
    p_api_key => 'sk-ant'
  )$$,
  'an Anthropic provider saves without an embedding model'
);

select has_column('public', 'embedding_job', 'skipped_reason', 'an embedding job records why it was skipped');
select has_column('public', 'verification_run', 'skipped_reason', 'a verification run records why it was skipped');

select * from finish();
rollback;
