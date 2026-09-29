-- A tenant's vendor-seat license (DealStats, BIZCOMPS, PeerComps). An active
-- license is what the comp read policy joins to before it will expose that
-- tenant's proprietary rows; an expired or revoked license closes that door
-- without touching the rows. storage_path points at the raw vendor export kept
-- encrypted behind the same proprietary predicate.

create table if not exists public.comp_license (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  vendor text not null,
  status public.comp_license_status not null default 'active',
  contributor_member boolean not null default false,
  seats int,
  starts_at timestamptz,
  expires_at timestamptz,
  storage_path text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_license enable row level security;

create index ix_comp_license_account on public.comp_license (account_id, status);

revoke all on public.comp_license from authenticated, service_role;
grant select on public.comp_license to authenticated;
grant select, insert, update, delete on public.comp_license to service_role;

create trigger comp_license_timestamps
  before insert or update on public.comp_license
  for each row execute function public.set_timestamps();

create policy comp_license_read on public.comp_license
  for select to authenticated
  using (public.has_role_on_account(account_id));
