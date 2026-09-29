-- Platform-managed benchmark multiples per vertical. Readable by every tenant;
-- written only by the platform through the service role, so authenticated has no
-- write grant. Rows carry a citation and an as-of date; survey rows exist only
-- where a citation backs them.

create table if not exists public.benchmark (
  id uuid primary key default gen_random_uuid(),
  naics_code text,
  industry text,
  metric text not null,
  low numeric,
  median numeric,
  high numeric,
  source_citation text,
  as_of date,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.benchmark enable row level security;

create index ix_benchmark_naics on public.benchmark (naics_code);

revoke all on public.benchmark from authenticated, service_role;
grant select on public.benchmark to authenticated;
grant select, insert, update, delete on public.benchmark to service_role;

create trigger benchmark_timestamps
  before insert or update on public.benchmark
  for each row execute function public.set_timestamps();

create policy benchmark_read on public.benchmark
  for select to authenticated
  using (true);
