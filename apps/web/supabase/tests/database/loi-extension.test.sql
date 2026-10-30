begin;
select no_plan();

-- Deal d1 has an LOI c1 at version v1, signed on 2026-10-01, and an APA c2.
-- Deal d2 has its own signed LOI c3. Another team's deal d9 has its own LOI
-- c4. lx_owner manages deals; lx_analyst only works them; lx_seller is in
-- d1's seller room.
select tests.create_user('lx_owner');
select tests.create_user('lx_analyst');
select tests.create_user('lx_seller');
select tests.create_user('lx_other');

select tests.login_as_service_role();
select public.create_team_account('LX Team', tests.get_uid('lx_owner'), 'lx-team');
select public.create_team_account('LX Other', tests.get_uid('lx_other'), 'lx-other');
select public.append_deal_event(d.id, 'deal', d.id, 'deal.created',
  jsonb_build_object('account_id', tests.account_id(d.team), 'firm_id', tests.create_firm(tests.account_id(d.team)),
    'owner_user_id', tests.get_uid(d.owner), 'description', d.name), null, 'service')
from (values
  ('e1000000-0000-0000-0000-0000000000d1'::uuid, 'Extended deal', 'lx-team', 'lx_owner'),
  ('e1000000-0000-0000-0000-0000000000d2'::uuid, 'Other deal', 'lx-team', 'lx_owner'),
  ('e1000000-0000-0000-0000-0000000000d9'::uuid, 'Other team deal', 'lx-other', 'lx_other')
) as d (id, name, team, owner);

select tests.login_as('lx_owner');
create temporary table lx_room (id uuid) on commit drop;
grant select, insert on lx_room to authenticated, service_role;
insert into lx_room select public.ensure_seller_room('e1000000-0000-0000-0000-0000000000d1');
reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('lx_analyst'), tests.account_id('lx-team'), 'analyst');

insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('lx_seller'), 'lx_seller@tuckin.test', 'Lena Seller' from lx_room;

insert into public.contract (id, deal_id, account_id, type, current_version) values
  ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-0000000000d1', tests.account_id('lx-team'), 'loi', 1),
  ('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1', tests.account_id('lx-team'), 'apa', 1),
  ('e1000000-0000-0000-0000-0000000000c3', 'e1000000-0000-0000-0000-0000000000d2', tests.account_id('lx-team'), 'loi', 1),
  ('e1000000-0000-0000-0000-0000000000c4', 'e1000000-0000-0000-0000-0000000000d9', tests.account_id('lx-other'), 'loi', 1);
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-0000000000c1', tests.account_id('lx-team'), 1, 'upload', 'buyer', false),
  ('e1000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-0000000000c2', tests.account_id('lx-team'), 1, 'upload', 'buyer', true),
  ('e1000000-0000-0000-0000-0000000000a3', 'e1000000-0000-0000-0000-0000000000c3', tests.account_id('lx-team'), 1, 'upload', 'buyer', true),
  ('e1000000-0000-0000-0000-0000000000a9', 'e1000000-0000-0000-0000-0000000000c4', tests.account_id('lx-other'), 1, 'upload', 'buyer', true);
insert into public.deal_milestone (id, account_id, deal_id, kind, actual_on, shared) values
  ('e1000000-0000-0000-0000-0000000000f1', tests.account_id('lx-team'), 'e1000000-0000-0000-0000-0000000000d1',
   'loi_signed', '2026-10-01', true);

-- ---- Creating an extension ----
select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-01"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must extend the current signed LOI of that deal',
  'an LOI with no signed version cannot be extended'
);

reset role;
update public.contract_version set is_signed = true where id = 'e1000000-0000-0000-0000-0000000000a1';
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed) values
  ('e1000000-0000-0000-0000-0000000000a5', 'e1000000-0000-0000-0000-0000000000c1', tests.account_id('lx-team'), 2, 'upload', 'buyer', false);
update public.contract set current_version = 2 where id = 'e1000000-0000-0000-0000-0000000000c1';
select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-01"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must extend the current signed LOI of that deal',
  'an LOI whose current version is an unsigned redraft cannot be extended'
);

reset role;
update public.contract set current_version = 1 where id = 'e1000000-0000-0000-0000-0000000000c1';
delete from public.contract_version where id = 'e1000000-0000-0000-0000-0000000000a5';
select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c2", "extends_to": "2026-12-01"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must extend the current signed LOI of that deal',
  'only an LOI is extended, not a signed APA'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c3", "extends_to": "2026-12-01"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must extend the current signed LOI of that deal',
  'an extension cannot extend the signed LOI of another deal'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-10-01"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must end exclusivity after 2026-10-01',
  'with no exclusivity end yet, an extension ends after the LOI was signed'
);

reset role;
insert into public.deal_milestone (id, account_id, deal_id, kind, target_on, shared) values
  ('e1000000-0000-0000-0000-0000000000f2', tests.account_id('lx-team'), 'e1000000-0000-0000-0000-0000000000d1',
   'exclusivity_end', '2026-11-15', true);
select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-11-15"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must end exclusivity after 2026-11-15',
  'an extension ends exclusivity later than the current end'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1"}'::jsonb) $$,
  '23514', 'new row for relation "contract" violates check constraint "contract_extension_extends_to_check"',
  'an extension names the date exclusivity now ends'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e9', 'contract.created',
       '{"type": "loi", "extends_to": "2026-12-01"}'::jsonb) $$,
  '23514', 'new row for relation "contract" violates check constraint "contract_extension_extends_to_check"',
  'only an extension has an extended date'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e9', 'contract.created',
       '{"type": "loi", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1"}'::jsonb) $$,
  '23514', 'new row for relation "contract" violates check constraint "contract_extension_parent_check"',
  'only an extension has a parent LOI'
);

reset role;

select throws_ok(
  $$ insert into public.contract (deal_id, account_id, type, extends_to)
     values ('e1000000-0000-0000-0000-0000000000d1', tests.account_id('lx-team'), 'loi_extension', '2026-12-01') $$,
  '23514', 'new row for relation "contract" violates check constraint "contract_extension_parent_check"',
  'an extension always names its parent LOI'
);

select throws_ok(
  $$ insert into public.contract (deal_id, account_id, type, parent_contract_id, extends_to)
     values ('e1000000-0000-0000-0000-0000000000d1', tests.account_id('lx-team'), 'loi_extension',
       'e1000000-0000-0000-0000-0000000000c4', '2026-12-01') $$,
  '42501', 'rows cannot link across teams',
  'an extension cannot name another team''s LOI'
);

select tests.login_as('lx_analyst');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-01"}'::jsonb) $$,
  '42501', 'not authorized to extend an LOI on deal e1000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'someone who only works the deal cannot create an extension'
);

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000c9', 'contract.created', '{"type": "loi"}'::jsonb) $$,
  'someone who works the deal still drafts an LOI'
);

select tests.login_as('lx_owner');

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-01"}'::jsonb) $$,
  'a deal manager extends a signed LOI'
);

select results_eq(
  $$ select type, parent_contract_id, extends_to, note, noted_on from public.contract
     where id = 'e1000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('loi_extension', 'e1000000-0000-0000-0000-0000000000c1'::uuid, '2026-12-01'::date, null::text, null::date) $$,
  'the extension names its LOI and the new end of exclusivity'
);

select public.append_deal_event('e1000000-0000-0000-0000-0000000000d2', 'contract',
  'e1000000-0000-0000-0000-0000000000e3', 'contract.created',
  '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c3", "extends_to": "2026-12-01"}'::jsonb);

-- ---- A deal with no exclusivity end and no LOI signed date ----
select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d2', 'contract',
       'e1000000-0000-0000-0000-0000000000e4', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c3", "extends_to": "2020-01-01"}'::jsonb) $$,
  'with no date to compare against, any extended date is accepted'
);

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d2', 'contract',
       'e1000000-0000-0000-0000-0000000000e4', 'contract.extension_noted',
       '{"note": "Agreed long ago", "noted_on": "2020-01-01"}'::jsonb) $$,
  'with no LOI signed date, any day up to today is accepted for a note'
);

-- ---- Correcting an extension's date ----
select tests.login_as('lx_analyst');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_rescheduled', '{"extends_to": "2026-12-05"}'::jsonb) $$,
  '42501', 'not authorized to append contract.extension_rescheduled on deal e1000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'someone who only works the deal cannot correct an extension'
);

select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_rescheduled', '{"extends_to": "2026-11-10"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must end exclusivity after 2026-11-15',
  'a corrected extension still ends exclusivity later than the current end'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000c1', 'contract.extension_rescheduled', '{"extends_to": "2026-12-05"}'::jsonb) $$,
  '23514', 'contract e1000000-0000-0000-0000-0000000000c1 is not an LOI extension in deal e1000000-0000-0000-0000-0000000000d1',
  'only an extension''s date is corrected'
);

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_rescheduled', '{"extends_to": "2026-12-05"}'::jsonb) $$,
  'a deal manager corrects the date of an extension neither signed nor noted'
);

select is(
  (select extends_to from public.contract where id = 'e1000000-0000-0000-0000-0000000000e1'),
  '2026-12-05'::date,
  'the corrected date replaces the old one'
);

-- ---- Noting an extension without a signed document ----
select tests.login_as('lx_analyst');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  '42501', 'not authorized to append contract.extension_noted on deal e1000000-0000-0000-0000-0000000000d1: needs deals.manage',
  'someone who only works the deal cannot note an extension'
);

select tests.login_as('lx_owner');

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000c1', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'contract e1000000-0000-0000-0000-0000000000c1 is not an LOI extension in deal e1000000-0000-0000-0000-0000000000d1',
  'only an extension is noted, not the LOI itself'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e3', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'contract e1000000-0000-0000-0000-0000000000e3 is not an LOI extension in deal e1000000-0000-0000-0000-0000000000d1',
  'another deal''s extension is not noted through this deal'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000ee', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'contract e1000000-0000-0000-0000-0000000000ee is not an LOI extension in deal e1000000-0000-0000-0000-0000000000d1',
  'a contract that does not exist is not noted'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "Seller agreed by phone"}'::jsonb) $$,
  '23514', 'a note on LOI extension e1000000-0000-0000-0000-0000000000e1 needs its text and the day it was agreed',
  'a note on an extension carries the day it was agreed'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'a note on LOI extension e1000000-0000-0000-0000-0000000000e1 needs its text and the day it was agreed',
  'a note on an extension carries its text'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "  ", "noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'a note on LOI extension e1000000-0000-0000-0000-0000000000e1 needs its text and the day it was agreed',
  'a blank note on an extension is refused'
);

select throws_ok(
  format($$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       jsonb_build_object('note', 'Seller will agree', 'noted_on', %L)) $$,
    ((now() at time zone 'UTC')::date + 2)::text),
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e1 cannot be noted as agreed after today',
  'an extension is not noted as agreed on a day still to come'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-09-30"}'::jsonb) $$,
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e1 cannot be noted as agreed before the LOI was signed on 2026-10-01',
  'an extension is not noted as agreed before the LOI was signed'
);

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  'a deal manager notes an extension agreed without a signed document'
);

select results_eq(
  $$ select note, noted_on from public.contract where id = 'e1000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('Seller agreed by phone', '2026-10-28'::date) $$,
  'the extension keeps the note and the day it was agreed'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_rescheduled', '{"extends_to": "2026-12-10"}'::jsonb) $$,
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e1 is signed or noted, so its date is fixed',
  'a noted extension''s date is fixed'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "", "noted_on": "2026-10-29"}'::jsonb) $$,
  '23514', 'a note on LOI extension e1000000-0000-0000-0000-0000000000e1 needs its text and the day it was agreed',
  'a noted extension cannot be cleared with an empty note'
);

select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
  'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
  '{"note": "Seller confirmed by email", "noted_on": "2026-10-29"}'::jsonb);

select results_eq(
  $$ select note, noted_on from public.contract where id = 'e1000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('Seller confirmed by email', '2026-10-29'::date) $$,
  'noting again replaces the note and its day'
);

select results_eq(
  $$ select payload ->> 'note' from public.deal_event
     where aggregate_id = 'e1000000-0000-0000-0000-0000000000e1' and event_type = 'contract.extension_noted'
     order by aggregate_seq $$,
  $$ values ('Seller agreed by phone'), ('Seller confirmed by email') $$,
  'the deal''s history keeps the earlier note'
);

select lives_ok(
  $$ insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed)
     values ('e1000000-0000-0000-0000-0000000000a4', 'e1000000-0000-0000-0000-0000000000e1',
       tests.account_id('lx-team'), 1, 'upload', 'buyer', true) $$,
  'a signed copy arriving later attaches to the noted extension'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e1', 'contract.extension_noted',
       '{"note": "Seller changed their mind", "noted_on": "2026-10-29"}'::jsonb) $$,
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e1 has a signed copy and cannot be noted',
  'once signed, an extension''s note is fixed'
);

-- ---- A later extension starts from the end already in effect ----
select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'deal_milestone',
  'e1000000-0000-0000-0000-0000000000f2', 'deal_milestone.set',
  '{"kind": "exclusivity_end", "target_on": "2026-12-05", "actual_on": null}'::jsonb);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e5', 'contract.created',
       '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-05"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must end exclusivity after 2026-12-05',
  'a second extension ends after the date the noted first one set'
);

select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
  'e1000000-0000-0000-0000-0000000000e5', 'contract.created',
  '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-15"}'::jsonb);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e5', 'contract.extension_rescheduled', '{"extends_to": "2026-12-04"}'::jsonb) $$,
  '23514', 'an LOI extension on deal e1000000-0000-0000-0000-0000000000d1 must end exclusivity after 2026-12-05',
  'correcting the second extension is bounded by the first extension''s date, not its own'
);

select lives_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e5', 'contract.extension_rescheduled', '{"extends_to": "2026-12-12"}'::jsonb) $$,
  'the second extension may be corrected to an earlier date still after the first one'
);

-- ---- A signed extension that was never noted ----
select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
  'e1000000-0000-0000-0000-0000000000e2', 'contract.created',
  '{"type": "loi_extension", "parent_contract_id": "e1000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-20"}'::jsonb);
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed)
values ('e1000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000e2',
  tests.account_id('lx-team'), 1, 'upload', 'buyer', true);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e2', 'contract.extension_noted',
       '{"note": "Seller agreed by phone", "noted_on": "2026-10-28"}'::jsonb) $$,
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e2 has a signed copy and cannot be noted',
  'a signed extension cannot be noted'
);

select throws_ok(
  $$ select public.append_deal_event('e1000000-0000-0000-0000-0000000000d1', 'contract',
       'e1000000-0000-0000-0000-0000000000e2', 'contract.extension_rescheduled', '{"extends_to": "2026-12-28"}'::jsonb) $$,
  '23514', 'LOI extension e1000000-0000-0000-0000-0000000000e2 is signed or noted, so its date is fixed',
  'a signed extension''s date is fixed'
);

-- ---- The seller side sees the signed extension ----
select tests.login_as('lx_seller');

select results_eq(
  $$ select id, contract_id, is_signed from public.seller_side_contract_versions('e1000000-0000-0000-0000-0000000000d1')
     where contract_id in ('e1000000-0000-0000-0000-0000000000e1', 'e1000000-0000-0000-0000-0000000000e2')
     order by id $$,
  $$ values
     ('e1000000-0000-0000-0000-0000000000a4'::uuid, 'e1000000-0000-0000-0000-0000000000e1'::uuid, true),
     ('e1000000-0000-0000-0000-0000000000a6'::uuid, 'e1000000-0000-0000-0000-0000000000e2'::uuid, true) $$,
  'the seller side sees each signed extension, as it sees the signed LOI'
);

select tests.login_as('lx_owner');

-- ---- Counsel sign-off follows the LOI ----
select is(
  public.contract_review_required('e1000000-0000-0000-0000-0000000000d1', 'loi_extension'),
  false,
  'an extension needs no counsel sign-off while the LOI needs none'
);
select is(
  public.contract_version_signing_ready('e1000000-0000-0000-0000-0000000000a4'),
  true,
  'an extension version is ready to sign while the LOI needs no sign-off'
);

insert into public.deal_contract_review_gate_change (account_id, deal_id, contract_type, required)
values (tests.account_id('lx-team'), 'e1000000-0000-0000-0000-0000000000d1', 'loi', true);

select is(
  public.contract_review_required('e1000000-0000-0000-0000-0000000000d1', 'loi_extension'),
  true,
  'an extension needs counsel sign-off once the deal''s LOI does'
);
select is(
  public.contract_version_signing_ready('e1000000-0000-0000-0000-0000000000a4'),
  false,
  'an extension version waits for counsel when the deal''s LOI does'
);

-- ---- Templates ----
select lives_ok(
  $$ insert into public.document_template (account_id, name, type)
     values (tests.account_id('lx-team'), 'Standard extension', 'loi_extension') $$,
  'a team keeps an LOI extension template'
);

select * from finish();
rollback;
