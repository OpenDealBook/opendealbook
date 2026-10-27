begin;
select no_plan();

select tests.create_user('cw_owner');
select tests.create_user('cw_worker');
select tests.create_user('cw_workonly');
select tests.create_user('cw_listonly');
select tests.create_user('cw_other');

select tests.login_as_service_role();
select public.create_team_account('Waiting Co', tests.get_uid('cw_owner'), 'cw-team');
select public.create_team_account('Elsewhere Co', tests.get_uid('cw_other'), 'cw-other');

reset role;
insert into public.roles (name, hierarchy_level) values ('cw_work_only', 98), ('cw_list_only', 99);
insert into public.role_permissions (role, permission) values ('cw_work_only', 'deals.work'), ('cw_list_only', 'checklists.manage');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('cw-team'), tests.get_uid('cw_worker'), 'member'),
  (tests.account_id('cw-team'), tests.get_uid('cw_workonly'), 'cw_work_only'),
  (tests.account_id('cw-team'), tests.get_uid('cw_listonly'), 'cw_list_only');
select tests.login_as_service_role();
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'deal', 'cf000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cw-team'), 'firm_id', tests.create_firm(tests.account_id('cw-team')), 'owner_user_id', tests.get_uid('cw_owner'), 'description', 'One'), null, 'service');
reset role;
insert into public.dr_folder (id, account_id, deal_id, name)
values ('cf000000-0000-0000-0000-0000000000f1', tests.account_id('cw-team'), 'cf000000-0000-0000-0000-0000000000d1', 'Financials');
select tests.login_as_service_role();
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'dr_document', 'cf000000-0000-0000-0000-0000000000a1', 'dr_document.added',
  jsonb_build_object('folder_id', 'cf000000-0000-0000-0000-0000000000f1', 'name', 'tax-returns.pdf',
    'storage_path', 'deal/cf000000-0000-0000-0000-0000000000d1/tax-returns.pdf'), null, 'service');

select tests.login_as('cw_owner');
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
  'checklist_item.added', '{"title": "Tax returns", "status": "requested"}'::jsonb);

-- ---- Waiting on ----
select tests.login_as('cw_worker');
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.waiting_on_set', '{"waiting_on": "seller"}'::jsonb) $$,
  'a team member marks an item waiting on the seller'
);
select results_eq(
  $$ select waiting_on, status::text from public.checklist_item where id = 'cf000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('seller'::text, 'requested'::text) $$,
  'the item waits on the seller and keeps its status'
);
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.waiting_on_set', '{"waiting_on": "bank"}'::jsonb) $$,
  '23514', null, 'only us, seller, counsel or lender can be waited on'
);
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.waiting_on_set', '{"waiting_on": null}'::jsonb) $$,
  'waiting on can be cleared'
);
select is(
  (select waiting_on from public.checklist_item where id = 'cf000000-0000-0000-0000-0000000000c1'),
  null, 'and the item waits on no one'
);

-- ---- Notes ----
select tests.login_as('cw_worker');
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
  'checklist_item.note_posted', '{"body": "Seller says Friday"}'::jsonb);
select results_eq(
  $$ select body, author_user_id, created_at is not null from public.checklist_item_note
     where checklist_item_id = 'cf000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('Seller says Friday'::text, tests.get_uid('cw_worker'), true) $$,
  'a note keeps its author and time'
);

select tests.login_as('cw_workonly');
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.note_posted', '{"body": "Chased again"}'::jsonb) $$,
  'deal work alone is enough to post a note'
);
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.waiting_on_set', '{"waiting_on": "us"}'::jsonb) $$,
  '42501', null, 'but not to change the item'
);

select tests.login_as('cw_listonly');
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.note_posted', '{"body": "Reviewed draft"}'::jsonb) $$,
  'managing checklists alone is enough to post a note'
);

select tests.login_as('cw_other');
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.note_posted', '{"body": "Let me in"}'::jsonb) $$,
  '42501', null, 'another team cannot post a note'
);
select is_empty(
  $$ select 1 from public.checklist_item_note where checklist_item_id = 'cf000000-0000-0000-0000-0000000000c1' $$,
  'nor read the notes'
);

select tests.login_as('cw_owner');
select results_eq(
  $$ select body from public.checklist_item_note where checklist_item_id = 'cf000000-0000-0000-0000-0000000000c1' order by created_at $$,
  $$ values ('Seller says Friday'::text), ('Chased again'::text), ('Reviewed draft'::text) $$,
  'the team reads the whole thread in the order it was written'
);
select throws_ok(
  $$ update public.checklist_item_note set body = 'Edited' $$,
  '42501', null, 'notes cannot be edited'
);
select throws_ok(
  $$ delete from public.checklist_item_note $$,
  '42501', null, 'notes cannot be deleted'
);

-- ---- Linked document ----
select tests.login_as('cw_worker');
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
  'checklist_item.document_linked', '{"document_id": "cf000000-0000-0000-0000-0000000000a1"}'::jsonb);
select is(
  (select linked_document_id from public.checklist_item where id = 'cf000000-0000-0000-0000-0000000000c1'),
  'cf000000-0000-0000-0000-0000000000a1'::uuid, 'an item links a data-room document'
);

-- ---- Replay rebuilds the thread ----
select tests.login_as_service_role();
select public.replay_deal('cf000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select count(*), min(waiting_on) from (
       select n.id, i.waiting_on from public.checklist_item_note n
       join public.checklist_item i on i.id = n.checklist_item_id
       where i.id = 'cf000000-0000-0000-0000-0000000000c1' and i.linked_document_id = 'cf000000-0000-0000-0000-0000000000a1') t $$,
  $$ values (3::bigint, null::text) $$,
  'replay rebuilds notes and the link'
);

-- ---- Switching a deal's industry to Other ----
select tests.login_as_service_role();
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d2', 'deal', 'cf000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cw-team'), 'firm_id', tests.create_firm(tests.account_id('cw-team')), 'owner_user_id', tests.get_uid('cw_owner'), 'description', 'Two',
    'industry_id', (select id from public.industry where account_id = tests.account_id('cw-team') order by name limit 1), 'industry', 'Listed'), null, 'service');
select tests.login_as('cw_owner');
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d2', 'deal', 'cf000000-0000-0000-0000-0000000000d2', 'deal.updated',
  '{"industry_id": null, "industry": "Pet grooming"}'::jsonb);
select results_eq(
  $$ select industry_id, industry from public.deal_profile where deal_id = 'cf000000-0000-0000-0000-0000000000d2' $$,
  $$ values (null::uuid, 'Pet grooming'::text) $$,
  'switching to Other clears the listed industry'
);
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d2', 'deal', 'cf000000-0000-0000-0000-0000000000d2', 'deal.updated',
  '{"description": "Two again"}'::jsonb);
select results_eq(
  $$ select industry_id, industry from public.deal_profile where deal_id = 'cf000000-0000-0000-0000-0000000000d2' $$,
  $$ values (null::uuid, 'Pet grooming'::text) $$,
  'an update that names no industry leaves it alone'
);

-- ---- A linked document comes from the item's own deal ----
reset role;
insert into public.dr_folder (id, account_id, deal_id, name)
values ('cf000000-0000-0000-0000-0000000000f2', tests.account_id('cw-team'), 'cf000000-0000-0000-0000-0000000000d2', 'Other deal');
select tests.login_as_service_role();
select public.append_deal_event('cf000000-0000-0000-0000-0000000000d2', 'dr_document', 'cf000000-0000-0000-0000-0000000000a2', 'dr_document.added',
  jsonb_build_object('folder_id', 'cf000000-0000-0000-0000-0000000000f2', 'name', 'other.pdf',
    'storage_path', 'deal/cf000000-0000-0000-0000-0000000000d2/other.pdf'), null, 'service');
select tests.login_as('cw_worker');
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.document_linked', '{"document_id": "cf000000-0000-0000-0000-0000000000a2"}'::jsonb) $$,
  '23514', null, 'a document from another deal cannot be linked'
);
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.document_linked', '{"document_id": null}'::jsonb) $$,
  'a linked document can be unlinked'
);
select is(
  (select linked_document_id from public.checklist_item where id = 'cf000000-0000-0000-0000-0000000000c1'),
  null, 'and the item links no document'
);

-- ---- The checklist item holds the only link to a document ----
select hasnt_column('public', 'dr_document', 'checklist_item_id', 'a document no longer points at a checklist item');
select hasnt_trigger('public', 'dr_document', 'same_team_checklist_item_id', 'and nothing guards that old link');
select tests.login_as_service_role();
select lives_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'dr_document', 'cf000000-0000-0000-0000-0000000000a3', 'dr_document.added',
       jsonb_build_object('folder_id', 'cf000000-0000-0000-0000-0000000000f1', 'name', 'old-style.pdf',
         'storage_path', 'deal/cf000000-0000-0000-0000-0000000000d1/old-style.pdf',
         'checklist_item_id', 'cf000000-0000-0000-0000-0000000000c1'), null, 'service') $$,
  'history that named a checklist item on the document still projects'
);

-- ---- Deal work alone may request an item from the seller, as the person ----
select tests.login_as('cw_workonly');
select lives_ok(
  $$ select public.append_deal_events('cf000000-0000-0000-0000-0000000000d1', jsonb_build_array(
       jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', 'cf000000-0000-0000-0000-0000000000c1',
         'event_type', 'checklist_item.status_changed', 'payload', jsonb_build_object('status', 'requested', 'requested_at', now())),
       jsonb_build_object('aggregate_type', 'checklist_item', 'aggregate_id', 'cf000000-0000-0000-0000-0000000000c1',
         'event_type', 'checklist_item.waiting_on_set', 'payload', jsonb_build_object('waiting_on', 'seller')))) $$,
  'deal work alone marks an item requested and waiting on the seller'
);
select results_eq(
  $$ select status::text, waiting_on, updated_by from public.checklist_item where id = 'cf000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('requested'::text, 'seller'::text, tests.get_uid('cw_workonly')) $$,
  'under that person''s name'
);
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.status_changed', '{"status": "received"}'::jsonb) $$,
  '42501', null, 'but not any other status'
);
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.status_changed', '{"status": "requested", "outcome": "accepted"}'::jsonb) $$,
  '42501', null, 'nor anything else alongside the request'
);
select tests.login_as('cw_other');
select throws_ok(
  $$ select public.append_deal_event('cf000000-0000-0000-0000-0000000000d1', 'checklist_item', 'cf000000-0000-0000-0000-0000000000c1',
       'checklist_item.waiting_on_set', '{"waiting_on": "seller"}'::jsonb) $$,
  '42501', null, 'and never on another team''s deal'
);

-- ---- A verification finding names every checklist item behind its document ----
select hasnt_column('public', 'verification_finding', 'checklist_item_id', 'a finding no longer names a single item');
select col_type_is('public', 'verification_finding', 'checklist_item_ids', 'uuid[]', 'it names a list of items');
select col_default_is('public', 'verification_finding', 'checklist_item_ids', '{}', 'which starts empty');

select * from finish();
rollback;
