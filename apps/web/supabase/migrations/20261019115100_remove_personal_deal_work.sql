-- Deal work moved to teams: a personal account keeps only its owner's profile.
-- This removes everything else personal accounts hold. The anonymized pool links
-- are kept; a removed deal's link on them is nulled by their foreign keys.
-- Notifications pointing at a removed deal go too. One statement deletes from
-- every table, so the links between them are checked once at its end.

do $$
declare
  personal uuid[] := array(select id from public.accounts where is_personal_account);
  personal_deals uuid[] := array(select id from public.deal where account_id = any(personal));
  kept text[] := array['comp_pool_key', 'activity_pool_key'];
  deletes text[] := '{}';
  table_name text;
  found bigint;
begin
  delete from public.notifications
  where substring(link from '/deals/([0-9a-f-]{36})')::uuid = any(personal_deals);
  get diagnostics found = row_count;
  raise notice 'notifications: %', found;

  for table_name in
    select c.relname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'refuse_personal_account_row' and c.relname <> all(kept)
    order by c.relname
  loop
    execute format('select count(*) from public.%I where account_id = any($1)', table_name) into found using personal;
    if found > 0 then
      raise notice '%: %', table_name, found;
      deletes := deletes || format('%I as (delete from public.%I where account_id = any($1))', 'gone_' || table_name, table_name);
    end if;
  end loop;

  if cardinality(deletes) > 0 then
    execute 'with ' || array_to_string(deletes, ', ') || ' select 1' using personal;
  end if;

  update public.accounts set trial_ends_at = null where is_personal_account and trial_ends_at is not null;
  get diagnostics found = row_count;
  raise notice 'personal trials cleared: %', found;
end;
$$;
