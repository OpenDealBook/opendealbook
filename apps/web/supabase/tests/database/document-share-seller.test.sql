begin;
select no_plan();

select has_column('public', 'document_share', 'delivered_at', 'document_share records when the seller email was delivered');

select tests.create_user('ds_owner');
select tests.create_user('ds_seller');
select tests.create_user('ds_outsider');

select tests.login_as_service_role();
select public.create_team_account('DS Team', tests.get_uid('ds_owner'), 'ds-team');
select public.append_deal_event('2d000000-0000-0000-0000-0000000000d1', 'deal',
  '2d000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('ds-team'), 'firm_id', tests.create_firm(tests.account_id('ds-team')), 'owner_user_id', tests.get_uid('ds_owner'),
    'description', 'Seller share deal'), null, 'service');

reset role;

insert into public.generated_document (id, account_id, deal_id, pdf_path)
values ('2d000000-0000-0000-0000-0000000000a1', tests.account_id('ds-team'),
  '2d000000-0000-0000-0000-0000000000d1', 'acct/deal/doc.pdf');

insert into public.document_share (id, account_id, generated_document_id, recipient_user_id, permission, sent_at)
values ('2d000000-0000-0000-0000-0000000000b1', tests.account_id('ds-team'),
  '2d000000-0000-0000-0000-0000000000a1', tests.get_uid('ds_seller'), 'view', now());

select tests.login_as('ds_outsider');
select is(
  public.open_document_share('2d000000-0000-0000-0000-0000000000b1'),
  null,
  'someone other than the recipient cannot open the share'
);

reset role;
select is(
  (select first_viewed_at from public.document_share where id = '2d000000-0000-0000-0000-0000000000b1'),
  null,
  'a refused open does not mark the share viewed'
);

select tests.login_as('ds_seller');
select is(
  public.open_document_share('2d000000-0000-0000-0000-0000000000b1'),
  'acct/deal/doc.pdf',
  'the recipient opens the share and gets the document PDF path'
);

reset role;
select isnt(
  (select first_viewed_at from public.document_share where id = '2d000000-0000-0000-0000-0000000000b1'),
  null,
  'opening marks the share viewed'
);

update public.document_share set first_viewed_at = '2026-01-01T00:00:00Z'
where id = '2d000000-0000-0000-0000-0000000000b1';

select tests.login_as('ds_seller');
select public.open_document_share('2d000000-0000-0000-0000-0000000000b1');

reset role;
select is(
  (select first_viewed_at from public.document_share where id = '2d000000-0000-0000-0000-0000000000b1'),
  '2026-01-01T00:00:00Z'::timestamptz,
  'opening again keeps the first view time'
);

select * from finish();
rollback;
