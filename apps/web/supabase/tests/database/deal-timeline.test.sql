begin;
select no_plan();

-- Team "TL Team" owns deals d1 and d2; tl_owner manages them and tl_member is on
-- the team without deals.manage. "TL Other" is a second team.
select tests.create_user('tl_owner');
select tests.create_user('tl_member');
select tests.create_user('tl_other_owner');

select tests.login_as_service_role();
select public.create_team_account('TL Team', tests.get_uid('tl_owner'), 'tl-team');
select public.create_team_account('TL Other', tests.get_uid('tl_other_owner'), 'tl-other');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal',
  '7e000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Timeline deal'), null, 'service');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal',
  '7e000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Second timeline deal'), null, 'service');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('tl_member'), tests.account_id('tl-team'), 'member');

select tests.login_as('tl_owner');

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
       '{"kind": "closing", "target_on": "2026-11-30"}'::jsonb) $$,
  'the team sets a closing target'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c2', 'deal_milestone.set',
       '{"kind": "loi_deadline", "target_on": "2026-10-20"}'::jsonb) $$,
  'the team sets an LOI deadline'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c3', 'deal_milestone.set',
       '{"kind": "custom", "label": "Landlord consent", "target_on": "2026-11-10"}'::jsonb) $$,
  'the team adds a custom milestone'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c4', 'deal_milestone.set',
       '{"kind": "custom", "label": "Licence transfer"}'::jsonb) $$,
  'a deal holds more than one custom milestone'
);

select results_eq(
  $$ select kind::text, label, target_on, actual_on, shared from public.deal_milestone
     where deal_id = '7e000000-0000-0000-0000-0000000000d1' order by id $$,
  $$ values
       ('closing', null::text, '2026-11-30'::date, null::date, true),
       ('loi_deadline', null, '2026-10-20'::date, null::date, false),
       ('custom', 'Landlord consent', '2026-11-10'::date, null::date, false),
       ('custom', 'Licence transfer', null::date, null::date, false) $$,
  'milestones hold plain dates, and only closing, effective and APA signing start shared'
);

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c5', 'deal_milestone.set',
       '{"kind": "effective"}'::jsonb) $$,
  'the team adds an effective date'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c6', 'deal_milestone.set',
       '{"kind": "apa_signing"}'::jsonb) $$,
  'the team adds APA signing'
);
select results_eq(
  $$ select kind::text, shared from public.deal_milestone
     where id in ('7e000000-0000-0000-0000-0000000000c5', '7e000000-0000-0000-0000-0000000000c6') order by id $$,
  $$ values ('effective', true), ('apa_signing', true) $$,
  'effective and APA signing start shared'
);

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
       '{"kind": "closing", "target_on": "2026-12-15", "actual_on": "2026-10-01"}'::jsonb) $$,
  'the team moves the closing target and records the actual'
);
select results_eq(
  $$ select target_on, actual_on, shared from public.deal_milestone where id = '7e000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('2026-12-15'::date, '2026-10-01'::date, true) $$,
  'a set without a shared flag keeps the milestone''s sharing'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c1', 'deal_milestone.set',
       '{"kind": "closing", "target_on": "2026-12-15", "shared": false}'::jsonb) $$,
  'the team clears the actual and stops sharing closing'
);
select results_eq(
  $$ select target_on, actual_on, shared from public.deal_milestone where id = '7e000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('2026-12-15'::date, null::date, false) $$,
  'a set carries the whole milestone, so an omitted date clears it'
);
select results_eq(
  $$ select payload ->> 'target_on', payload ->> 'actual_on' from public.deal_event
     where aggregate_type = 'deal_milestone' and aggregate_id = '7e000000-0000-0000-0000-0000000000c1'
     order by aggregate_seq $$,
  $$ values ('2026-11-30', null), ('2026-12-15', '2026-10-01'), ('2026-12-15', null) $$,
  'every change to a milestone stays in the deal event history'
);

select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       gen_random_uuid(), 'deal_milestone.set', '{"kind": "closing"}'::jsonb) $$,
  '23505', null, 'a deal has one closing milestone'
);
select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       gen_random_uuid(), 'deal_milestone.set', '{"kind": "custom"}'::jsonb) $$,
  '23514', null, 'a custom milestone needs a label'
);
select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       gen_random_uuid(), 'deal_milestone.set', '{"kind": "diligence_end", "label": "Renamed"}'::jsonb) $$,
  '23514', null, 'a fixed milestone takes no label'
);
select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       gen_random_uuid(), 'deal_milestone.set', '{"kind": "lender_signed"}'::jsonb) $$,
  '22P02', null, 'a milestone kind outside the six fixed kinds and custom is refused'
);

select throws_ok(
  format($$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c6', 'deal_milestone.set',
       jsonb_build_object('kind', 'apa_signing', 'actual_on', %L)) $$, current_date + 2),
  '23514', 'a milestone''s actual date cannot be in the future', 'an actual date two days past UTC today is refused'
);
select lives_ok(
  format($$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c6', 'deal_milestone.set',
       jsonb_build_object('kind', 'apa_signing', 'actual_on', %L)) $$, current_date + 1),
  'an actual date one day past UTC today is recorded, since it is already today somewhere'
);

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c2', 'deal_milestone.set',
       '{"kind": "loi_deadline", "target_on": "2027-01-01"}'::jsonb) $$,
  'an event on one deal naming another deal''s milestone is recorded'
);
select results_eq(
  $$ select deal_id, target_on from public.deal_milestone where id = '7e000000-0000-0000-0000-0000000000c2' $$,
  $$ values ('7e000000-0000-0000-0000-0000000000d1'::uuid, '2026-10-20'::date) $$,
  'an event on one deal never changes another deal''s milestone'
);
select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c2', 'deal_milestone.removed') $$,
  'a removal on one deal naming another deal''s milestone is recorded'
);
select isnt_empty(
  $$ select 1 from public.deal_milestone where id = '7e000000-0000-0000-0000-0000000000c2' $$,
  'a removal on one deal never removes another deal''s milestone'
);

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c4', 'deal_milestone.removed') $$,
  'the team removes a custom milestone'
);
select is_empty(
  $$ select 1 from public.deal_milestone where id = '7e000000-0000-0000-0000-0000000000c4' $$,
  'a removed milestone leaves the timeline'
);

select throws_ok(
  $$ insert into public.deal_milestone (account_id, deal_id, kind, shared)
     values (tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d1', 'diligence_end', false) $$,
  '42501', null, 'milestones are written only through deal events'
);

select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000b1', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-11-01"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000b1', 'deal_milestone.removed');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000b2', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-12-01"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000b3', 'deal_milestone.set', '{"kind": "custom", "label": "Dropped"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d2', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000b3', 'deal_milestone.removed');

select tests.login_as_service_role();
select lives_ok(
  $$ select public.replay_deal('7e000000-0000-0000-0000-0000000000d2') $$,
  'a deal whose closing was removed and set again replays'
);
select results_eq(
  $$ select id, kind::text, target_on from public.deal_milestone
     where deal_id = '7e000000-0000-0000-0000-0000000000d2' $$,
  $$ values ('7e000000-0000-0000-0000-0000000000b2'::uuid, 'closing', '2026-12-01'::date) $$,
  'a replay leaves removed milestones absent and the current closing in place'
);
select results_eq(
  $$ select count(*)::int from public.deal_milestone where deal_id = '7e000000-0000-0000-0000-0000000000d1' $$,
  $$ values (5) $$,
  'replaying one deal leaves another deal''s milestones alone'
);

select tests.login_as('tl_member');

select lives_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       gen_random_uuid(), 'deal_milestone.set', '{"kind": "diligence_end"}'::jsonb) $$,
  'a team member sets a milestone as deal work'
);
select results_eq(
  $$ select count(*)::int from public.deal_milestone where deal_id = '7e000000-0000-0000-0000-0000000000d1' $$,
  $$ values (6) $$,
  'every team member reads every milestone, shared or not'
);

select tests.login_as('tl_other_owner');

select is_empty(
  $$ select 1 from public.deal_milestone $$,
  'another team reads none of this team''s milestones'
);

-- ---- The shared timeline each outside audience sees ----
-- Deal d3 has a lender room, a seller room, and counsel on both sides. Deal d4
-- has a lender room for tl_lender too, to prove a room shows only its own deal.
select tests.create_user('tl_lender');
select tests.create_user('tl_seller');
select tests.create_user('tl_buyer_law');
select tests.create_user('tl_seller_law');

select tests.login_as_service_role();
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal',
  '7e000000-0000-0000-0000-0000000000d3', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Shared timeline deal'), null, 'service');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d4', 'deal',
  '7e000000-0000-0000-0000-0000000000d4', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Other shared timeline deal'), null, 'service');

select tests.login_as('tl_owner');
select public.ensure_seller_room('7e000000-0000-0000-0000-0000000000d3');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e9', 'deal_milestone.set', '{"kind": "custom", "label": "Zoning", "target_on": "2026-11-15", "shared": true}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e1', 'deal_milestone.set', '{"kind": "custom", "label": "Appraisal", "shared": true}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e2', 'deal_milestone.set', '{"kind": "custom", "label": "Team only"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e3', 'deal_milestone.set', '{"kind": "effective", "target_on": "2026-12-02"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e4', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-12-01"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e5', 'deal_milestone.set', '{"kind": "diligence_end", "target_on": "2026-11-01"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d3', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e6', 'deal_milestone.set',
  '{"kind": "loi_deadline", "target_on": "2025-10-20", "actual_on": "2025-10-01", "shared": true}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d4', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e7', 'deal_milestone.set', '{"kind": "closing", "target_on": "2027-03-01"}'::jsonb);

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('tl_seller'), 'tl_seller@tuckin.test', 'Seller'
from public.seller_room r where r.deal_id = '7e000000-0000-0000-0000-0000000000d3';
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d3', 'buyer', tests.get_uid('tl_buyer_law'), 'tl_buyer_law@tuckin.test', 'Buyer Law'),
  (tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d3', 'seller', tests.get_uid('tl_seller_law'), 'tl_seller_law@tuckin.test', 'Seller Law');
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('7e000000-0000-0000-0000-0000000000f3', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d3', null, 'Bank room'),
  ('7e000000-0000-0000-0000-0000000000f4', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d4', null, 'Other bank room');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('7e000000-0000-0000-0000-0000000000a3', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d3', 'Bank', '7e000000-0000-0000-0000-0000000000f3'),
  ('7e000000-0000-0000-0000-0000000000a4', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d4', 'Other bank', '7e000000-0000-0000-0000-0000000000f4');
insert into public.lender_room_member (room_id, user_id, email)
values ('7e000000-0000-0000-0000-0000000000a3', tests.get_uid('tl_lender'), 'tl_lender@tuckin.test');

create temp table tl_seller_room as
select id from public.seller_room where deal_id = '7e000000-0000-0000-0000-0000000000d3';
grant select on tl_seller_room to authenticated;

create temp table tl_shared_timeline (kind public.milestone_kind, label text, target_on date, actual_on date);
insert into tl_shared_timeline values
  ('loi_deadline', null, '2025-10-20', '2025-10-01'),
  ('closing', null, '2026-12-01', null),
  ('effective', null, '2026-12-02', null),
  ('custom', 'Zoning', '2026-11-15', null),
  ('custom', 'Appraisal', null, null);
grant select on tl_shared_timeline to authenticated;

select tests.login_as('tl_lender');
select results_eq(
  $$ select * from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a3') $$,
  $$ select * from tl_shared_timeline $$,
  'a lender sees only shared milestones, current values only, fixed kinds in order then custom by creation'
);
select is_empty(
  $$ select 1 from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a4') $$,
  'a lender sees nothing of a room they are not in'
);
select is_empty(
  $$ select 1 from public.seller_room_timeline((select id from tl_seller_room)) $$,
  'a lender sees nothing of the seller room timeline'
);
select is_empty(
  $$ select 1 from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d3') $$,
  'a lender sees nothing through the counsel timeline'
);

select tests.login_as('tl_seller');
select results_eq(
  $$ select * from public.seller_room_timeline((select id from tl_seller_room)) $$,
  $$ select * from tl_shared_timeline $$,
  'a seller sees the shared timeline in the seller room'
);
select is_empty(
  $$ select 1 from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a3') $$,
  'a seller sees nothing of a lender room timeline'
);

select tests.login_as('tl_seller_law');
select results_eq(
  $$ select * from public.seller_room_timeline((select id from tl_seller_room)) $$,
  $$ select * from tl_shared_timeline $$,
  'seller''s counsel sees the seller room timeline as the seller does'
);
select results_eq(
  $$ select * from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d3') $$,
  $$ select * from tl_shared_timeline $$,
  'seller''s counsel sees the shared timeline in the portal'
);

select tests.login_as('tl_buyer_law');
select results_eq(
  $$ select * from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d3') $$,
  $$ select * from tl_shared_timeline $$,
  'buyer''s counsel sees the shared timeline in the portal'
);
select is_empty(
  $$ select 1 from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d4') $$,
  'counsel see nothing of a deal they are not counsel on'
);

-- Deal d5 shares closing and has no effective date; deal d6 keeps closing to
-- the team. tl_lender, tl_seller and tl_buyer_law sit on both.
select tests.login_as_service_role();
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d5', 'deal',
  '7e000000-0000-0000-0000-0000000000d5', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Effective follows closing'), null, 'service');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d6', 'deal',
  '7e000000-0000-0000-0000-0000000000d6', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('tl-team'), 'firm_id', tests.create_firm(tests.account_id('tl-team')), 'owner_user_id', tests.get_uid('tl_owner'),
    'description', 'Closing kept to the team'), null, 'service');

select tests.login_as('tl_owner');
select public.ensure_seller_room('7e000000-0000-0000-0000-0000000000d5');
select public.ensure_seller_room('7e000000-0000-0000-0000-0000000000d6');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d5', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000e8', 'deal_milestone.set', '{"kind": "closing"}'::jsonb);
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d6', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000ea', 'deal_milestone.set', '{"kind": "closing", "target_on": "2026-12-01", "shared": false}'::jsonb);

reset role;
insert into public.seller_room_member (room_id, user_id, email, name)
select r.id, tests.get_uid('tl_seller'), 'tl_seller@tuckin.test', 'Seller'
from public.seller_room r where r.deal_id in ('7e000000-0000-0000-0000-0000000000d5', '7e000000-0000-0000-0000-0000000000d6');
insert into public.deal_counsel (account_id, deal_id, side, user_id, email, name)
values
  (tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d5', 'buyer', tests.get_uid('tl_buyer_law'), 'tl_buyer_law@tuckin.test', 'Buyer Law'),
  (tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d6', 'buyer', tests.get_uid('tl_buyer_law'), 'tl_buyer_law@tuckin.test', 'Buyer Law');
insert into public.dr_folder (id, account_id, deal_id, parent_id, name)
values
  ('7e000000-0000-0000-0000-0000000000f5', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d5', null, 'Follows room'),
  ('7e000000-0000-0000-0000-0000000000f6', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d6', null, 'Team closing room');
insert into public.lender_room (id, account_id, deal_id, name, private_folder_id)
values
  ('7e000000-0000-0000-0000-0000000000a5', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d5', 'Follows bank', '7e000000-0000-0000-0000-0000000000f5'),
  ('7e000000-0000-0000-0000-0000000000a6', tests.account_id('tl-team'), '7e000000-0000-0000-0000-0000000000d6', 'Team closing bank', '7e000000-0000-0000-0000-0000000000f6');
insert into public.lender_room_member (room_id, user_id, email)
values
  ('7e000000-0000-0000-0000-0000000000a5', tests.get_uid('tl_lender'), 'tl_lender@tuckin.test'),
  ('7e000000-0000-0000-0000-0000000000a6', tests.get_uid('tl_lender'), 'tl_lender@tuckin.test');

create temp table tl_effective_follows (kind public.milestone_kind, label text, target_on date, actual_on date);
insert into tl_effective_follows values ('closing', null, null, null), ('effective', null, null, null);
grant select on tl_effective_follows to authenticated;

select tests.login_as('tl_lender');
select results_eq(
  $$ select * from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a5') $$,
  $$ select * from tl_effective_follows $$,
  'a lender room shows an effective row with no date when closing is shared and effective is missing'
);
select is_empty(
  $$ select 1 from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a6') $$,
  'no effective row stands in when closing is not shared'
);
select tests.login_as('tl_seller');
select results_eq(
  $$ select * from public.seller_room_timeline((select id from public.my_seller_rooms() where deal_id = '7e000000-0000-0000-0000-0000000000d5')) $$,
  $$ select * from tl_effective_follows $$,
  'the seller room shows the stand-in effective row too'
);
select tests.login_as('tl_buyer_law');
select results_eq(
  $$ select * from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d5') $$,
  $$ select * from tl_effective_follows $$,
  'the counsel portal shows the stand-in effective row too'
);
select is_empty(
  $$ select 1 from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d6') $$,
  'the counsel portal adds no effective row when closing is not shared'
);

select tests.login_as('tl_owner');
select public.append_deal_event('7e000000-0000-0000-0000-0000000000d5', 'deal_milestone',
  '7e000000-0000-0000-0000-0000000000eb', 'deal_milestone.set', '{"kind": "effective", "shared": false}'::jsonb);
select tests.login_as('tl_lender');
select results_eq(
  $$ select kind::text from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a5') $$,
  $$ values ('closing') $$,
  'an effective date the team keeps to itself stays hidden'
);

reset role;
update public.lender_room set closed_at = now() where id = '7e000000-0000-0000-0000-0000000000a3';
update public.seller_room set closed_at = now() where deal_id = '7e000000-0000-0000-0000-0000000000d3';
update public.deal set archived_at = now() where id = '7e000000-0000-0000-0000-0000000000d3';

select tests.login_as('tl_lender');
select is_empty(
  $$ select 1 from public.lender_room_timeline('7e000000-0000-0000-0000-0000000000a3') $$,
  'a closed lender room shows no timeline'
);
select tests.login_as('tl_seller');
select isnt_empty(
  $$ select 1 from public.seller_room_timeline((select id from tl_seller_room)) $$,
  'a closed seller room still shows the seller its timeline'
);
select tests.login_as('tl_buyer_law');
select is_empty(
  $$ select 1 from public.counsel_timeline('7e000000-0000-0000-0000-0000000000d3') $$,
  'counsel see no timeline once the deal is archived'
);

reset role;
update public.accounts set trial_ends_at = now() - interval '1 day'
where id = tests.account_id('tl-team');

select tests.login_as('tl_owner');

select throws_ok(
  $$ select public.append_deal_event('7e000000-0000-0000-0000-0000000000d1', 'deal_milestone',
       '7e000000-0000-0000-0000-0000000000c3', 'deal_milestone.set',
       '{"kind": "custom", "label": "Landlord consent", "target_on": "2026-11-20"}'::jsonb) $$,
  '42501', 'team is read-only', 'a locked team cannot change its timeline'
);

select * from finish();
rollback;
