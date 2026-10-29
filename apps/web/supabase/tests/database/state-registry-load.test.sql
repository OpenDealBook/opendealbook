begin;
select no_plan();

select tests.create_user('srl_reader');

insert into public.lead_import (id, source, filename, status, rows_read, created_at)
values
  ('e7000000-0000-0000-0000-0000000000a1', 'state_registry', 'srl-zz', 'succeeded', 10, now() - interval '7 days'),
  ('e7000000-0000-0000-0000-0000000000a2', 'state_registry', 'srl-zz', 'running', 0, now()),
  ('e7000000-0000-0000-0000-0000000000a3', 'state_registry', 'srl-new', 'running', 0, now()),
  ('e7000000-0000-0000-0000-0000000000a4', 'state_registry', 'srl-xx', 'running', 0, now());

create temporary table every_field as
select array['source_id', 'status', 'formation_date', 'registered_agent', 'mailing_address_line1',
             'mailing_city', 'mailing_state', 'mailing_postal_code'] as fields;

select is(
  (select count(*)::int from public.upsert_state_registry_entities(
    '[{"state": "ZZ", "entity_number": "srl-1", "source_id": "src-1", "import_id": "e7000000-0000-0000-0000-0000000000a1",
       "name": "Sample One LLC", "status": "active", "mailing_address_line1": "1 Sample St", "mailing_city": "Bend",
       "source": "bulk_file", "fetched_at": "2026-10-18"},
      {"state": "ZZ", "entity_number": "srl-2", "import_id": "e7000000-0000-0000-0000-0000000000a1",
       "name": "Sample Two LLC", "status": "active", "source": "bulk_file", "fetched_at": "2026-10-18"},
      {"state": "YY", "entity_number": "srl-3", "import_id": "e7000000-0000-0000-0000-0000000000a1",
       "name": "Other State LLC", "status": "active", "source": "bulk_file", "fetched_at": "2026-10-18"}]'::jsonb,
    (select fields from every_field)
  ) r where r.id is not null),
  3,
  'upserting registry entities returns an id for each one'
);

select public.upsert_state_registry_entities(
  '[{"state": "ZZ", "entity_number": "srl-1", "source_id": "src-1", "import_id": "e7000000-0000-0000-0000-0000000000a2",
     "name": "Sample One LLC", "status": "active", "registered_agent": "Casey Fictional",
     "source": "bulk_file", "fetched_at": "2026-10-25"}]'::jsonb,
  (select fields from every_field)
);

select results_eq(
  $$ select source_id, status, registered_agent, mailing_address_line1, mailing_city, import_id::text
     from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1' $$,
  $$ values ('src-1', 'active', 'Casey Fictional', null, null, 'e7000000-0000-0000-0000-0000000000a2') $$,
  'a newer import of the same file clears what it leaves blank'
);

select public.upsert_state_registry_entities(
  '[{"state": "ZZ", "entity_number": "srl-1", "import_id": "e7000000-0000-0000-0000-0000000000a2",
     "name": "Sample One LLC", "mailing_address_line1": "2 New St", "mailing_city": "Bend",
     "source": "bulk_file", "fetched_at": "2026-10-25"}]'::jsonb,
  (select fields from every_field)
);

select results_eq(
  $$ select source_id, status, registered_agent, mailing_address_line1, mailing_city
     from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1' $$,
  $$ values ('src-1', 'active', 'Casey Fictional', '2 New St', 'Bend') $$,
  'a later batch of the same import fills what it carries and keeps what it leaves blank'
);

select public.upsert_state_registry_entities(
  '[{"state": "ZZ", "entity_number": "srl-1", "import_id": "e7000000-0000-0000-0000-0000000000a2",
     "name": "Sample One LLC", "status": "inactive (merged)", "source": "bulk_file", "fetched_at": "2026-10-25"}]'::jsonb,
  (select fields from every_field)
);

select is(
  (select status from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1'),
  'inactive (merged)',
  'a later status replaces the earlier one'
);

select public.upsert_state_registry_entities(
  '[{"state": "ZZ", "entity_number": "srl-1", "import_id": "e7000000-0000-0000-0000-0000000000a2",
     "name": "Sample One LLC", "source": "bulk_file", "fetched_at": "2026-10-01"}]'::jsonb,
  (select fields from every_field)
);

select is(
  (select fetched_at from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1'),
  '2026-10-25'::timestamptz,
  'an older file never moves fetched_at backwards'
);

select results_eq(
  $$ select r.entity_number from public.upsert_state_registry_entities(
       '[{"state": "WW", "entity_number": "srl-5", "source_id": "src-shared", "import_id": "e7000000-0000-0000-0000-0000000000a1",
          "name": "First Claim LLC", "source": "bulk_file", "fetched_at": "2026-10-18"},
         {"state": "WW", "entity_number": "srl-6", "source_id": "src-shared", "import_id": "e7000000-0000-0000-0000-0000000000a1",
          "name": "Second Claim LLC", "source": "bulk_file", "fetched_at": "2026-10-18"},
         {"state": "WW", "entity_number": "srl-7", "source_id": "src-7", "import_id": "e7000000-0000-0000-0000-0000000000a1",
          "name": "Own Id LLC", "source": "bulk_file", "fetched_at": "2026-10-18"}]'::jsonb,
       (select fields from every_field)) r order by 1 $$,
  $$ values ('srl-5'), ('srl-7') $$,
  'a second row claiming a source id already in the batch is refused, and the rest load'
);
select results_eq(
  $$ select r.entity_number from public.upsert_state_registry_entities(
       '[{"state": "WW", "entity_number": "srl-8", "source_id": "src-7", "import_id": "e7000000-0000-0000-0000-0000000000a2",
          "name": "Taken Id LLC", "source": "bulk_file", "fetched_at": "2026-10-25"},
         {"state": "WW", "entity_number": "srl-7", "source_id": "src-7", "import_id": "e7000000-0000-0000-0000-0000000000a2",
          "name": "Own Id LLC", "source": "bulk_file", "fetched_at": "2026-10-25"}]'::jsonb,
       (select fields from every_field)) r order by 1 $$,
  $$ values ('srl-7') $$,
  'a row claiming a source id another entity holds is refused, and the holder still loads'
);
select is_empty(
  $$ select 1 from public.state_registry_entity where state = 'WW' and entity_number in ('srl-6', 'srl-8') $$,
  'refused rows are not stored'
);

select public.upsert_state_registry_entities(
  '[{"state": "XX", "entity_number": "srl-4", "import_id": "e7000000-0000-0000-0000-0000000000a1",
     "name": "Agent Kept LLC", "registered_agent": "Sample Agents Inc", "mailing_city": "Hartford",
     "source": "bulk_file", "fetched_at": "2026-10-18"}]'::jsonb,
  (select fields from every_field)
);
select public.upsert_state_registry_entities(
  '[{"state": "XX", "entity_number": "srl-4", "import_id": "e7000000-0000-0000-0000-0000000000a4",
     "name": "Agent Kept LLC", "mailing_city": "Mystic", "source": "bulk_file", "fetched_at": "2026-10-25"}]'::jsonb,
  array['mailing_address_line1', 'mailing_city', 'mailing_state', 'mailing_postal_code']
);

select results_eq(
  $$ select registered_agent, mailing_city from public.state_registry_entity where state = 'XX' and entity_number = 'srl-4' $$,
  $$ values ('Sample Agents Inc', 'Mystic') $$,
  'a newer import leaves alone the fields its file does not carry'
);

select is(
  public.attach_state_registry_details('ZZ', 'ZZ principals', 'e7000000-0000-0000-0000-0000000000a1',
    '[{"source_id": "src-1", "registered_agent": "Sample Agents Inc", "rows": 2,
       "officers": [{"name": "Morgan Example", "title": "Officer"}, {"name": "Morgan Example", "title": "Director"}]},
      {"source_id": "src-unknown", "registered_agent": "Nobody Agents", "rows": 3,
       "officers": [{"name": "Sky Sample", "title": "Director"}]}]'::jsonb
  ),
  3,
  'attaching details counts the raw rows that match no entity'
);
select public.replace_state_registry_officers('ZZ other', 'e7000000-0000-0000-0000-0000000000a1',
  array[(select id from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1')],
  jsonb_build_array(jsonb_build_object(
    'entity_id', (select id from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1'),
    'name', 'Lee Other', 'title', 'Member'))
);
select public.attach_state_registry_details('ZZ', 'ZZ principals', 'e7000000-0000-0000-0000-0000000000a2',
  '[{"source_id": "src-1", "registered_agent": null,
     "officers": [{"name": "Morgan Example", "title": "Officer"}, {"name": "Morgan Example", "title": "Officer"}]}]'::jsonb
);
select public.attach_state_registry_details('ZZ', 'ZZ principals', 'e7000000-0000-0000-0000-0000000000a2',
  '[{"source_id": "src-1", "registered_agent": null,
     "officers": [{"name": "Morgan Example", "title": "Officer"}]}]'::jsonb
);

select results_eq(
  $$ select o.dataset, o.name, o.title from public.state_registry_officer o
     join public.state_registry_entity e on e.id = o.entity_id
     where e.state = 'ZZ' and e.entity_number = 'srl-1' order by o.dataset, o.title $$,
  $$ values ('ZZ other', 'Lee Other', 'Member'), ('ZZ principals', 'Morgan Example', 'Officer') $$,
  'a newer import of a file removes the officers it no longer lists for an entity, and only its own'
);
select is(
  (select registered_agent from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-1'),
  'Sample Agents Inc',
  'details set the registered agent, and a row without one keeps it'
);
select is_empty(
  $$ select 1 from public.state_registry_entity where registered_agent = 'Nobody Agents'
     union all
     select 1 from public.state_registry_officer where name = 'Sky Sample' $$,
  'details for a source id no entity carries attach nothing'
);

select public.replace_state_registry_officers('ZZ', 'e7000000-0000-0000-0000-0000000000a1',
  array[(select id from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-2')],
  jsonb_build_array(jsonb_build_object(
    'entity_id', (select id from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-2'),
    'name', 'Pat Owner', 'title', 'CEO'))
);
select public.replace_state_registry_officers('ZZ', 'e7000000-0000-0000-0000-0000000000a2',
  array[(select id from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-2')],
  '[]'::jsonb
);

select is_empty(
  $$ select 1 from public.state_registry_officer o
     join public.state_registry_entity e on e.id = o.entity_id
     where e.state = 'ZZ' and e.entity_number = 'srl-2' $$,
  'an entity a newer import lists without officers loses that file''s officers'
);

insert into public.state_registry_entity (state, entity_number, import_id, name, status, source, fetched_at)
values
  ('ZZ', 'srl-api', 'e7000000-0000-0000-0000-0000000000a1', 'Fetched Co', 'active', 'api', now()),
  ('ZZ', 'srl-orphan', null, 'Orphan Co', 'active', 'bulk_file', now()),
  ('ZZ', 'srl-dissolved', 'e7000000-0000-0000-0000-0000000000a1', 'Dissolved Co', 'inactive (dissolved)', 'bulk_file', now());

select is(
  public.mark_unlisted_state_registry_entities('ZZ', 'e7000000-0000-0000-0000-0000000000a3', 100),
  false,
  'the first import of a file has no baseline and marks nothing'
);
select is(
  public.mark_unlisted_state_registry_entities('ZZ', 'e7000000-0000-0000-0000-0000000000a2', 7),
  false,
  'an import under 80% of the rows of the last succeeded import of its file marks nothing'
);
select is(
  (select status from public.state_registry_entity where state = 'ZZ' and entity_number = 'srl-2'),
  'active',
  'an entity stays as it was when no drop-outs are marked'
);

select public.mark_unlisted_state_registry_entities('ZZ', 'e7000000-0000-0000-0000-0000000000a2', 8);
select is(
  public.mark_unlisted_state_registry_entities('ZZ', 'e7000000-0000-0000-0000-0000000000a2', 8),
  true,
  'an import with at least 80% of the baseline rows marks drop-outs'
);

select results_eq(
  $$ select entity_number, status from public.state_registry_entity
     where entity_number in ('srl-1', 'srl-2', 'srl-3', 'srl-api', 'srl-orphan', 'srl-dissolved') order by entity_number $$,
  $$ values ('srl-1', 'inactive (merged)'), ('srl-2', 'inactive (no longer listed)'), ('srl-3', 'active'),
            ('srl-api', 'active'), ('srl-dissolved', 'inactive (dissolved)'), ('srl-orphan', 'active') $$,
  'only active bulk-file entities of that state an earlier import listed and the latest left out are marked, however often it runs'
);

select has_column('public', 'lead_import', 'rows_unmatched', 'an import counts the rows that matched no entity');

select tests.login_as('srl_reader');

select throws_ok(
  $$ select public.upsert_state_registry_entities('[]'::jsonb, array[]::text[]) $$,
  '42501', null, 'a signed-in user cannot load registry entities'
);
select throws_ok(
  $$ select public.attach_state_registry_details('ZZ', 'ZZ principals', 'e7000000-0000-0000-0000-0000000000a2', '[]'::jsonb) $$,
  '42501', null, 'a signed-in user cannot attach registry details'
);
select throws_ok(
  $$ select public.replace_state_registry_officers('ZZ', 'e7000000-0000-0000-0000-0000000000a2', array[]::uuid[], '[]'::jsonb) $$,
  '42501', null, 'a signed-in user cannot replace registry officers'
);
select throws_ok(
  $$ select public.mark_unlisted_state_registry_entities('ZZ', 'e7000000-0000-0000-0000-0000000000a2', 8) $$,
  '42501', null, 'a signed-in user cannot mark registry entities unlisted'
);

select * from finish();
rollback;
