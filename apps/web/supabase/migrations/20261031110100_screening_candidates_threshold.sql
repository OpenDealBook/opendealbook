revoke update on public.screening_name from service_role;

drop function public.screening_candidates(text, text, text[]);

-- A name can reach the threshold t only when 2 * shared >= t * (both pair
-- counts), and since shared is at most the smaller count, each count is at
-- least t / (2 - t) times the other. Equal keys score 1 unless empty. A
-- current list without names was loaded before keys existed; screening it
-- would miss every match, so it refuses until the worker indexes it.
create or replace function public.screening_candidates(
  p_variant text, p_key text, p_pairs text[], p_threshold numeric)
  returns setof public.screening_entry
  language plpgsql stable
  set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.screening_entry_current entry
    join public.screening_name name on name.entry_id = entry.id
  ) then
    raise exception 'The sanctions list is not indexed yet';
  end if;
  return query
  select entry.*
  from public.screening_entry_current entry
  where entry.id in (
    select name.entry_id
    from public.screening_name name
    where name.variant = p_variant
      and (
        (name.key = p_key and p_key <> '')
        or (
          name.pairs && p_pairs
          and (2 - p_threshold) * name.pair_count >= p_threshold * cardinality(p_pairs)
          and (2 - p_threshold) * cardinality(p_pairs) >= p_threshold * name.pair_count
          and 2 * (select count(*) from unnest(name.pairs) pair where pair = any (p_pairs))
            >= p_threshold * (name.pair_count + cardinality(p_pairs))
        )
      )
  );
end;
$$;

revoke all on function public.screening_candidates(text, text, text[], numeric) from public, anon, authenticated;
grant execute on function public.screening_candidates(text, text, text[], numeric) to service_role;
