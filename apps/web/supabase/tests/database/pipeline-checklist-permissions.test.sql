begin;
select no_plan();

-- One account; its owner holds the managing permissions, a member on the member
-- role does not. pipeline_stage is gated on deals.manage, checklist_template on
-- checklists.manage. Reads are open to any account member.
select tests.create_user('pc_owner');
select tests.create_user('pc_member');

select tests.login_as_service_role();
select public.create_team_account('PC Acct', tests.get_uid('pc_owner'), 'pc-acct');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('pc-acct'), tests.get_uid('pc_member'), 'member');

insert into public.checklist_template (id, account_id, name)
values ('cccccccc-0000-0000-0000-0000000000a1', tests.account_id('pc-acct'), 'Standard');

-- ---- reads are allowed for any member ----
select tests.login_as('pc_member');
select isnt_empty(
  $$ select 1 from public.pipeline_stage where account_id = tests.account_id('pc-acct') $$,
  'a member reads the account pipeline stages'
);
select isnt_empty(
  $$ select 1 from public.checklist_template where account_id = tests.account_id('pc-acct') $$,
  'a member reads the account checklist templates'
);

-- ---- pipeline_stage writes gated on deals.manage ----
select throws_ok(
  $$ insert into public.pipeline_stage (account_id, key, label, sort_order) values (tests.account_id('pc-acct'), 'custom', 'Custom', 50) $$,
  '42501', null, 'a member without deals.manage cannot insert a pipeline stage'
);
select tests.login_as('pc_owner');
select lives_ok(
  $$ insert into public.pipeline_stage (account_id, key, label, sort_order) values (tests.account_id('pc-acct'), 'custom', 'Custom', 50) $$,
  'an owner with deals.manage can insert a pipeline stage'
);

-- A member update is filtered by the USING clause and changes nothing.
select tests.login_as('pc_member');
select lives_ok(
  $$ update public.pipeline_stage set label = 'Hijacked' where account_id = tests.account_id('pc-acct') and key = 'custom' $$,
  'a member update of a pipeline stage runs without error'
);
select is(
  (select label from public.pipeline_stage where account_id = tests.account_id('pc-acct') and key = 'custom'),
  'Custom',
  'the pipeline stage label survives a member update attempt'
);
select lives_ok(
  $$ delete from public.pipeline_stage where account_id = tests.account_id('pc-acct') and key = 'custom' $$,
  'a member delete of a pipeline stage runs without error'
);
select tests.login_as('pc_owner');
select isnt_empty(
  $$ select 1 from public.pipeline_stage where account_id = tests.account_id('pc-acct') and key = 'custom' $$,
  'the pipeline stage survives a member delete attempt'
);
select lives_ok(
  $$ delete from public.pipeline_stage where account_id = tests.account_id('pc-acct') and key = 'custom' $$,
  'an owner with deals.manage can delete a pipeline stage'
);

-- ---- checklist_template writes gated on checklists.manage ----
select tests.login_as('pc_member');
select throws_ok(
  $$ insert into public.checklist_template (account_id, name) values (tests.account_id('pc-acct'), 'Member Tmpl') $$,
  '42501', null, 'a member without checklists.manage cannot insert a checklist template'
);
select lives_ok(
  $$ update public.checklist_template set name = 'Hijacked' where id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'a member update of a checklist template runs without error'
);
select is(
  (select name from public.checklist_template where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  'Standard',
  'the checklist template name survives a member update attempt'
);
select tests.login_as('pc_owner');
select lives_ok(
  $$ insert into public.checklist_template (account_id, name) values (tests.account_id('pc-acct'), 'Owner Tmpl') $$,
  'an owner with checklists.manage can insert a checklist template'
);
select lives_ok(
  $$ update public.checklist_template set name = 'Renamed' where id = 'cccccccc-0000-0000-0000-0000000000a1' $$,
  'an owner with checklists.manage can update a checklist template'
);
select is(
  (select name from public.checklist_template where id = 'cccccccc-0000-0000-0000-0000000000a1'),
  'Renamed',
  'the owner update takes effect'
);

select * from finish();
rollback;
