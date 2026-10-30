begin;
select no_plan();

-- Team "CV Team" owns deals d1 and d2. On d1, APA c1 has an internal buyer
-- draft (v1), a buyer version the team shared (v2) and a seller version (v3);
-- LOI c2 has only an internal draft. d2's contract c3 is shared but belongs to
-- another deal. cv_buyer_law and cv_seller_law are counsel on d1; cv_seller is
-- in d1's seller room.
select tests.create_user('cv_owner');
select tests.create_user('cv_member');
select tests.create_user('cv_buyer_law');
select tests.create_user('cv_seller_law');
select tests.create_user('cv_seller');
select tests.create_user('cv_stranger');

select tests.login_as_service_role();
select public.create_team_account('CV Team', tests.get_uid('cv_owner'), 'cv-team');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d1', 'deal',
  'c7000000-0000-0000-0000-0000000000d1', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cv-team'), 'firm_id', tests.create_firm(tests.account_id('cv-team')), 'owner_user_id', tests.get_uid('cv_owner'),
    'description', 'Visibility deal'), null, 'service');
select public.append_deal_event('c7000000-0000-0000-0000-0000000000d2', 'deal',
  'c7000000-0000-0000-0000-0000000000d2', 'deal.created',
  jsonb_build_object('account_id', tests.account_id('cv-team'), 'firm_id', tests.create_firm(tests.account_id('cv-team')), 'owner_user_id', tests.get_uid('cv_owner'),
    'description', 'Other deal'), null, 'service');

select tests.login_as('cv_owner');
create temporary table cv_room (id uuid) on commit drop;
grant select, insert on cv_room to authenticated, service_role;
insert into cv_room select public.ensure_seller_room('c7000000-0000-0000-0000-0000000000d1');

reset role;

insert into public.accounts_memberships (user_id, account_id, account_role)
values (tests.get_uid('cv_member'), tests.account_id('cv-team'), 'member');

insert into public.seller_room_member (room_id, user_id, email, name)
select id, tests.get_uid('cv_seller'), 'cv_seller@opendealbook.test', 'Cara Seller' from cv_room;

insert into public.deal_counsel (account_id, deal_id, side, user_id, email)
values
  (tests.account_id('cv-team'), 'c7000000-0000-0000-0000-0000000000d1', 'buyer',
    tests.get_uid('cv_buyer_law'), 'cv_buyer_law@opendealbook.test'),
  (tests.account_id('cv-team'), 'c7000000-0000-0000-0000-0000000000d1', 'seller',
    tests.get_uid('cv_seller_law'), 'cv_seller_law@opendealbook.test');

insert into public.contract (id, deal_id, account_id, type, current_version)
values
  ('c7000000-0000-0000-0000-0000000000c1', 'c7000000-0000-0000-0000-0000000000d1', tests.account_id('cv-team'), 'apa', 3),
  ('c7000000-0000-0000-0000-0000000000c2', 'c7000000-0000-0000-0000-0000000000d1', tests.account_id('cv-team'), 'loi', 1),
  ('c7000000-0000-0000-0000-0000000000c3', 'c7000000-0000-0000-0000-0000000000d2', tests.account_id('cv-team'), 'apa', 1);

insert into public.contract_version (id, contract_id, account_id, version, source, party, shared_at)
values
  ('c7000000-0000-0000-0000-0000000000a1', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cv-team'), 1, 'upload', 'buyer', null),
  ('c7000000-0000-0000-0000-0000000000a2', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cv-team'), 2, 'upload', 'buyer', '2026-01-02 00:00:00+00'),
  ('c7000000-0000-0000-0000-0000000000a3', 'c7000000-0000-0000-0000-0000000000c1', tests.account_id('cv-team'), 3, 'upload', 'seller', null),
  ('c7000000-0000-0000-0000-0000000000b1', 'c7000000-0000-0000-0000-0000000000c2', tests.account_id('cv-team'), 1, 'upload', 'buyer', null),
  ('c7000000-0000-0000-0000-0000000000e1', 'c7000000-0000-0000-0000-0000000000c3', tests.account_id('cv-team'), 1, 'upload', 'buyer', now());

-- ---- Every file names its bucket ----
select throws_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party, docx_path)
     values ('c7000000-0000-0000-0000-0000000000c3', tests.account_id('cv-team'), 9, 'upload', 'buyer', 'x/y/v9.docx') $$,
  '23514', null, 'a Word file without its bucket is refused'
);
select throws_ok(
  $$ insert into public.contract_version (contract_id, account_id, version, source, party, pdf_bucket)
     values ('c7000000-0000-0000-0000-0000000000c3', tests.account_id('cv-team'), 10, 'upload', 'buyer', 'contracts') $$,
  '23514', null, 'a bucket without a PDF is refused'
);

-- ---- Buyer's counsel ----
select tests.login_as('cv_buyer_law');

select results_eq(
  $$ select id from public.contract order by id $$,
  $$ values ('c7000000-0000-0000-0000-0000000000c1'::uuid), ('c7000000-0000-0000-0000-0000000000c2'::uuid) $$,
  'buyer''s counsel read every contract on their deal and none on another'
);
select results_eq(
  $$ select id from public.contract_version order by id $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a1'::uuid), ('c7000000-0000-0000-0000-0000000000a2'::uuid),
            ('c7000000-0000-0000-0000-0000000000a3'::uuid), ('c7000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'buyer''s counsel read every version, internal drafts included'
);

-- ---- The seller side ----
-- The seller side never reads the contract tables, so no row count, version
-- number, file path or current_version can tell them a hidden draft exists.
-- Their versions are numbered 1..n among what they see, and the latest of
-- those is current.
select is(
  pg_get_function_result('public.seller_side_contract_versions(uuid)'::regprocedure) ~ '(path|bucket)',
  false,
  'the seller side is never handed a file path or bucket'
);

select tests.login_as('cv_seller_law');

select is_empty($$ select 1 from public.contract $$, 'seller''s counsel read no contract rows');
select is_empty($$ select 1 from public.contract_version $$, 'seller''s counsel read no version rows');
select is_empty(
  $$ select 1 from storage.objects where bucket_id in ('contracts', 'generated') $$,
  'seller''s counsel list no contract files'
);
select results_eq(
  $$ select id, type, current_version from public.seller_side_contracts('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000c1'::uuid, 'apa', 2) $$,
  'seller''s counsel see only contracts with a version shown to them, current at the latest of those'
);
select results_eq(
  $$ select id, contract_id, version from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a2'::uuid, 'c7000000-0000-0000-0000-0000000000c1'::uuid, 1),
            ('c7000000-0000-0000-0000-0000000000a3'::uuid, 'c7000000-0000-0000-0000-0000000000c1'::uuid, 2) $$,
  'seller''s counsel see shared and seller versions numbered from 1, never an internal draft'
);
select is_empty(
  $$ select 1 from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d2') $$,
  'seller''s counsel see nothing of another deal'
);

select tests.login_as('cv_seller');

select is_empty($$ select 1 from public.contract $$, 'a seller room member reads no contract rows');
select is_empty($$ select 1 from public.contract_version $$, 'a seller room member reads no version rows');
select results_eq(
  $$ select id, contract_id, version from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a2'::uuid, 'c7000000-0000-0000-0000-0000000000c1'::uuid, 1),
            ('c7000000-0000-0000-0000-0000000000a3'::uuid, 'c7000000-0000-0000-0000-0000000000c1'::uuid, 2) $$,
  'a seller room member sees the same numbered versions'
);

select is(
  (select shown_at from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1')
   where id = 'c7000000-0000-0000-0000-0000000000a2'),
  '2026-01-02 00:00:00+00'::timestamptz,
  'a shared version is dated when it was shared, not when it was drafted'
);
select is(
  pg_get_function_result('public.seller_side_contract_versions(uuid)'::regprocedure) ~ 'created_at',
  false,
  'the seller side is never handed when a version was drafted'
);

select tests.login_as('cv_buyer_law');

select results_eq(
  $$ select current_version from public.contract where id = 'c7000000-0000-0000-0000-0000000000c1' $$,
  $$ values (3) $$,
  'buyer''s counsel keep the real current version'
);

select tests.login_as('cv_stranger');

select is_empty($$ select 1 from public.contract $$, 'someone outside the deal reads no contracts');
select is_empty($$ select 1 from public.contract_version $$, 'someone outside the deal reads no versions');

-- ---- Sharing ----
select tests.login_as('cv_seller_law');

update public.contract_version set shared_at = null where id = 'c7000000-0000-0000-0000-0000000000a2';

select tests.login_as('cv_member');

update public.contract_version set shared_at = now() where id = 'c7000000-0000-0000-0000-0000000000a1';

reset role;

select isnt(
  (select shared_at from public.contract_version where id = 'c7000000-0000-0000-0000-0000000000a2'),
  null,
  'counsel cannot unshare a version'
);
select is(
  (select shared_at from public.contract_version where id = 'c7000000-0000-0000-0000-0000000000a1'),
  null,
  'a team member without deals.manage cannot share a version'
);

select tests.login_as('cv_owner');

update public.contract_version set shared_at = now() where id = 'c7000000-0000-0000-0000-0000000000a2';

select is(
  (select shared_at from public.contract_version where id = 'c7000000-0000-0000-0000-0000000000a2'),
  '2026-01-02 00:00:00+00'::timestamptz,
  'sharing a shared version again keeps when it was first shared'
);

update public.contract_version set shared_at = null where id = 'c7000000-0000-0000-0000-0000000000a2';

select tests.login_as('cv_seller_law');

select results_eq(
  $$ select id, version from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a3'::uuid, 2) $$,
  'an unshared version is hidden from the seller side again, and the rest keep their numbers'
);
select results_eq(
  $$ select current_version from public.seller_side_contracts('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values (2) $$,
  'the current version is the highest number the seller side can see'
);

select tests.login_as('cv_owner');

update public.contract_version set shared_at = now() where id = 'c7000000-0000-0000-0000-0000000000a1';
update public.contract_version set shared_at = now() where id = 'c7000000-0000-0000-0000-0000000000a2';
update public.contract_version set is_signed = true where id = 'c7000000-0000-0000-0000-0000000000b1';

select throws_ok(
  $$ update public.contract_version set seller_number = 9 where id = 'c7000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'nobody sets a seller-side number by hand'
);
select throws_ok(
  $$ update public.contract_version set party = 'seller' where id = 'c7000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'a version''s side is chosen only when it is added'
);
select throws_ok(
  $$ update public.contract_version set version = 9 where id = 'c7000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'a version''s number never changes'
);

select tests.login_as('cv_seller_law');

select results_eq(
  $$ select id, version from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000a2'::uuid, 1), ('c7000000-0000-0000-0000-0000000000a3'::uuid, 2),
            ('c7000000-0000-0000-0000-0000000000a1'::uuid, 3), ('c7000000-0000-0000-0000-0000000000b1'::uuid, 1) $$,
  'an older version shared later takes the next number, and a reshared one keeps its own'
);
select results_eq(
  $$ select id, current_version from public.seller_side_contracts('c7000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('c7000000-0000-0000-0000-0000000000c1'::uuid, 3), ('c7000000-0000-0000-0000-0000000000c2'::uuid, 1) $$,
  'a signed version is shown to the seller side'
);

-- ---- Access ends ----
select tests.login_as_service_role();
update public.seller_room set closed_at = now() from cv_room where seller_room.id = cv_room.id;

select tests.login_as('cv_seller');

select isnt_empty(
  $$ select 1 from public.seller_side_contract_versions('c7000000-0000-0000-0000-0000000000d1') $$,
  'a seller whose room is closed still reads the versions shown to them'
);

reset role;
delete from public.deal_counsel where user_id = tests.get_uid('cv_seller_law');

select tests.login_as('cv_seller_law');

select is_empty(
  $$ select 1 from public.seller_side_contracts('c7000000-0000-0000-0000-0000000000d1') $$,
  'removed counsel see no contracts'
);

select * from finish();
rollback;
