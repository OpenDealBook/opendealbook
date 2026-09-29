begin;
select no_plan();

-- The structural moat: no public view may read the comp table without a
-- predicate that excludes proprietary rows. A view runs with its owner's rights
-- and so bypasses the row policy, which is exactly why the filter has to live in
-- the view text. The two accepted forms are `data_class <> 'proprietary'` and the
-- stricter `data_class = 'external'`.
select is(
  (
    select count(*)::int from pg_views
    where schemaname = 'public'
      and definition ~ '\ycomp\y'
      and definition !~ 'data_class <> ''proprietary'''
      and definition !~ 'data_class = ''external'''
  ),
  0,
  'no public view selects from comp without excluding proprietary rows'
);

-- The guard has teeth: a view that reads comp with no exclusion is flagged.
create view public.comp_leak_probe as select id, data_class from public.comp;
select isnt(
  (
    select count(*)::int from pg_views
    where schemaname = 'public'
      and viewname = 'comp_leak_probe'
      and definition ~ '\ycomp\y'
      and definition !~ 'data_class <> ''proprietary'''
      and definition !~ 'data_class = ''external'''
  ),
  0,
  'the guard flags a view that reads comp without excluding proprietary rows'
);
drop view public.comp_leak_probe;

select * from finish();
rollback;
