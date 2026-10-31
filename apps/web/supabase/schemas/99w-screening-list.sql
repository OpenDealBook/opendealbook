-- The US Consolidated Screening List (trade.gov), imported weekly as a whole
-- snapshot. Global and service-role only: teams never read it directly, the
-- matcher screens subjects against it. Each import keeps its own rows, so a
-- retry or a crash mid-import never touches the snapshot being read; only the
-- newest succeeded import is current.

create type public.screening_import_status as enum ('running', 'succeeded', 'failed');

create table if not exists public.screening_import (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  as_of timestamptz,
  status public.screening_import_status not null default 'running',
  entry_count int,
  error text,
  created_at timestamptz not null default now()
);

alter table public.screening_import enable row level security;

revoke all on public.screening_import from anon, authenticated, service_role;
grant select, insert, update, delete on public.screening_import to service_role;

create table if not exists public.screening_entry (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.screening_import (id) on delete cascade,
  list_name text not null,
  source_entry_id text not null,
  name text not null,
  alt_names text[] not null default '{}',
  entry_type text check (entry_type in ('entity', 'individual', 'vessel', 'aircraft')),
  programs text[] not null default '{}',
  addresses jsonb not null default '[]',
  countries text[] not null default '{}',
  source_url text not null,
  as_of timestamptz not null,
  raw jsonb not null,
  unique (import_id, list_name, source_entry_id)
);

alter table public.screening_entry enable row level security;

revoke all on public.screening_entry from anon, authenticated, service_role;
grant select, insert, update, delete on public.screening_entry to service_role;

create or replace view public.screening_entry_current
with (security_invoker = true) as
select entry.*
from public.screening_entry entry
where entry.import_id = (
  select id from public.screening_import
  where status = 'succeeded'
  order by created_at desc
  limit 1
);

revoke all on public.screening_entry_current from anon, authenticated, service_role;
grant select on public.screening_entry_current to service_role;

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
grant select, insert, delete on public.screening_name to service_role;

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
