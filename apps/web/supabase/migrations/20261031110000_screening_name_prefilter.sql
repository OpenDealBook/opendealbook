-- Each list name keyed the way the matcher compares it, once per subject kind
-- the entry can match, so screening reads only the entries that can reach the
-- match score. The key and its occurrence-tagged letter pairs are computed by
-- the importer with the matcher's own normalization.

create table if not exists public.screening_name (
  entry_id bigint not null references public.screening_entry (id) on delete cascade,
  variant text not null check (variant in ('person', 'business')),
  key text not null,
  pairs text[] not null,
  pair_count int generated always as (cardinality(pairs)) stored,
  primary key (entry_id, variant, key)
);

create index if not exists screening_name_pairs on public.screening_name using gin (pairs);
create index if not exists screening_name_key on public.screening_name (variant, key);

alter table public.screening_name enable row level security;

revoke all on public.screening_name from anon, authenticated, service_role;
grant select, insert, update, delete on public.screening_name to service_role;

-- A Dice score of at least 0.85 is 40 * shared >= 17 * (both pair counts), so
-- the pair counts lie within 17:23 of each other. Equal keys score 1 unless
-- empty.
create or replace function public.screening_candidates(p_variant text, p_key text, p_pairs text[])
  returns setof public.screening_entry
  language sql stable
  set search_path = '' as $$
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
          and 23 * name.pair_count >= 17 * cardinality(p_pairs)
          and 17 * name.pair_count <= 23 * cardinality(p_pairs)
          and 40 * (select count(*) from unnest(name.pairs) pair where pair = any (p_pairs))
            >= 17 * (name.pair_count + cardinality(p_pairs))
        )
      )
  );
$$;

revoke all on function public.screening_candidates(text, text, text[]) from public, anon, authenticated;
grant execute on function public.screening_candidates(text, text, text[]) to service_role;
