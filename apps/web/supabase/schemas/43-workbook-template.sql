-- Installable workflow definitions. A platform template (account_id null) ships
-- with the product and is readable by every authenticated user; a tenant
-- template belongs to one account. scope and account_id are kept in lockstep.

create table if not exists public.workbook_template (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'tenant')),
  account_id uuid references public.accounts (id) on delete cascade,
  name text not null,
  workflow_type text not null,
  config_schema jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz,
  constraint workbook_template_scope_account check (
    (scope = 'platform' and account_id is null)
    or (scope = 'tenant' and account_id is not null)
  )
);

alter table public.workbook_template enable row level security;

create index ix_workbook_template_account on public.workbook_template (account_id);

revoke all on public.workbook_template from authenticated, service_role;
grant select, insert, update, delete on public.workbook_template to authenticated;
grant select, insert, update, delete on public.workbook_template to service_role;

create trigger workbook_template_timestamps
  before insert or update on public.workbook_template
  for each row execute function public.set_timestamps();

-- Platform templates are global reference data; tenant templates are account
-- scoped. Mutations always require a concrete account grant, so platform
-- templates are writable only by the service role.
create policy workbook_template_read on public.workbook_template
  for select to authenticated
  using (account_id is null or public.has_role_on_account(account_id));

create policy workbook_template_insert on public.workbook_template
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_template_update on public.workbook_template
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy workbook_template_delete on public.workbook_template
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
