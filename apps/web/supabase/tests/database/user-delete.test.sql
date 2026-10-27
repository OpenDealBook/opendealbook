begin;
select no_plan();

select tests.create_user('ud_owner');
select tests.login_as_service_role();
select public.create_team_account('Delete Me', tests.get_uid('ud_owner'), 'ud-team');
insert into public.mailbox_connection (account_id, user_id, provider, nango_connection_id, provider_config_key, email_address, status)
values (tests.account_id('ud-team'), tests.get_uid('ud_owner'), 'gmail', 'nango-ud', 'gmail-config', 'owner@ud.test', 'active');
reset role;

select lives_ok(
  $$ delete from auth.users where id = tests.get_uid('ud_owner') $$,
  'a user who owns a mailbox connection can be deleted'
);
select is_empty(
  $$ select 1 from public.mailbox_connection where nango_connection_id = 'nango-ud' $$,
  'their mailbox connection goes with them'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'lender_room_outreach_sent_by_fkey'),
  'n',
  'deleting the sender keeps the lender outreach record and clears who sent it'
);

select tests.create_user('ud_team_owner');
select tests.create_user('ud_approver');
select public.create_team_account('Approvals', tests.get_uid('ud_team_owner'), 'ud-approvals');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('ud-approvals'), tests.get_uid('ud_approver'), 'member');
insert into public.firm (id, account_id, name)
values ('7d000000-0000-0000-0000-000000000001', tests.account_id('ud-approvals'), 'Kept Firm LLC');
insert into public.firm_verdict (id, account_id, firm_id, fit, reasons, model)
values ('7d000000-0000-0000-0000-000000000002', tests.account_id('ud-approvals'),
        '7d000000-0000-0000-0000-000000000001', true, array['fits the deal box'], 'test');
insert into public.firm_verdict_approval (verdict_id, account_id, approved_by)
values ('7d000000-0000-0000-0000-000000000002', tests.account_id('ud-approvals'), tests.get_uid('ud_approver'));

select lives_ok(
  $$ delete from auth.users where id = tests.get_uid('ud_approver') $$,
  'a user who approved a firm can be deleted'
);
select results_eq(
  $$ select approved_by from public.firm_verdict_approval where verdict_id = '7d000000-0000-0000-0000-000000000002' $$,
  $$ values (null::uuid) $$,
  'the approval stays and no longer names who approved it'
);
select ok(
  public.firm_outreach_approved('7d000000-0000-0000-0000-000000000001'),
  'the firm stays approved for outreach'
);

select * from finish();
rollback;
