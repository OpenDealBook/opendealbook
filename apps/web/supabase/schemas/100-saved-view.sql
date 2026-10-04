-- Account-scoped saved views for the deals list: a named bundle of filters,
-- sort, and visible columns. Views belong to the account and are visible to
-- every member; owner_user_id records who created the view, stamped on insert.

create table if not exists public.saved_view (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  owner_user_id uuid references auth.users default auth.uid(),
  name text not null,
  filters jsonb not null default '{}',
  sort jsonb,
  visible_columns jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.saved_view enable row level security;

create index ix_saved_view_account on public.saved_view (account_id);

revoke all on public.saved_view from authenticated, service_role;
grant select, insert, update, delete on public.saved_view to authenticated;
grant select, insert, update, delete on public.saved_view to service_role;

create trigger saved_view_timestamps
  before insert or update on public.saved_view
  for each row execute function public.set_timestamps();

create trigger saved_view_user_tracking
  before insert or update on public.saved_view
  for each row execute function public.set_user_tracking();

create policy saved_view_read on public.saved_view
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy saved_view_insert on public.saved_view
  for insert to authenticated
  with check (public.has_role_on_account(account_id));

create policy saved_view_update on public.saved_view
  for update to authenticated
  using (public.has_role_on_account(account_id))
  with check (public.has_role_on_account(account_id));

create policy saved_view_delete on public.saved_view
  for delete to authenticated
  using (public.has_role_on_account(account_id));
