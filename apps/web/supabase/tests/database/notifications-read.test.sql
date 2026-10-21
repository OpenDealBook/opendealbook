begin;
select no_plan();

select tests.create_user('nread_owner');
select tests.create_user('nread_member');

select tests.login_as_service_role();
select public.create_team_account('Nread Team', tests.get_uid('nread_owner'), 'nread-team');

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('nread_member'), tests.account_id('nread-team'), 'member');

insert into public.notifications (account_id, recipient_user_id, body)
values
  (tests.account_id('nread-team'), tests.get_uid('nread_member'), 'member first'),
  (tests.account_id('nread-team'), tests.get_uid('nread_member'), 'member second'),
  (tests.account_id('nread-team'), tests.get_uid('nread_owner'), 'owner only'),
  (tests.account_id('nread-team'), null, 'broadcast');

select set_config('nread.owner_only', id::text, false)
from public.notifications where body = 'owner only';

select tests.login_as('nread_member');

select is_empty(
  $$ select 1 from public.notification_reads $$,
  'a new notification starts unread'
);

select lives_ok(
  $$ select public.mark_all_notifications_read(tests.account_id('nread-team')) $$,
  'a member can mark all their notifications read'
);

select bag_eq(
  $$ select n.body from public.notification_reads r join public.notifications n on n.id = r.notification_id $$,
  $$ values ('member first'), ('member second'), ('broadcast') $$,
  'mark all read records a read for every notification the member sees'
);

select lives_ok(
  $$ select public.mark_all_notifications_read(tests.account_id('nread-team')) $$,
  'marking all read twice is harmless'
);

select is_empty(
  $$ select 1 from public.notifications where body like 'member%' and dismissed $$,
  'marking read does not dismiss'
);

select throws_ok(
  $$ insert into public.notification_reads (notification_id)
     values (current_setting('nread.owner_only')::bigint) $$,
  '42501',
  null,
  'a member cannot mark read a notification they cannot see'
);

select tests.login_as('nread_owner');

select is_empty(
  $$ select 1 from public.notification_reads $$,
  'one member reading a broadcast leaves it unread for the rest of the team'
);

select tests.login_as_service_role();

select has_column('public', 'notifications', 'deal_id', 'a notification can name its deal');
select hasnt_column('public', 'notifications', 'read_at', 'read state no longer lives on the notification');

select public.append_deal_event('b0400000-0000-0000-0000-0000000000d1', 'deal',
  'b0400000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('nread-team'), 'owner_user_id', tests.get_uid('nread_owner'),
    'description', 'Read state deal'), null, 'service');
select public.append_deal_event('b0400000-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('nread_member'), 'party', 'buyer'), null, 'service');

select tests.login_as('nread_owner');
select public.append_deal_event('b0400000-0000-0000-0000-0000000000d1', 'deal',
  'b0400000-0000-0000-0000-0000000000d1', 'deal.stage_changed', '{"stage":"loi_submitted"}'::jsonb);

select tests.login_as_service_role();
select results_eq(
  $$ select deal_id from public.notifications where body = 'Deal moved to loi_submitted' $$,
  $$ values ('b0400000-0000-0000-0000-0000000000d1'::uuid) $$,
  'a stage-move notice names its deal'
);

select * from finish();
rollback;
