-- An employee assessed during the HR audit (Stage 5). Captures compensation,
-- tenure, and the retention risk flags that matter for the deal. Deal-scoped;
-- managed with deals.manage.

create table if not exists public.employee (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  role text,
  comp numeric,
  tenure_years numeric,
  credentials text,
  non_compete boolean not null default false,
  non_solicit boolean not null default false,
  key_person boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.employee enable row level security;

create index ix_employee_deal on public.employee (deal_id);
create index ix_employee_account on public.employee (account_id);

revoke all on public.employee from authenticated, service_role;
grant select, insert, update, delete on public.employee to authenticated;
grant select, insert, update, delete on public.employee to service_role;

create trigger employee_timestamps
  before insert or update on public.employee
  for each row execute function public.set_timestamps();

create trigger employee_user_tracking
  before insert or update on public.employee
  for each row execute function public.set_user_tracking();

create policy employee_read on public.employee
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy employee_insert on public.employee
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy employee_update on public.employee
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy employee_delete on public.employee
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
