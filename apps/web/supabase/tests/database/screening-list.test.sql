begin;
select no_plan();

select tests.create_user('sl_member');

reset role;

delete from public.screening_import;

insert into public.screening_import (id, url, as_of, status, created_at)
values
  ('5c000000-0000-0000-0000-000000000001', 'https://csl.test/consolidated.json', '2026-10-19T11:00:00Z', 'succeeded', '2026-10-19T12:00:00Z'),
  ('5c000000-0000-0000-0000-000000000002', 'https://csl.test/consolidated.json', '2026-10-26T11:00:00Z', 'succeeded', '2026-10-26T12:00:00Z'),
  ('5c000000-0000-0000-0000-000000000003', 'https://csl.test/consolidated.json', '2026-11-02T11:00:00Z', 'running', '2026-11-02T12:00:00Z'),
  ('5c000000-0000-0000-0000-000000000004', 'https://csl.test/consolidated.json', '2026-11-01T11:00:00Z', 'failed', '2026-11-01T12:00:00Z');

insert into public.screening_entry
  (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
values
  ('5c000000-0000-0000-0000-000000000001', 'SDN', '1', 'Older Snapshot Co', 'entity', 'https://csl.test/sdn', '2026-10-19', '{}'),
  ('5c000000-0000-0000-0000-000000000002', 'SDN', '1', 'Latest Snapshot Co', 'entity', 'https://csl.test/sdn', '2026-10-26', '{}'),
  ('5c000000-0000-0000-0000-000000000002', 'SSI', '1', 'Latest Snapshot Co', 'entity', 'https://csl.test/ssi', '2026-10-26', '{}'),
  ('5c000000-0000-0000-0000-000000000003', 'SDN', '1', 'Unfinished Import Co', 'entity', 'https://csl.test/sdn', '2026-11-02', '{}'),
  ('5c000000-0000-0000-0000-000000000004', 'SDN', '1', 'Failed Import Co', 'entity', 'https://csl.test/sdn', '2026-11-01', '{}');

select results_eq(
  $$ select name, list_name from public.screening_entry_current order by list_name $$,
  $$ values ('Latest Snapshot Co', 'SDN'), ('Latest Snapshot Co', 'SSI') $$,
  'only the newest succeeded snapshot is current'
);

insert into public.screening_import (id, url, as_of, status, created_at)
values
  ('5c000000-0000-0000-0000-000000000005', 'https://csl.test/consolidated.json', '2026-10-26T11:00:00Z', 'succeeded', '2026-10-26T12:30:00Z');
insert into public.screening_entry
  (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
values
  ('5c000000-0000-0000-0000-000000000005', 'SDN', '1', 'Rerun Of Same Snapshot Co', 'entity', 'https://csl.test/sdn', '2026-10-26', '{}');

select results_eq(
  $$ select name from public.screening_entry_current $$,
  $$ values ('Rerun Of Same Snapshot Co') $$,
  'of two imports of the same snapshot, the one started last is current'
);

delete from public.screening_import where id = '5c000000-0000-0000-0000-000000000005';

select throws_ok(
  $$ insert into public.screening_entry (import_id, list_name, source_entry_id, name, source_url, as_of, raw)
     values ('5c000000-0000-0000-0000-000000000002', 'SDN', '1', 'Again', 'https://csl.test/sdn', '2026-10-26', '{}') $$,
  '23505', null,
  'a list entry is stored once per import'
);

select throws_ok(
  $$ insert into public.screening_entry (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
     values ('5c000000-0000-0000-0000-000000000002', 'SDN', '2', 'Boat', 'submarine', 'https://csl.test/sdn', '2026-10-26', '{}') $$,
  '23514', null,
  'an entry type is one the list publishes'
);

select tests.login_as_service_role();
select lives_ok(
  $$ insert into public.screening_entry (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
     values ('5c000000-0000-0000-0000-000000000002', 'SDN', '3', 'Written By Service', 'individual', 'https://csl.test/sdn', '2026-10-26', '{}') $$,
  'the service role writes entries'
);
select is(
  (select count(*) from public.screening_entry_current),
  3::bigint,
  'the service role reads the current snapshot'
);

select tests.login_as('sl_member');
select throws_ok(
  $$ select * from public.screening_entry $$,
  '42501', null, 'signed-in users cannot read entries'
);
select throws_ok(
  $$ select * from public.screening_entry_current $$,
  '42501', null, 'signed-in users cannot read the current snapshot'
);
select throws_ok(
  $$ select * from public.screening_import $$,
  '42501', null, 'signed-in users cannot read imports'
);

reset role;
delete from public.screening_import where id = '5c000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.screening_entry where import_id = '5c000000-0000-0000-0000-000000000001'),
  0::bigint,
  'deleting an import deletes its entries'
);

select * from finish();
rollback;
