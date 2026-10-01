-- One line item within an SDE period. line_code identifies a row from the fixed
-- SDE catalog; custom_label names a row the user added outside the catalog.

create table if not exists public.sde_line (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  period_id uuid not null references public.sde_period (id) on delete cascade,
  line_code text,
  custom_label text,
  amount numeric,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.sde_line enable row level security;

create index ix_sde_line_period on public.sde_line (period_id);

revoke all on public.sde_line from authenticated, service_role;
grant select, insert, update, delete on public.sde_line to authenticated;
grant select, insert, update, delete on public.sde_line to service_role;

create trigger sde_line_timestamps
  before insert or update on public.sde_line
  for each row execute function public.set_timestamps();

create trigger sde_line_user_tracking
  before insert or update on public.sde_line
  for each row execute function public.set_user_tracking();

create policy sde_line_read on public.sde_line
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy sde_line_insert on public.sde_line
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_line_update on public.sde_line
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy sde_line_delete on public.sde_line
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
