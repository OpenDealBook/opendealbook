begin;
select no_plan();

select tests.create_user('bl_owner');
select tests.create_user('bl_member');
select tests.create_user('bl_invitee');
select tests.create_user('bl_seller');
select tests.create_user('bl_lender');
select tests.create_user('bl_open_owner');
select tests.create_user('bl_open_member');

select tests.login_as_service_role();
select public.create_team_account('Locked Co', tests.get_uid('bl_owner'), 'locked-co');
select public.create_team_account('Open Co', tests.get_uid('bl_open_owner'), 'open-co');
select public.create_team_account('Other Co', tests.get_uid('bl_open_owner'), 'other-co');

select public.append_deal_event('b1000000-0000-0000-0000-0000000000d1', 'deal',
  'b1000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('locked-co'), 'firm_id', tests.create_firm(tests.account_id('locked-co')), 'owner_user_id', tests.get_uid('bl_owner'),
    'description', 'Locked deal'), null, 'service');
select public.append_deal_event('b1000000-0000-0000-0000-0000000000d1', 'deal_participant',
  gen_random_uuid(), 'deal_participant.added',
  jsonb_build_object('user_id', tests.get_uid('bl_seller'), 'party', 'seller', 'permission', 'view'), null, 'service');

select public.append_deal_event('b1000000-0000-0000-0000-0000000000d2', 'deal',
  'b1000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('open-co'), 'firm_id', tests.create_firm(tests.account_id('open-co')), 'owner_user_id', tests.get_uid('bl_open_owner'),
    'description', 'Open deal'), null, 'service');

reset role;

insert into public.accounts_memberships (account_id, user_id, account_role)
values
  (tests.account_id('locked-co'), tests.get_uid('bl_member'), 'member'),
  (tests.account_id('open-co'), tests.get_uid('bl_open_member'), 'member'),
  (tests.account_id('open-co'), tests.get_uid('bl_owner'), 'admin');

insert into public.firm (id, account_id, name)
values
  ('b1000000-0000-0000-0000-0000000000c1', tests.account_id('locked-co'), 'Locked firm'),
  ('b1000000-0000-0000-0000-0000000000c2', tests.account_id('open-co'), 'Open firm');

insert into public.checklist_template (id, account_id, name)
values
  ('b1000000-0000-0000-0000-0000000000c4', tests.account_id('locked-co'), 'Locked list'),
  ('b1000000-0000-0000-0000-0000000000c5', tests.account_id('open-co'), 'Open list'),
  ('b1000000-0000-0000-0000-0000000000c7', tests.account_id('other-co'), 'Other list');
insert into public.checklist_template_item (id, template_id, title)
values
  ('b1000000-0000-0000-0000-0000000000c6', 'b1000000-0000-0000-0000-0000000000c4', 'Locked item'),
  ('b1000000-0000-0000-0000-0000000000c8', 'b1000000-0000-0000-0000-0000000000c5', 'Open item');
insert into public.firm (id, account_id, name)
values ('b1000000-0000-0000-0000-0000000000c9', tests.account_id('other-co'), 'Other firm');

insert into public.saved_view (id, account_id, owner_user_id, name)
values ('b1000000-0000-0000-0000-0000000000c3', tests.account_id('open-co'), tests.get_uid('bl_owner'), 'Mine');

insert into public.invitations (account_id, email, role, invited_by, invite_token, expires_at)
values (tests.account_id('locked-co'), 'bl_invitee@tuckin.test', 'member', tests.get_uid('bl_owner'), 'bl-token', now() + interval '1 day');

insert into public.diligence_schedule (id, deal_id, account_id, start_date)
values ('b1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000d1', tests.account_id('locked-co'), current_date);
insert into public.schedule_week (id, schedule_id, account_id, week_no, starts_on, theme)
values ('b1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000e1', tests.account_id('locked-co'), 1, current_date, 'Financials');
insert into public.seller_question (id, deal_id, account_id, schedule_week_id, question)
values ('b1000000-0000-0000-0000-0000000000a5', 'b1000000-0000-0000-0000-0000000000d1', tests.account_id('locked-co'), 'b1000000-0000-0000-0000-0000000000f1', 'Trailing P&L?');

insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values ('b1000000-0000-0000-0000-00000000f00a', tests.account_id('locked-co'), 'b1000000-0000-0000-0000-0000000000d1', null, 'Room folder');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values ('b1000000-0000-0000-0000-0000000000a0', tests.account_id('locked-co'), 'b1000000-0000-0000-0000-0000000000d1', 'Lender', 'b1000000-0000-0000-0000-00000000f00a');
insert into public.lender_room_member (room_id, user_id, email, invited_by)
values ('b1000000-0000-0000-0000-0000000000a0', tests.get_uid('bl_lender'), 'bl_lender@tuckin.test', tests.get_uid('bl_owner'));
insert into public.lender_ask (id, room_id, account_id, kind, title, created_by)
values ('b1000000-0000-0000-0000-00000000a5a0', 'b1000000-0000-0000-0000-0000000000a0', tests.account_id('locked-co'), 'ask', 'Lender asks', tests.get_uid('bl_lender'));

update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('locked-co');

select tests.login_as('bl_owner');

select throws_ok(
  $$ insert into public.firm (account_id, name) values (tests.account_id('locked-co'), 'New firm') $$,
  '42501', 'team is read-only', 'a locked team cannot add a row to its own table'
);
select throws_ok(
  $$ update public.dr_folder set name = 'Renamed folder' where id = 'b1000000-0000-0000-0000-00000000f00a' $$,
  '42501', 'team is read-only', 'a locked team cannot edit its data room'
);
select throws_ok(
  $$ select public.append_deal_event('b1000000-0000-0000-0000-0000000000d1', 'deal',
       'b1000000-0000-0000-0000-0000000000d1', 'deal.updated', '{"description": "via event"}'::jsonb) $$,
  '42501', 'team is read-only', 'a locked team cannot write through a security definer function'
);
select throws_ok(
  $$ update public.accounts set name = 'Renamed' where id = tests.account_id('locked-co') $$,
  '42501', 'team is read-only', 'a locked team cannot be renamed'
);
select throws_ok(
  $$ update public.seller_question set question = 'edited' where id = 'b1000000-0000-0000-0000-0000000000a5' $$,
  '42501', 'team is read-only', 'a locked team cannot edit its seller questions'
);
select throws_ok(
  $$ update public.lender_room set name = 'Renamed room' where id = 'b1000000-0000-0000-0000-0000000000a0' $$,
  '42501', 'team is read-only', 'a locked team cannot change its lender rooms'
);

select throws_ok(
  $$ insert into public.deal_calc_defaults (account_id, after_standby) values (tests.account_id('locked-co'), 'remaining_term') $$,
  '42501', 'team is read-only', 'a locked team cannot change its calculator defaults'
);
select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('locked-co'), 'CI', '\x00', 'odb_x', '{read}', tests.get_uid('bl_owner')) $$,
  '42501', 'team is read-only', 'a locked team cannot issue an API key'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('data-room', 'deal/b1000000-0000-0000-0000-0000000000d1/x-locked.pdf', tests.get_uid('bl_owner')::text) $$,
  '42501', null, 'a locked team cannot upload to its data room'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('templates', tests.account_id('locked-co') || '/t/v1.docx', tests.get_uid('bl_owner')::text) $$,
  '42501', null, 'a locked team cannot upload a template file'
);

select throws_ok(
  $$ update public.firm set account_id = tests.account_id('open-co')
     where id = 'b1000000-0000-0000-0000-0000000000c1' $$,
  '42501', 'rows cannot move between teams', 'a row cannot leave a locked team'
);
select throws_ok(
  $$ update public.checklist_template_item set template_id = 'b1000000-0000-0000-0000-0000000000c5'
     where id = 'b1000000-0000-0000-0000-0000000000c6' $$,
  '42501', 'rows cannot move between teams', 'a row cannot leave a locked team through its parent'
);
select throws_ok(
  $$ update public.firm set account_id = tests.account_id('locked-co')
     where id = 'b1000000-0000-0000-0000-0000000000c2' $$,
  '42501', 'rows cannot move between teams', 'a row cannot leave an open team'
);
select throws_ok(
  $$ update public.saved_view set account_id = tests.account_id('locked-co')
     where id = 'b1000000-0000-0000-0000-0000000000c3' $$,
  '42501', 'rows cannot move between teams', 'a row in a table the lock exempts still cannot change team'
);
select throws_ok(
  $$ update public.lender_ask set title = 'Edited by the team'
     where id = 'b1000000-0000-0000-0000-00000000a5a0' $$,
  '42501', 'team is read-only', 'a locked team cannot edit a lender ask'
);
select lives_ok(
  $$ update public.accounts_memberships set account_role = 'deal_lead'
     where account_id = tests.account_id('locked-co') and user_id = tests.get_uid('bl_member') $$,
  'the owner of a locked team still changes a member''s role'
);
select is(
  (select account_role::text from public.accounts_memberships
   where account_id = tests.account_id('locked-co') and user_id = tests.get_uid('bl_member')),
  'deal_lead',
  'the member now holds the new role'
);

select tests.login_as('bl_member');
reset role;

select throws_ok(
  $$ update public.accounts_memberships set account_role = 'admin'
     where account_id = tests.account_id('locked-co') and user_id = tests.get_uid('bl_member') $$,
  '42501', 'team is read-only', 'a member who is not the owner cannot change roles on a locked team'
);

select tests.login_as('bl_owner');

select lives_ok(
  $$ insert into public.lender_ask_message (ask_id, side, body)
     values ('b1000000-0000-0000-0000-00000000a5a0', 'internal', 'Here you go') $$,
  'a locked team still replies to lender asks'
);
select lives_ok(
  $$ update public.lender_ask set status = 'answered', first_response_at = now()
     where id = 'b1000000-0000-0000-0000-00000000a5a0' $$,
  'a locked team still moves its lender ask threads'
);
select throws_ok(
  $$ update public.lender_ask set status = 'open'
     where id = 'b1000000-0000-0000-0000-00000000a5a0' $$,
  '42501', 'team is read-only', 'a locked team cannot reopen a lender ask'
);
select lives_ok(
  $$ update public.lender_ask set status = 'closed'
     where id = 'b1000000-0000-0000-0000-00000000a5a0' $$,
  'a locked team still closes a lender ask'
);
select lives_ok(
  $$ delete from public.accounts_memberships
     where account_id = tests.account_id('locked-co') and user_id = tests.get_uid('bl_member') $$,
  'a locked team still removes members'
);
select is_empty(
  $$ select 1 from public.accounts_memberships
     where account_id = tests.account_id('locked-co') and user_id = tests.get_uid('bl_member') $$,
  'the removed member is gone'
);

select tests.login_as('bl_seller');

select lives_ok(
  $$ update public.seller_question set answer = 'Attached', answered_at = now(), status = 'received'
     where id = 'b1000000-0000-0000-0000-0000000000a5' $$,
  'a seller still answers a locked team''s questions'
);

select tests.login_as_service_role();

select is(
  (select answer from public.seller_question where id = 'b1000000-0000-0000-0000-0000000000a5'),
  'Attached',
  'the seller''s answer is saved'
);
select lives_ok(
  $$ insert into public.lender_ask_message (ask_id, author_user_id, side, body)
     values ('b1000000-0000-0000-0000-00000000a5a0', tests.get_uid('bl_lender'), 'lender', 'Thanks') $$,
  'a lender still writes in a locked team''s room'
);
select lives_ok(
  $$ insert into public.firm (account_id, name) values (tests.account_id('locked-co'), 'From a job') $$,
  'an in-flight server job still finishes its write'
);
select throws_ok(
  $$ select public.accept_invitation('bl-token', tests.get_uid('bl_invitee')) $$,
  '42501', 'team is read-only', 'nobody joins a locked team'
);

select tests.login_as('bl_open_owner');

select lives_ok(
  $$ insert into public.firm (account_id, name) values (tests.account_id('open-co'), 'Open firm') $$,
  'an unlocked team writes as usual'
);
select lives_ok(
  $$ insert into public.deal_calc_defaults (account_id, after_standby) values (tests.account_id('open-co'), 'remaining_term') $$,
  'an unlocked team sets its calculator defaults'
);
select lives_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('open-co'), 'CI', '\x00', 'odb_y', '{read}', tests.get_uid('bl_open_owner')) $$,
  'an unlocked team''s owner issues an API key'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('data-room', 'deal/b1000000-0000-0000-0000-0000000000d2/x-open.pdf', tests.get_uid('bl_open_owner')::text) $$,
  'an unlocked team uploads to its data room'
);

select tests.login_as('bl_open_member');

select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('open-co'), 'CI', '\x00', 'odb_z', '{read}', tests.get_uid('bl_open_member')) $$,
  '42501', null, 'a member without api_keys.manage cannot issue an API key'
);
select throws_ok(
  $$ insert into public.api_key (account_id, name, key_hash, key_prefix, scopes, created_by)
     values (tests.account_id('open-co'), 'CI', '\x00', 'odb_w', '{read}', tests.get_uid('bl_open_owner')) $$,
  '42501', null, 'nobody issues an API key in someone else''s name'
);

select tests.login_as('bl_open_owner');

select throws_ok(
  $$ update public.checklist_template_item set template_id = 'b1000000-0000-0000-0000-0000000000c7'
     where id = 'b1000000-0000-0000-0000-0000000000c8' $$,
  '42501', 'rows cannot move between teams', 'a row cannot move between two open teams through its parent'
);
select throws_ok(
  $$ insert into public.contact (account_id, firm_id, name)
     values (tests.account_id('open-co'), 'b1000000-0000-0000-0000-0000000000c9', 'Crossed') $$,
  '42501', 'rows cannot link across teams', 'a row cannot link to another team''s row'
);
select lives_ok(
  $$ insert into public.contact (account_id, firm_id, name)
     values (tests.account_id('open-co'), 'b1000000-0000-0000-0000-0000000000c2', 'Same team') $$,
  'a row links to its own team''s row'
);

select tests.login_as_service_role();

select throws_ok(
  $$ insert into public.contact (account_id, firm_id, name)
     values (tests.account_id('open-co'), 'b1000000-0000-0000-0000-0000000000c9', 'From a job') $$,
  '42501', 'rows cannot link across teams', 'a server job cannot link across teams either'
);
select throws_ok(
  $$ insert into public.comp (data_class, source, source_label, deal_id)
     values ('external', 'bizbuysell', 'BizBuySell', 'b1000000-0000-0000-0000-0000000000d2') $$,
  '42501', 'rows cannot link across teams', 'a shared row cannot link to a team''s row'
);
select lives_ok(
  $$ insert into public.comp (data_class, source, source_label)
     values ('external', 'bizbuysell', 'BizBuySell') $$,
  'a shared row that links to no team''s row is written as usual'
);

select tests.login_as('bl_owner');

select lives_ok(
  $$ delete from public.accounts where id = tests.account_id('locked-co') $$,
  'a locked team can still be deleted'
);

reset role;

select is_empty(
  $$ select 1 from public.accounts where slug = 'locked-co' $$,
  'the deleted team is gone'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and not a.attisdropped
          and a.attname in ('account_id', 'deal_id', 'room_id')
      )
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'refuse_write_when_team_locked'
      )
      and c.relname not in (select table_name from tuckin.billing_lock_exempt_tables)
  $$,
  'every team table is locked or names why it is exempt'
);

select is_empty(
  $$
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and not a.attisdropped
          and a.attname in ('account_id', 'deal_id', 'room_id')
      )
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgname in ('refuse_write_when_team_locked', 'refuse_team_move')
      )
  $$,
  'every team table refuses moving its rows to another team'
);

select is_empty(
  $$
    select child.relname || '.' || a.attname
    from pg_constraint k
    join pg_class child on child.oid = k.conrelid
    join pg_class parent on parent.oid = k.confrelid
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.contype = 'f'
      and array_length(k.conkey, 1) = 1
      and child.relnamespace = 'public'::regnamespace
      and parent.relnamespace = 'public'::regnamespace
      and exists (
        select 1 from pg_attribute pa
        where pa.attrelid = parent.oid and pa.attname = 'account_id' and not pa.attisdropped
      )
      and (
        exists (
          select 1 from pg_attribute ca
          where ca.attrelid = child.oid and ca.attname = 'account_id' and not ca.attisdropped
        )
        or exists (
          select 1 from pg_trigger t
          where t.tgrelid = child.oid and t.tgname = 'refuse_write_when_team_locked'
            and t.tgfoid = 'tuckin.refuse_write_when_team_locked'::regproc
        )
      )
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = child.oid and t.tgname = 'refuse_write_when_team_locked'
          and t.tgfoid = 'tuckin.refuse_write_when_team_locked'::regproc
          and split_part(encode(t.tgargs, 'escape'), '\000', 2) = a.attname::text
      )
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = child.oid and t.tgname = 'same_team_' || a.attname
      )
      and (child.relname, a.attname::text) not in (select table_name, column_name from tuckin.cross_team_link_exempt)
  $$,
  'every link from a team row to another team table stays within the team'
);

select * from finish();
rollback;
