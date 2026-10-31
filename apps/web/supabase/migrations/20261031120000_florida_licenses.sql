-- Florida DBPR license files, imported nightly as a whole snapshot. Global and
-- service-role only: the licenses source reads it for Florida businesses. Each
-- import keeps its own rows, so a retry or a crash mid-import never touches the
-- snapshot being read; only the newest succeeded import is current.

create type public.florida_license_import_status as enum ('running', 'succeeded', 'failed');

create table if not exists public.florida_license_import (
  id uuid primary key default gen_random_uuid(),
  status public.florida_license_import_status not null default 'running',
  license_count int,
  error text,
  created_at timestamptz not null default now()
);

alter table public.florida_license_import enable row level security;

revoke all on public.florida_license_import from anon, authenticated, service_role;
grant select, insert, update, delete on public.florida_license_import to service_role;

create table if not exists public.florida_license (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.florida_license_import (id) on delete cascade,
  file text not null,
  licensee_name text not null,
  normalized_names text[] not null,
  license_number text,
  license_type text not null,
  status text check (status in ('Active', 'Inactive')),
  expires_on date,
  raw jsonb not null
);

create index if not exists florida_license_import_idx
  on public.florida_license (import_id);

create index if not exists florida_license_names_idx
  on public.florida_license using gin (normalized_names);

alter table public.florida_license enable row level security;

revoke all on public.florida_license from anon, authenticated, service_role;
grant select, insert, update, delete on public.florida_license to service_role;
