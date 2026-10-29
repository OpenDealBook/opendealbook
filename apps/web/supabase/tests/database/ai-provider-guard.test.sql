begin;
select no_plan();

select set_config('odb.allow_private_ai_url', 'off', true);

select tests.create_user('aig_a_owner');
select tests.create_user('aig_b_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Guard A', tests.get_uid('aig_a_owner'), 'ai-guard-a');
select public.create_team_account('AI Guard B', tests.get_uid('aig_b_owner'), 'ai-guard-b');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('ai-guard-b'), tests.get_uid('aig_a_owner'), 'member');

select tests.login_as('aig_b_owner');
select public.save_llm_endpoint(tests.account_id('ai-guard-b'), 'openai', 'gpt-x', null, 'sk-team-b');
select tests.login_as_service_role();

create temp table b_secret as
select api_key_secret_id as id from public.llm_endpoint where account_id = tests.account_id('ai-guard-b');
grant select on b_secret to authenticated;

select tests.login_as('aig_a_owner');
select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai', 'gpt-x', null, 'sk-team-a');

select lives_ok(
  $$ select provider, chat_model, base_url from public.llm_endpoint where account_id = tests.account_id('ai-guard-b') $$,
  'a member sees the provider, model and base URL of their team'
);
select throws_ok(
  $$ select api_key_secret_id from public.llm_endpoint where account_id = tests.account_id('ai-guard-b') $$,
  '42501', null,
  'a member cannot read the vault secret id'
);
select throws_ok(
  $$ update public.llm_endpoint set api_key_secret_id = (select id from b_secret) where account_id = tests.account_id('ai-guard-a') $$,
  '42501', null,
  'a settings manager cannot point their team at another team''s key'
);
select throws_ok(
  $$ insert into public.llm_endpoint (account_id, provider, chat_model) values (tests.account_id('ai-guard-a'), 'openai', 'gpt-x') $$,
  '42501', null,
  'endpoints are written only through save_llm_endpoint'
);
select throws_ok(
  $$ delete from public.llm_endpoint where account_id = tests.account_id('ai-guard-b') $$,
  '42501', null,
  'a member cannot delete another team''s endpoint or its key'
);

select tests.login_as_service_role();
select is(
  (select decrypted_secret from vault.decrypted_secrets where id = (select id from b_secret)),
  'sk-team-b',
  'team B keeps its key'
);

select tests.login_as('aig_a_owner');
select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai', 'gpt-y', null, null);
select tests.login_as_service_role();
select is(
  (select s.decrypted_secret from public.llm_endpoint e join vault.decrypted_secrets s on s.id = e.api_key_secret_id
   where e.account_id = tests.account_id('ai-guard-a')),
  'sk-team-a',
  'changing only the model keeps the stored key'
);

select tests.login_as('aig_a_owner');
select throws_ok(
  $$ select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'anthropic', 'claude-x', null, null) $$,
  '23514', 'paste an API key',
  'changing the provider needs a new key'
);
select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai_compatible', 'llama', 'https://llm.example.com/v1', 'sk-compat');
select throws_ok(
  $$ select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai_compatible', 'llama', 'https://other.example.com/v1', null) $$,
  '23514', 'paste an API key',
  'changing the base URL needs a new key'
);

select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai', 'gpt-x', 'https://evil.example.com/v1', 'sk-a2');
select is(
  (select base_url from public.llm_endpoint where account_id = tests.account_id('ai-guard-a')),
  'https://api.openai.com/v1',
  'OpenAI always uses its own address'
);
select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'anthropic', 'claude-x', 'https://evil.example.com/v1', 'sk-a3');
select is(
  (select base_url from public.llm_endpoint where account_id = tests.account_id('ai-guard-a')),
  'https://api.anthropic.com/v1',
  'Anthropic always uses its own address'
);

select throws_ok(
  format($$ select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai_compatible', 'llama', %L, 'sk-x') $$, url),
  '22023', 'use a public https base URL',
  'refuses ' || url
)
from unnest(array[
  'http://llm.example.com/v1',
  'https://llm.example.com/v1?key=1',
  'https://llm.example.com/v1#frag',
  'https://127.0.0.1/v1',
  'https://10.0.0.5/v1',
  'https://172.16.4.1/v1',
  'https://192.168.1.10/v1',
  'https://169.254.169.254/latest',
  'https://100.64.0.1/v1',
  'https://0.0.0.0/v1',
  'https://[::1]/v1',
  'https://[fd00::1]/v1',
  'https://[fe80::1]/v1',
  'https://localhost/v1',
  'https://api.localhost/v1',
  'https://metadata.google.internal/v1',
  'https://printer.local/v1',
  'https://intranet/v1',
  'https://user@llm.example.com/v1'
]) as url;

select lives_ok(
  $$ select public.save_llm_endpoint(tests.account_id('ai-guard-a'), 'openai_compatible', 'llama', 'https://llm.example.com:8443/v1', 'sk-x') $$,
  'accepts a public https base URL'
);

select * from finish();
rollback;
