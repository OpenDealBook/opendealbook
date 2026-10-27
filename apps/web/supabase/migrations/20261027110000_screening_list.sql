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
  order by as_of desc
  limit 1
);

revoke all on public.screening_entry_current from anon, authenticated, service_role;
grant select on public.screening_entry_current to service_role;
