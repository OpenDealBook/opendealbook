begin;
select no_plan();

select tests.create_user('sc_member');

reset role;

delete from public.screening_import;

insert into public.screening_import (id, url, as_of, status, created_at)
values
  ('5d000000-0000-0000-0000-000000000001', 'https://csl.test/consolidated.json', '2026-10-19T11:00:00Z', 'succeeded', '2026-10-19T12:00:00Z'),
  ('5d000000-0000-0000-0000-000000000002', 'https://csl.test/consolidated.json', '2026-10-26T11:00:00Z', 'succeeded', '2026-10-26T12:00:00Z');

insert into public.screening_entry
  (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
select '5d000000-0000-0000-0000-000000000002', 'SDN', source_entry_id, 'Fictional Entry ' || source_entry_id, 'individual', 'https://csl.test/sdn', '2026-10-26', '{}'
from unnest(array['at-score', 'below-score', 'shortest', 'too-short', 'single', 'empty', 'business-only']) source_entry_id;

insert into public.screening_entry
  (import_id, list_name, source_entry_id, name, entry_type, source_url, as_of, raw)
values ('5d000000-0000-0000-0000-000000000001', 'SDN', 'older', 'Fictional Entry older', 'individual', 'https://csl.test/sdn', '2026-10-19', '{}');

create function pg_temp.sc_pairs(prefix text, first int, last int) returns text[]
  language sql as $$ select array(select prefix || n from generate_series(first, last) n) $$;

insert into public.screening_name (entry_id, variant, key, pairs)
select entry.id, name.variant, name.key, name.pairs
from public.screening_entry entry
join (values
  ('at-score', 'person', 'k1', pg_temp.sc_pairs('p', 1, 17) || pg_temp.sc_pairs('q', 1, 3)),
  ('below-score', 'person', 'k2', pg_temp.sc_pairs('p', 1, 17) || pg_temp.sc_pairs('q', 1, 4)),
  ('shortest', 'person', 'k3', pg_temp.sc_pairs('p', 1, 15)),
  ('too-short', 'person', 'k4', pg_temp.sc_pairs('p', 1, 14)),
  ('single', 'person', 'x', '{}'::text[]),
  ('empty', 'person', '', '{}'::text[]),
  ('business-only', 'business', 'k5', pg_temp.sc_pairs('p', 1, 20)),
  ('older', 'person', 'k6', pg_temp.sc_pairs('p', 1, 20))
) name (source_entry_id, variant, key, pairs) using (source_entry_id);

select tests.login_as_service_role();

select results_eq(
  $$ select source_entry_id from public.screening_candidates('person', 'subject', array(select 'p' || n from generate_series(1, 20) n), 0.85) order by 1 $$,
  $$ values ('at-score'), ('shortest') $$,
  'a person is screened against current person names that can reach 0.85, the bound included'
);

select results_eq(
  $$ select source_entry_id from public.screening_candidates('person', 'x', '{}', 0.85) $$,
  $$ values ('single') $$,
  'a one-letter name matches the same one-letter name'
);

select is_empty(
  $$ select source_entry_id from public.screening_candidates('person', '', '{}', 0.85) $$,
  'an empty name matches nothing'
);

select results_eq(
  $$ select source_entry_id from public.screening_candidates('business', 'subject', array(select 'p' || n from generate_series(1, 20) n), 0.85) $$,
  $$ values ('business-only') $$,
  'a business is screened against business names only'
);

select results_eq(
  $$ select source_entry_id from public.screening_candidates('person', 'subject', array(select 'p' || n from generate_series(1, 20) n), 0.8) order by 1 $$,
  $$ values ('at-score'), ('below-score'), ('shortest'), ('too-short') $$,
  'the threshold passed in sets which names can match'
);

select ok(
  not has_table_privilege('service_role', 'public.screening_name', 'update'),
  'screening names are written once, never updated'
);

reset role;
delete from public.screening_name;
select tests.login_as_service_role();
select throws_ok(
  $$ select * from public.screening_candidates('person', 'x', '{}', 0.85) $$,
  'P0001', 'The sanctions list is not indexed yet',
  'a current list without names refuses to screen'
);
reset role;
insert into public.screening_name (entry_id, variant, key, pairs)
select id, 'person', 'x', '{}' from public.screening_entry where source_entry_id = 'single';

select tests.login_as('sc_member');
select throws_ok(
  $$ select * from public.screening_candidates('person', 'x', '{}', 0.85) $$,
  '42501', null, 'signed-in users cannot screen'
);
select throws_ok(
  $$ select * from public.screening_name $$,
  '42501', null, 'signed-in users cannot read screening names'
);

reset role;
delete from public.screening_entry where source_entry_id = 'single';
select is(
  (select count(*) from public.screening_name where key = 'x'),
  0::bigint,
  'deleting an entry deletes its names'
);

select * from finish();
rollback;
