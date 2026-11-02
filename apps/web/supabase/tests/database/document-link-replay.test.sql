begin;
select no_plan();

-- Deal r1 holds one live document added through the event log, linked from an
-- upload item, a verification finding and an HR audit engagement.
select tests.create_user('dlr_owner');

select tests.login_as_service_role();
select public.create_team_account('DLR Acct', tests.get_uid('dlr_owner'), 'dlr-acct');

select public.append_deal_event('d1b00000-0000-0000-0000-0000000000d1', 'deal',
  'd1b00000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('dlr-acct'), 'firm_id', tests.create_firm(tests.account_id('dlr-acct')),
    'owner_user_id', tests.get_uid('dlr_owner'), 'description', 'Replay deal'), null, 'service');

reset role;

insert into public.dr_folder (id, account_id, deal_id, name)
values ('d1b00000-0000-0000-0000-00000000f001', tests.account_id('dlr-acct'), 'd1b00000-0000-0000-0000-0000000000d1', 'Root');

select public.append_deal_event('d1b00000-0000-0000-0000-0000000000d1', 'dr_document',
  'd1b00000-0000-0000-0000-00000000d001', 'dr_document.added',
  jsonb_build_object('folder_id', 'd1b00000-0000-0000-0000-00000000f001', 'name', 'cim.pdf',
    'storage_path', 'deal/d1b00000-0000-0000-0000-0000000000d1/cim.pdf'), null, 'service');

insert into public.upload_batch (id, account_id, deal_id, kind, status)
values ('d1b00000-0000-0000-0000-000000000ba1', tests.account_id('dlr-acct'),
  'd1b00000-0000-0000-0000-0000000000d1', 'zip', 'pending');

insert into public.upload_item (batch_id, storage_path, original_path, dr_document_id)
values ('d1b00000-0000-0000-0000-000000000ba1', 'staging/cim.pdf', 'cim.pdf', 'd1b00000-0000-0000-0000-00000000d001');

insert into public.verification_run (id, account_id, deal_id, trigger)
values ('d1b00000-0000-0000-0000-0000000000e1', tests.account_id('dlr-acct'),
  'd1b00000-0000-0000-0000-0000000000d1', 'test');

insert into public.verification_finding (account_id, deal_id, run_id, check_key, severity, dr_document_id)
values (tests.account_id('dlr-acct'), 'd1b00000-0000-0000-0000-0000000000d1', 'd1b00000-0000-0000-0000-0000000000e1',
  'cim', 'info', 'd1b00000-0000-0000-0000-00000000d001');

insert into public.hr_audit_engagement (account_id, deal_id, provider, report_document_id)
values (tests.account_id('dlr-acct'), 'd1b00000-0000-0000-0000-0000000000d1', 'internal',
  'd1b00000-0000-0000-0000-00000000d001');

select public.replay_deal('d1b00000-0000-0000-0000-0000000000d1');

select results_eq(
  $$ select dr_document_id from public.upload_item where batch_id = 'd1b00000-0000-0000-0000-000000000ba1' $$,
  array['d1b00000-0000-0000-0000-00000000d001'::uuid],
  'a deal replay keeps the document an upload item became'
);

select results_eq(
  $$ select dr_document_id from public.verification_finding where deal_id = 'd1b00000-0000-0000-0000-0000000000d1' $$,
  array['d1b00000-0000-0000-0000-00000000d001'::uuid],
  'a deal replay keeps the document a verification finding concerns'
);

select results_eq(
  $$ select report_document_id from public.hr_audit_engagement where deal_id = 'd1b00000-0000-0000-0000-0000000000d1' $$,
  array['d1b00000-0000-0000-0000-00000000d001'::uuid],
  'a deal replay keeps the report document of an HR audit engagement'
);

-- Rows naming a document id that has no dr_document row.
insert into public.upload_item (batch_id, storage_path, original_path, dr_document_id)
values ('d1b00000-0000-0000-0000-000000000ba1', 'staging/gone.pdf', 'gone.pdf', 'd1b00000-0000-0000-0000-00000000d0ff');

insert into public.verification_finding (account_id, deal_id, run_id, check_key, severity, dr_document_id)
values (tests.account_id('dlr-acct'), 'd1b00000-0000-0000-0000-0000000000d1', 'd1b00000-0000-0000-0000-0000000000e1',
  'gone', 'info', 'd1b00000-0000-0000-0000-00000000d0ff');

update public.hr_audit_engagement
set report_document_id = 'd1b00000-0000-0000-0000-00000000d0ff'
where deal_id = 'd1b00000-0000-0000-0000-0000000000d1';

select tests.login_as('dlr_owner');

select results_eq(
  $$ select original_path from public.upload_item where batch_id = 'd1b00000-0000-0000-0000-000000000ba1' order by original_path $$,
  array['cim.pdf', 'gone.pdf'],
  'the team still reads an upload item whose document is missing'
);

select results_eq(
  $$ select check_key from public.verification_finding where deal_id = 'd1b00000-0000-0000-0000-0000000000d1' order by check_key $$,
  array['cim', 'gone'],
  'the team still reads a verification finding whose document is missing'
);

select results_eq(
  $$ select provider from public.hr_audit_engagement where deal_id = 'd1b00000-0000-0000-0000-0000000000d1' $$,
  array['internal'],
  'the team still reads an HR audit engagement whose report document is missing'
);

select results_eq(
  $$ select d.name from public.dr_document d
     join public.upload_item i on i.dr_document_id = d.id
     where i.batch_id = 'd1b00000-0000-0000-0000-000000000ba1' $$,
  array['cim.pdf'],
  'the team sees the live document behind a link and nothing behind a link whose document is missing'
);

select tests.login_as_service_role();

select public.append_deal_event('d1b00000-0000-0000-0000-0000000000d1', 'dr_document',
  'd1b00000-0000-0000-0000-00000000d001', 'dr_document.removed', '{}'::jsonb, null, 'service');

select tests.login_as('dlr_owner');

select is_empty(
  $$ select d.id from public.dr_document d
     where d.id in (
       select dr_document_id from public.upload_item where batch_id = 'd1b00000-0000-0000-0000-000000000ba1'
       union select dr_document_id from public.verification_finding where deal_id = 'd1b00000-0000-0000-0000-0000000000d1'
       union select report_document_id from public.hr_audit_engagement where deal_id = 'd1b00000-0000-0000-0000-0000000000d1'
     ) $$,
  'the team sees no document behind a link once that document is removed'
);

select * from finish();
rollback;
