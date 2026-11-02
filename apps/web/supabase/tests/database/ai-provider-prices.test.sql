begin;
select no_plan();

select tests.create_user('aip_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Price Team', tests.get_uid('aip_owner'), 'ai-price-team');

select tests.login_as('aip_owner');
select public.save_llm_endpoint(
  p_account_id => tests.account_id('ai-price-team'),
  p_provider => 'openai_compatible',
  p_model => 'llama-4',
  p_base_url => 'https://llm.example.com/v1',
  p_api_key => 'sk-price',
  p_input_price_per_mtok => 0.5,
  p_cached_input_price_per_mtok => 0,
  p_output_price_per_mtok => 1.25
);

select is(
  (select row(input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok)::text
   from public.llm_endpoint where account_id = tests.account_id('ai-price-team')),
  '(0.5,0,1.25)',
  'an OpenAI-compatible endpoint saves its prices per million tokens'
);

select public.save_llm_endpoint(
  p_account_id => tests.account_id('ai-price-team'),
  p_provider => 'openai_compatible',
  p_model => 'llama-4',
  p_base_url => 'https://llm.example.com/v1'
);

select is(
  (select row(input_price_per_mtok, cached_input_price_per_mtok, output_price_per_mtok)::text
   from public.llm_endpoint where account_id = tests.account_id('ai-price-team')),
  '(,,)',
  'a save without prices clears them'
);

select throws_ok(
  $$ select public.save_llm_endpoint(
       p_account_id => tests.account_id('ai-price-team'),
       p_provider => 'openai_compatible',
       p_model => 'llama-4',
       p_base_url => 'https://llm.example.com/v1',
       p_input_price_per_mtok => -1,
       p_cached_input_price_per_mtok => 0,
       p_output_price_per_mtok => 1) $$,
  '23514',
  null,
  'a negative price is refused'
);

select throws_ok(
  $$ select public.save_llm_endpoint(
       p_account_id => tests.account_id('ai-price-team'),
       p_provider => 'openai_compatible',
       p_model => 'llama-4',
       p_base_url => 'https://llm.example.com/v1',
       p_input_price_per_mtok => 1) $$,
  '23514',
  null,
  'prices are saved all together or not at all'
);

select throws_ok(
  $$ select public.save_llm_endpoint(
       p_account_id => tests.account_id('ai-price-team'),
       p_provider => 'openai',
       p_model => 'gpt-4o',
       p_base_url => 'https://api.openai.com/v1',
       p_api_key => 'sk-openai',
       p_input_price_per_mtok => 1,
       p_cached_input_price_per_mtok => 1,
       p_output_price_per_mtok => 1) $$,
  '23514',
  null,
  'only an OpenAI-compatible endpoint takes prices'
);

select * from finish();
rollback;
