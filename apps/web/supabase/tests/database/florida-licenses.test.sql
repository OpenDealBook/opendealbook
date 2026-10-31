begin;
select no_plan();

select tests.create_user('fl_member');

reset role;

delete from public.florida_license_import;

insert into public.florida_license_import (id, status, created_at)
values
  ('f1000000-0000-0000-0000-000000000001', 'succeeded', '2026-10-01T07:00:00Z'),
  ('f1000000-0000-0000-0000-000000000002', 'succeeded', '2026-10-20T07:00:00Z'),
  ('f1000000-0000-0000-0000-000000000003', 'running', '2026-10-21T07:00:00Z'),
  ('f1000000-0000-0000-0000-000000000004', 'failed', '2026-10-22T07:00:00Z');

insert into public.florida_license (import_id, file, licensee_name, normalized_names, license_number, license_type, status, expires_on, raw)
values
  ('f1000000-0000-0000-0000-000000000001', 'CONSTRUCTIONLICENSE_1.csv', 'HARBOR FIXTURE DENTAL OLD', '{harbor fixture dental}', 'CBC1', 'CBC', 'Active', '2028-08-31', '[]'),
  ('f1000000-0000-0000-0000-000000000002', 'CONSTRUCTIONLICENSE_1.csv', 'HARBOR FIXTURE DENTAL, LLC', '{harbor fixture dental}', 'CBC2', 'CBC', 'Active', '2028-08-31', '["HARBOR FIXTURE DENTAL, LLC"]'),
  ('f1000000-0000-0000-0000-000000000002', 'REALESTATE2501LICENSE_1.csv', 'EXAMPLE, PAT', '{example pat,harbor fixture dental}', 'BK3', 'BK Broker', 'Inactive', null, '[]'),
  ('f1000000-0000-0000-0000-000000000002', 'CONSTRUCTIONLICENSE_1.csv', 'HARBOR FIXTURE DENTAL SUPPLY', '{harbor fixture dental supply}', 'CBC4', 'CBC', 'Active', null, '[]'),
  ('f1000000-0000-0000-0000-000000000003', 'CONSTRUCTIONLICENSE_1.csv', 'HARBOR FIXTURE DENTAL RUNNING', '{harbor fixture dental}', 'CBC5', 'CBC', 'Active', null, '[]'),
  ('f1000000-0000-0000-0000-000000000004', 'CONSTRUCTIONLICENSE_1.csv', 'HARBOR FIXTURE DENTAL FAILED', '{harbor fixture dental}', 'CBC6', 'CBC', 'Active', null, '[]');

select tests.login_as_service_role();

select is(
  public.florida_licenses_named('harbor fixture dental'),
  jsonb_build_object(
    'snapshot_at', '2026-10-20T07:00:00+00:00'::timestamptz,
    'match_count', 2,
    'licenses', jsonb_build_array(
      jsonb_build_object('licensee_name', 'HARBOR FIXTURE DENTAL, LLC', 'license_number', 'CBC2', 'license_type', 'CBC', 'status', 'Active', 'expires_on', '2028-08-31', 'raw', jsonb_build_array('HARBOR FIXTURE DENTAL, LLC')),
      jsonb_build_object('licensee_name', 'EXAMPLE, PAT', 'license_number', 'BK3', 'license_type', 'BK Broker', 'status', 'Inactive', 'expires_on', null, 'raw', '[]'::jsonb)
    )
  ),
  'a name is read from the newest succeeded snapshot only, by any of its names, with the snapshot time'
);

select is(
  public.florida_licenses_named('nobody by this name') -> 'licenses',
  '[]'::jsonb,
  'a name with no license in the newest snapshot reads an empty list'
);

reset role;
insert into public.florida_license (import_id, file, licensee_name, normalized_names, license_number, license_type, raw)
select 'f1000000-0000-0000-0000-000000000002', 'CONSTRUCTIONLICENSE_1.csv', 'COMMON NAME ' || n, '{common name}', 'CBC' || n, 'CBC', '[]'
from generate_series(1, 201) n;
select tests.login_as_service_role();

select is(
  public.florida_licenses_named('common name') -> 'match_count',
  '201'::jsonb,
  'the read counts every match'
);

select is(
  jsonb_array_length(public.florida_licenses_named('common name') -> 'licenses'),
  200,
  'the read returns at most 200 licenses'
);

reset role;
update public.florida_license_import set status = 'failed' where status = 'succeeded';
select tests.login_as_service_role();

select is(
  public.florida_licenses_named('harbor fixture dental'),
  null,
  'with no succeeded snapshot there is nothing to read'
);

select tests.login_as('fl_member');
select throws_ok(
  $$ select public.florida_licenses_named('harbor fixture dental') $$,
  '42501', null, 'signed-in users cannot read Florida licenses'
);

select * from finish();
rollback;
