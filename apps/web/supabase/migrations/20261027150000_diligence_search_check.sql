alter type public.diligence_source add value if not exists 'reviews';

create table if not exists public.diligence_search_check (
  run_id uuid not null references public.diligence_run (id) on delete cascade,
  source public.diligence_source not null,
  subject_key text not null,
  primary key (run_id, source, subject_key)
);

alter table public.diligence_search_check enable row level security;

revoke all on public.diligence_search_check from anon, authenticated, service_role;
grant select, insert on public.diligence_search_check to service_role;
