begin;
select no_plan();

select tests.create_user('aik_owner');
select tests.login_as_service_role();
select public.create_team_account('AI Key Team', tests.get_uid('aik_owner'), 'ai-key-team');
select public.create_team_account('AI Key Gone', tests.get_uid('aik_owner'), 'ai-key-gone');

select tests.login_as('aik_owner');
select public.save_llm_endpoint(tests.account_id('ai-key-team'), 'openai', 'gpt-x', 'https://api.openai.com/v1', 'sk-kept');
select public.save_llm_endpoint(tests.account_id('ai-key-gone'), 'openai', 'gpt-x', 'https://api.openai.com/v1', 'sk-deleted');
select tests.login_as_service_role();

create temp table key_ids as
select a.slug, e.api_key_secret_id as secret_id
from public.llm_endpoint e join public.accounts a on a.id = e.account_id
where a.slug in ('ai-key-team', 'ai-key-gone');

delete from public.accounts where slug = 'ai-key-gone';

select is(
  (select count(*) from vault.secrets where id = (select secret_id from key_ids where slug = 'ai-key-gone')),
  0::bigint,
  'deleting a team deletes its AI provider key from the vault'
);

select is(
  (select decrypted_secret from vault.decrypted_secrets where id = (select secret_id from key_ids where slug = 'ai-key-team')),
  'sk-kept',
  'other teams keep their AI provider key'
);

select tests.login_as('aik_owner');
select public.disconnect_llm_endpoint(tests.account_id('ai-key-team'));
select tests.login_as_service_role();

select is(
  (select count(*) from vault.secrets where id = (select secret_id from key_ids where slug = 'ai-key-team')),
  0::bigint,
  'disconnecting deletes the AI provider key from the vault'
);

select * from finish();
rollback;
