begin;
select no_plan();

select has_schema('odb');
select hasnt_schema('tuckin');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
     where p.prosrc ilike '%tuckin%' or array_to_string(p.proconfig, ',') ilike '%tuckin%' $$,
  'no function body or search_path names the old schema'
);

select * from finish();
rollback;
