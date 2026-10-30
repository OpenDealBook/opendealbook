begin;
select no_plan();

-- Deal d1 has a signed LOI c1. Its extension e1 is drafted to end exclusivity
-- on 2026-12-01 and later corrected to 2026-12-15, with a version drafted
-- before and after the correction. vx_seller is in d1's seller room.
select tests.create_user('vx_owner');
select tests.create_user('vx_seller');

select tests.login_as_service_role();
select public.create_team_account('VX Team', tests.get_uid('vx_owner'), 'vx-team');
select public.append_deal_event('e3000000-0000-0000-0000-0000000000d1', 'deal',
  'e3000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('vx-team'), 'firm_id', tests.create_firm(tests.account_id('vx-team')),
    'owner_user_id', tests.get_uid('vx_owner'), 'description', 'Version dates'), null, 'service');

select tests.login_as('vx_owner');
create temporary table vx_room (id uuid) on commit drop;
grant select, insert on vx_room to authenticated, service_role;
insert into vx_room select public.ensure_seller_room('e3000000-0000-0000-0000-0000000000d1');
reset role;

insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('vx_seller'), 'vx_seller@opendealbook.test', 'Vera Seller' from vx_room;

insert into public.contract (id, deal_id, account_id, type, current_version) values
  ('e3000000-0000-0000-0000-0000000000c1', 'e3000000-0000-0000-0000-0000000000d1', tests.account_id('vx-team'), 'loi', 1);
insert into public.contract_version (id, contract_id, account_id, version, source, party, is_signed) values
  ('e3000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-0000000000c1', tests.account_id('vx-team'), 1, 'upload', 'buyer', true);

select tests.login_as('vx_owner');

select public.append_deal_event('e3000000-0000-0000-0000-0000000000d1', 'contract',
  'e3000000-0000-0000-0000-0000000000e1', 'contract.created',
  '{"type": "loi_extension", "parent_contract_id": "e3000000-0000-0000-0000-0000000000c1", "extends_to": "2026-12-01"}'::jsonb);
insert into public.contract_version (id, contract_id, account_id, version, source, party) values
  ('e3000000-0000-0000-0000-0000000000b1', 'e3000000-0000-0000-0000-0000000000e1', tests.account_id('vx-team'), 1, 'generated', 'buyer');

select public.append_deal_event('e3000000-0000-0000-0000-0000000000d1', 'contract',
  'e3000000-0000-0000-0000-0000000000e1', 'contract.extension_rescheduled', '{"extends_to": "2026-12-15"}'::jsonb);
insert into public.contract_version (id, contract_id, account_id, version, source, party) values
  ('e3000000-0000-0000-0000-0000000000b2', 'e3000000-0000-0000-0000-0000000000e1', tests.account_id('vx-team'), 2, 'generated', 'buyer');

select results_eq(
  $$ select id, extends_to from public.contract_version
     where contract_id in ('e3000000-0000-0000-0000-0000000000c1', 'e3000000-0000-0000-0000-0000000000e1')
     order by id $$,
  $$ values
     ('e3000000-0000-0000-0000-0000000000a1'::uuid, null::date),
     ('e3000000-0000-0000-0000-0000000000b1'::uuid, '2026-12-01'::date),
     ('e3000000-0000-0000-0000-0000000000b2'::uuid, '2026-12-15'::date) $$,
  'each extension version keeps the end date it was drafted with, and an LOI version has none'
);

update public.contract_version set shared_at = now()
where id in ('e3000000-0000-0000-0000-0000000000b1', 'e3000000-0000-0000-0000-0000000000b2');

select tests.login_as('vx_seller');

select results_eq(
  $$ select id, extends_to from public.seller_side_contract_versions('e3000000-0000-0000-0000-0000000000d1')
     order by id $$,
  $$ values
     ('e3000000-0000-0000-0000-0000000000a1'::uuid, null::date),
     ('e3000000-0000-0000-0000-0000000000b1'::uuid, '2026-12-01'::date),
     ('e3000000-0000-0000-0000-0000000000b2'::uuid, '2026-12-15'::date) $$,
  'the seller side reads the end date of each extension version it can see'
);

select * from finish();
rollback;
