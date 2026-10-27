begin;
select no_plan();

select tests.create_user('ros_a_owner');
select tests.create_user('ros_b_owner');
select tests.create_user('ros_b_member');
select tests.login_as_service_role();
select public.create_team_account('Steps A', tests.get_uid('ros_a_owner'), 'ros-team-a');
select public.create_team_account('Steps B', tests.get_uid('ros_b_owner'), 'ros-team-b');
insert into public.accounts_memberships (account_id, user_id, account_role)
values (tests.account_id('ros-team-b'), tests.get_uid('ros_b_member'), 'member');

create temp table b_sequence as
with inserted as (
  insert into public.outreach_sequence (account_id, name)
  values (tests.account_id('ros-team-b'), 'Two touches')
  returning id
)
select id from inserted;
grant select on b_sequence to authenticated;

insert into public.outreach_step (account_id, sequence_id, ordinal, delay_days, channel, subject, body)
values
  (tests.account_id('ros-team-b'), (select id from b_sequence), 1, 0, 'email', 'Hello', 'First'),
  (tests.account_id('ros-team-b'), (select id from b_sequence), 2, 7, 'email', 'Again', 'Second');

create temp view b_steps as
select ordinal, delay_days, channel::text, subject, body
from public.outreach_step where sequence_id = (select id from b_sequence) order by ordinal;
grant select on b_steps to authenticated;

select tests.login_as('ros_b_owner');
select lives_ok(
  $$ select public.replace_outreach_steps(
       tests.account_id('ros-team-b'),
       (select id from b_sequence),
       '[{"ordinal": 1, "delay_days": 0, "channel": "letter", "subject": null, "body": "Dear owner"},
         {"ordinal": 2, "delay_days": 7, "channel": "email", "subject": "My letter", "body": "Hi"}]'
     ) $$,
  'a deal manager replaces the steps'
);
select tests.login_as_service_role();
select results_eq(
  $$ select * from b_steps $$,
  $$ values (1, 0, 'letter', null::text, 'Dear owner'), (2, 7, 'email', 'My letter', 'Hi') $$,
  'the sequence holds exactly the new steps'
);

select tests.login_as('ros_b_owner');
select throws_ok(
  $$ select public.replace_outreach_steps(
       tests.account_id('ros-team-b'),
       (select id from b_sequence),
       '[{"ordinal": 1, "delay_days": 0, "channel": "email", "subject": null, "body": "No subject"}]'
     ) $$,
  '23514', null, 'a refused step leaves the old steps in place'
);
select tests.login_as_service_role();
select is((select count(*) from b_steps), 2::bigint, 'both old steps are still there');

select tests.login_as('ros_b_member');
select throws_ok(
  $$ select public.replace_outreach_steps(
       tests.account_id('ros-team-b'),
       (select id from b_sequence),
       '[{"ordinal": 1, "delay_days": 0, "channel": "email", "subject": "S", "body": "B"}]'
     ) $$,
  '42501', null, 'a member without deals.manage cannot replace steps'
);

select tests.login_as('ros_a_owner');
select throws_ok(
  $$ select public.replace_outreach_steps(
       tests.account_id('ros-team-a'),
       (select id from b_sequence),
       '[{"ordinal": 1, "delay_days": 0, "channel": "email", "subject": "S", "body": "B"}]'
     ) $$,
  '42501', 'rows cannot link across teams', 'another team cannot replace the steps'
);

select tests.login_as_service_role();
select results_eq(
  $$ select * from b_steps $$,
  $$ values (1, 0, 'letter', null::text, 'Dear owner'), (2, 7, 'email', 'My letter', 'Hi') $$,
  'refused callers changed nothing'
);

select * from finish();
rollback;
