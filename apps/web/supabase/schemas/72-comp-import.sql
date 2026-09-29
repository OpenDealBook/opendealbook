-- A vendor export import batch. One row per uploaded file, recording what was
-- imported and under which license, so proprietary comps trace back to the seat
-- that authorised them.

create table if not exists public.comp_import (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  license_id uuid references public.comp_license (id) on delete set null,
  vendor text not null,
  filename text,
  status text not null default 'pending',
  row_count int,
  storage_path text,
  imported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_import enable row level security;

create index ix_comp_import_account on public.comp_import (account_id);

revoke all on public.comp_import from authenticated, service_role;
grant select on public.comp_import to authenticated;
grant select, insert, update, delete on public.comp_import to service_role;

create trigger comp_import_timestamps
  before insert or update on public.comp_import
  for each row execute function public.set_timestamps();

create policy comp_import_read on public.comp_import
  for select to authenticated
  using (public.has_role_on_account(account_id));
