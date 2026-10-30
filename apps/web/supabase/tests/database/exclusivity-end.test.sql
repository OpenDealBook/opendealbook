begin;
select no_plan();

-- Eight deals of xe_owner, each with an exclusivity end, seen on 2026-11-01.
-- x1 ends in 10 days and x2 in 20; x3 to x8 lapsed 5 days ago. x4's APA is
-- signed, x5 is lost, x6 is archived, x7 is closed and x8 records the day
-- exclusivity really ended. Deals b1 to b5 had their LOI signed or due before
-- the milestone existed.
select tests.create_user('xe_owner');

select tests.login_as_service_role();
select public.create_team_account('XE Team', tests.get_uid('xe_owner'), 'xe-team');
select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id('xe-team'), 'firm_id', tests.create_firm(tests.account_id('xe-team')),
    'owner_user_id', tests.get_uid('xe_owner'), 'description', d.id::text), null, 'service')
from (values
  ('e2000000-0000-0000-0000-0000000000d1'::uuid), ('e2000000-0000-0000-0000-0000000000d2'::uuid),
  ('e2000000-0000-0000-0000-0000000000d3'::uuid), ('e2000000-0000-0000-0000-0000000000d4'::uuid),
  ('e2000000-0000-0000-0000-0000000000d5'::uuid), ('e2000000-0000-0000-0000-0000000000d6'::uuid),
  ('e2000000-0000-0000-0000-0000000000d7'::uuid), ('e2000000-0000-0000-0000-0000000000d8'::uuid),
  ('e2000000-0000-0000-0000-0000000000b1'::uuid), ('e2000000-0000-0000-0000-0000000000b2'::uuid),
  ('e2000000-0000-0000-0000-0000000000b3'::uuid), ('e2000000-0000-0000-0000-0000000000b4'::uuid),
  ('e2000000-0000-0000-0000-0000000000b5'::uuid)
) as d (id);
reset role;

update public.deal set resolution = 'lost' where id = 'e2000000-0000-0000-0000-0000000000d5';
update public.deal set archived_at = now() where id = 'e2000000-0000-0000-0000-0000000000d6';
update public.deal set resolution = 'won' where id = 'e2000000-0000-0000-0000-0000000000d7';

insert into public.contract (id, deal_id, account_id, type, current_version) values
  ('e2000000-0000-0000-0000-0000000000c1', 'e2000000-0000-0000-0000-0000000000d1', tests.account_id('xe-team'), 'apa', 1),
  ('e2000000-0000-0000-0000-0000000000c4', 'e2000000-0000-0000-0000-0000000000d4', tests.account_id('xe-team'), 'apa', 1);
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed) values
  ('e2000000-0000-0000-0000-0000000000a1', 'e2000000-0000-0000-0000-0000000000c1', tests.account_id('xe-team'), 1, 'upload', 'buyer', false),
  ('e2000000-0000-0000-0000-0000000000a4', 'e2000000-0000-0000-0000-0000000000c4', tests.account_id('xe-team'), 1, 'upload', 'buyer', true);

select tests.login_as('xe_owner');

select public.append_deal_event('e2000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  'e2000000-0000-0000-0000-000000000001', 'deal_milestone.set',
  '{"kind": "exclusivity_end", "target_on": "2026-11-11", "actual_on": null}'::jsonb);

select results_eq(
  $$ select kind::text, target_on, shared from public.deal_milestone
     where id = 'e2000000-0000-0000-0000-000000000001' $$,
  $$ values ('exclusivity_end', '2026-11-11'::date, true) $$,
  'the end of exclusivity is a milestone shared with the seller side by default'
);

reset role;
insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, shared)
select ('e2000000-0000-0000-0000-00000000000' || n)::uuid, tests.account_id('xe-team'),
  ('e2000000-0000-0000-0000-0000000000d' || n)::uuid, 'exclusivity_end', t, true
from (values (2, '2026-11-21'::date), (3, '2026-10-27'), (4, '2026-10-27'), (5, '2026-10-27'),
  (6, '2026-10-27'), (7, '2026-10-27'), (8, '2026-10-27')) as x (n, t);
update public.deal_milestone set actual_on = '2026-10-25' where id = 'e2000000-0000-0000-0000-000000000008';
insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, shared) values
  ('e2000000-0000-0000-0000-000000000011', tests.account_id('xe-team'), 'e2000000-0000-0000-0000-0000000000d3',
   'loi_deadline', '2026-10-29', false);
select tests.login_as('xe_owner');

select results_eq(
  $$ select d.id, public.deal_exclusivity_over(d.id) from public.deal d
     where d.account_id = tests.account_id('xe-team') and d.id::text like 'e2000000-0000-0000-0000-0000000000d%' order by d.id $$,
  $$ values
     ('e2000000-0000-0000-0000-0000000000d1'::uuid, false),
     ('e2000000-0000-0000-0000-0000000000d2'::uuid, false),
     ('e2000000-0000-0000-0000-0000000000d3'::uuid, false),
     ('e2000000-0000-0000-0000-0000000000d4'::uuid, true),
     ('e2000000-0000-0000-0000-0000000000d5'::uuid, true),
     ('e2000000-0000-0000-0000-0000000000d6'::uuid, true),
     ('e2000000-0000-0000-0000-0000000000d7'::uuid, true),
     ('e2000000-0000-0000-0000-0000000000d8'::uuid, true) $$,
  'exclusivity is over once the APA is signed, the deal is closed, lost or archived, or its real end is recorded; an unsigned APA does not end it'
);

select results_eq(
  $$ select item_id, detail, at from public.team_agenda(tests.account_id('xe-team'), true, '2026-11-01'::timestamptz)
     where section = 'deadline' order by item_id $$,
  $$ values
     ('e2000000-0000-0000-0000-000000000001'::uuid, 'exclusivity_end', '2026-11-11'::timestamptz),
     ('e2000000-0000-0000-0000-000000000003'::uuid, 'exclusivity_end', '2026-10-27'::timestamptz) $$,
  'an exclusivity end shows within 14 days and stays once lapsed until exclusivity is over; a lapsed LOI deadline still drops off'
);

-- ---- Backfill ----
reset role;
insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, actual_on, shared)
select ('e2000000-0000-0000-0000-0000000001b' || n)::uuid, tests.account_id('xe-team'),
  ('e2000000-0000-0000-0000-0000000000b' || n)::uuid, 'loi_signed',
  case when n = 5 then '2026-09-01'::date end, case when n < 5 then '2026-09-01'::date end, true
from generate_series(1, 5) as n;
insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, shared) values
  ('e2000000-0000-0000-0000-0000000002b3', tests.account_id('xe-team'), 'e2000000-0000-0000-0000-0000000000b3',
   'exclusivity_end', '2026-12-24', true);
insert into public.offer (id, account_id, deal_id, status, current_version_id)
select ('e2000000-0000-0000-0000-0000000003b' || n)::uuid, tests.account_id('xe-team'),
  ('e2000000-0000-0000-0000-0000000000b' || n)::uuid, case when n = 4 then 'submitted' else 'accepted' end,
  ('e2000000-0000-0000-0000-0000000004b' || n)::uuid
from generate_series(1, 5) as n;
insert into public.offer_version (id, account_id, offer_id, number, author_side, purchase_price, exclusivity_days, terms)
select ('e2000000-0000-0000-0000-0000000004b' || n)::uuid, tests.account_id('xe-team'),
  ('e2000000-0000-0000-0000-0000000003b' || n)::uuid, 1, 'buyer', 1000000, d, '{}'::jsonb
from (values (1, 45), (2, null), (3, 60), (4, 30), (5, 30)) as x (n, d);

select public.backfill_exclusivity_end();

select is(
  coalesce(current_setting('request.jwt.claim.role', true), ''),
  '',
  'a caller with no role does not keep the service role after the backfill'
);

select results_eq(
  $$ select deal_id, target_on, actual_on, shared from public.deal_milestone
     where kind = 'exclusivity_end' and deal_id::text like 'e2000000-0000-0000-0000-0000000000b%' order by deal_id $$,
  $$ values
     ('e2000000-0000-0000-0000-0000000000b1'::uuid, '2026-10-16'::date, null::date, true),
     ('e2000000-0000-0000-0000-0000000000b3'::uuid, '2026-12-24'::date, null::date, true) $$,
  'the backfill ends exclusivity on the LOI signed date plus the offer''s days; it skips a deal without days, an offer not accepted and an LOI not yet signed, and keeps an existing end'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select public.backfill_exclusivity_end();

select is(
  current_setting('request.jwt.claim.role', true),
  'authenticated',
  'a caller''s role is put back after the backfill'
);

select results_eq(
  $$ select actor_kind::text, actor_via from public.deal_event
     where deal_id = 'e2000000-0000-0000-0000-0000000000b1' and event_type = 'deal_milestone.set'
       and payload ->> 'kind' = 'exclusivity_end' $$,
  $$ values ('system', 'migration') $$,
  'the backfilled end is in the deal''s history as the system''s'
);

select * from finish();
rollback;
