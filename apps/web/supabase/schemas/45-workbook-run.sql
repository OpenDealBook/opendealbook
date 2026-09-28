-- One execution of a workbook. Rows are produced by the background runner
-- (service role); account members read them but never write them directly.

create table if not exists public.workbook_run (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.workbook (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_total int,
  items_done int,
  exceptions jsonb,
  status text,
  created_at timestamptz not null default now()
);

alter table public.workbook_run enable row level security;

create index ix_workbook_run_account on public.workbook_run (account_id);
create index ix_workbook_run_workbook on public.workbook_run (workbook_id);

revoke all on public.workbook_run from authenticated, service_role;
grant select on public.workbook_run to authenticated;
grant select, insert, update, delete on public.workbook_run to service_role;

create policy workbook_run_read on public.workbook_run
  for select to authenticated
  using (public.has_role_on_account(account_id));
