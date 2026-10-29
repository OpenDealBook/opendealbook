begin;
select no_plan();

select enum_has_labels('public', 'embedding_job_status',
  array['queued', 'running', 'done', 'failed', 'skipped'], 'embedding_job_status carries its five labels');

select tests.create_user('ejs_owner');
select tests.login_as_service_role();
select public.create_team_account('EJS Team', tests.get_uid('ejs_owner'), 'ejs-team');

select public.append_deal_event('eeeeeeee-0000-0000-0000-0000000000a1', 'deal',
  'eeeeeeee-0000-0000-0000-0000000000a1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ejs-team'), 'firm_id', tests.create_firm(tests.account_id('ejs-team')),
    'owner_user_id', tests.get_uid('ejs_owner'), 'description', 'EJS Deal'), null, 'service');

insert into public.dr_folder (id, account_id, deal_id, name)
values ('eeeeeeee-0000-0000-0000-0000000000f1', tests.account_id('ejs-team'),
  'eeeeeeee-0000-0000-0000-0000000000a1', 'Root');

select public.append_deal_event('eeeeeeee-0000-0000-0000-0000000000a1', 'dr_document',
  'eeeeeeee-0000-0000-0000-0000000000d1', 'dr_document.added',
  jsonb_build_object('folder_id', 'eeeeeeee-0000-0000-0000-0000000000f1', 'name', 'cim.pdf',
    'storage_path', 'deal/eeeeeeee-0000-0000-0000-0000000000a1/cim.pdf'), null, 'service');

insert into public.embedding_job (id, account_id, deal_id, dr_document_id, status)
values ('eeeeeeee-0000-0000-0000-000000000011', tests.account_id('ejs-team'),
  'eeeeeeee-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-0000000000d1', 'running');

select lives_ok(
  $$ update public.embedding_job
     set status = 'skipped', skipped_reason = 'Connect an AI provider first'
     where id = 'eeeeeeee-0000-0000-0000-000000000011' $$,
  'a running embedding job can be marked skipped'
);

select is(
  (select row(status::text, skipped_reason)::text from public.embedding_job
   where id = 'eeeeeeee-0000-0000-0000-000000000011'),
  row('skipped', 'Connect an AI provider first')::text,
  'a skipped embedding job keeps the reason it was skipped'
);

select * from finish();
rollback;
