begin;
select no_plan();

-- tbm_owner manages deals on "TBM Team"; tbm_viewer is a read-only member.
select tests.create_user('tbm_owner');
select tests.create_user('tbm_viewer');

select tests.login_as_service_role();
select public.create_team_account('TBM Team', tests.get_uid('tbm_owner'), 'tbm-team');
insert into public.accounts_memberships (account_id, user_id, account_role) values
  (tests.account_id('tbm-team'), tests.get_uid('tbm_viewer'), 'viewer');

select tests.login_as('tbm_viewer');
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id) values ('templates', %L, %L) $$,
    tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a1/v1.docx',
    tests.get_uid('tbm_viewer')::text
  ),
  '42501',
  null,
  'a read-only member cannot upload a template file'
);

select tests.login_as('tbm_owner');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id) values ('templates', %L, %L) $$,
    tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a2/v1.docx',
    tests.get_uid('tbm_owner')::text
  ),
  'a deal manager uploads a template file'
);

select tests.login_as('tbm_viewer');
update storage.objects set metadata = '{"overwritten": true}'
where bucket_id = 'templates'
  and name = tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a2/v1.docx';

select tests.login_as_service_role();
select is(
  (select metadata from storage.objects
   where bucket_id = 'templates'
     and name = tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a2/v1.docx'),
  null,
  'a read-only member cannot overwrite a template file'
);

select tests.login_as('tbm_owner');
update storage.objects set metadata = '{"overwritten": true}'
where bucket_id = 'templates'
  and name = tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a2/v1.docx';

select tests.login_as_service_role();
select is(
  (select metadata from storage.objects
   where bucket_id = 'templates'
     and name = tests.account_id('tbm-team') || '/7b000000-0000-0000-0000-0000000000a2/v1.docx'),
  '{"overwritten": true}'::jsonb,
  'a deal manager overwrites a template file'
);

select * from finish();
rollback;
