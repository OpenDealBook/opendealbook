begin;
select no_plan();

-- Two tenants. Comp rows are seeded as the service role, which bypasses RLS, so
-- each read below is testing the authenticated policy, not the write path.
select tests.create_user('comp_a_owner');
select tests.create_user('comp_b_owner');

select tests.login_as_service_role();
select public.create_team_account('Comp A', tests.get_uid('comp_a_owner'), 'comp-a');
select public.create_team_account('Comp B', tests.get_uid('comp_b_owner'), 'comp-b');

insert into public.comp (id, data_class, source, source_label, source_ref, naics_code, industry, region, state, sale_price, sde, price_basis, confidence)
values ('e1111111-0000-0000-0000-000000000001', 'external', 'sba_foia', 'SBA 7(a) FOIA', 'sba-1', '541211', 'Accounting', 'South', 'GA', 500000, 125000, 'loan_proxy', 'proxy');

insert into public.comp (id, account_id, data_class, source, industry, sale_price, sde)
values ('c1111111-0000-0000-0000-000000000001', tests.account_id('comp-a'), 'internal', 'internal_close', 'Accounting', 600000, 150000);

insert into public.comp (id, account_id, data_class, source, industry, sale_price, sde)
values ('c2222222-0000-0000-0000-000000000001', tests.account_id('comp-a'), 'proprietary', 'dealstats', 'Accounting', 700000, 175000);

insert into public.comp_license (id, account_id, vendor, status)
values ('d1111111-0000-0000-0000-000000000001', tests.account_id('comp-a'), 'dealstats', 'active');

-- Generated multiples land on insert.
select is(
  (select multiple_sde from public.comp where id = 'c1111111-0000-0000-0000-000000000001'),
  4.0,
  'multiple_sde is generated from sale_price and sde'
);

-- ---- data-source labeling: external rows are always attributed ----
select is(
  (select contributor_member from public.comp_license where id = 'd1111111-0000-0000-0000-000000000001'),
  false,
  'comp_license.contributor_member defaults to false'
);
select has_column('public', 'comp', 'price_basis', 'comp carries a price_basis');
select has_column('public', 'comp', 'confidence', 'comp carries a confidence');
select throws_ok(
  $$ insert into public.comp (data_class, source, sale_price) values ('external', 'sba_foia', 100000) $$,
  '23514',
  null,
  'an external comp without a source_label is rejected'
);
select lives_ok(
  $$ insert into public.comp (account_id, data_class, source, sale_price)
     values (tests.account_id('comp-a'), 'internal', 'own_close', 100000) $$,
  'an internal comp without a source_label is allowed'
);

-- ---- external rows are cross-tenant open data, served only through the view ----
select tests.login_as('comp_b_owner');
select is(
  (select count(*)::int from public.comp_external where id = 'e1111111-0000-0000-0000-000000000001'),
  1,
  'a foreign tenant reads an external comp through comp_external'
);
select is_empty(
  $$ select 1 from public.comp where id = 'e1111111-0000-0000-0000-000000000001' $$,
  'an external comp is not exposed through the base comp table'
);

-- ---- internal rows stay inside the owning tenant ----
select tests.login_as('comp_a_owner');
select is(
  (select count(*)::int from public.comp where id = 'c1111111-0000-0000-0000-000000000001'),
  1,
  'the owning tenant reads its internal comp'
);
select tests.login_as('comp_b_owner');
select is_empty(
  $$ select 1 from public.comp where id = 'c1111111-0000-0000-0000-000000000001' $$,
  'an internal comp never crosses to another tenant'
);

-- ---- proprietary rows need an active license, never cross tenants ----
select tests.login_as('comp_a_owner');
select is(
  (select count(*)::int from public.comp where id = 'c2222222-0000-0000-0000-000000000001'),
  1,
  'the owning tenant reads a proprietary comp while its license is active'
);
select tests.login_as('comp_b_owner');
select is_empty(
  $$ select 1 from public.comp where id = 'c2222222-0000-0000-0000-000000000001' $$,
  'a proprietary comp never crosses to another tenant'
);

select tests.login_as_service_role();
update public.comp_license set status = 'revoked' where id = 'd1111111-0000-0000-0000-000000000001';

select tests.login_as('comp_a_owner');
select is_empty(
  $$ select 1 from public.comp where id = 'c2222222-0000-0000-0000-000000000001' $$,
  'a proprietary comp is hidden once the license is no longer active'
);

-- ---- data_class is immutable after insert ----
select tests.login_as_service_role();
select throws_ok(
  $$ update public.comp set data_class = 'external' where id = 'c1111111-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'data_class cannot be changed after insert'
);
select lives_ok(
  $$ update public.comp set industry = 'Tax' where id = 'c1111111-0000-0000-0000-000000000001' $$,
  'other comp columns remain updatable'
);

-- ---- internal and proprietary comps are indexed for tenant search ----
select tests.login_as('comp_a_owner');
select is(
  (select count(*)::int from public.search_document where entity_type = 'comp' and entity_id = 'c1111111-0000-0000-0000-000000000001'),
  1,
  'an internal comp is indexed into search_document'
);
select is_empty(
  $$ select 1 from public.search_document where entity_type = 'comp' and entity_id = 'e1111111-0000-0000-0000-000000000001' $$,
  'an external comp with no account is not indexed for tenant search'
);

-- ---- the anonymized pool is read only through the k-anonymity view ----
select tests.login_as_service_role();
insert into public.comp_pool (pseudonym, region, naics3, industry_short, close_quarter, sde_multiple, sale_price_banded)
select 'ps-thin-' || g, 'South', '541', 'Accounting', '2026Q1', 2.5, 500000 from generate_series(1, 4) g;
insert into public.comp_pool (pseudonym, region, naics3, industry_short, close_quarter, sde_multiple, sale_price_banded)
select 'ps-full-' || g, 'West', '722', 'Restaurant', '2026Q1', 3.0, 400000 from generate_series(1, 5) g;

select tests.login_as('comp_a_owner');
select is_empty(
  $$ select 1 from public.comp_pool_public where region = 'South' and naics3 = '541' $$,
  'the k-anonymity view hides a bucket below the minimum'
);
select is(
  (select n::int from public.comp_pool_public where region = 'West' and naics3 = '722'),
  5,
  'the k-anonymity view exposes a bucket at or above the minimum'
);

-- ---- the pseudonym key table is closed to tenants ----
select throws_ok(
  $$ select 1 from public.comp_pool_key $$,
  '42501',
  null,
  'a tenant cannot read the pseudonym-to-deal key table'
);

select * from finish();
rollback;
