-- An account's installed workbook: a template plus the account's own config and
-- run scheduling. Account-scoped; managed with deals.manage.

create table if not exists public.workbook (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workbook_template (id),
  account_id uuid not null references public.accounts (id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  status text,
  next_run_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.workbook enable row level security;

create index ix_workbook_account on public.workbook (account_id);
create index ix_workbook_template on public.workbook (template_id);

revoke all on public.workbook from authenticated, service_role;
grant select, insert, update, delete on public.workbook to authenticated;
grant select, insert, update, delete on public.workbook to service_role;

create trigger workbook_timestamps
  before insert or update on public.workbook
  for each row execute function public.set_timestamps();

create policy workbook_read on public.workbook
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workbook_insert on public.workbook
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_update on public.workbook
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_delete on public.workbook
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
