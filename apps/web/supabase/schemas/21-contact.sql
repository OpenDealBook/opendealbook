-- Account-scoped contacts, optionally attached to a firm.

create table if not exists public.contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid references public.firm (id) on delete set null,
  name varchar(255) not null,
  email varchar(320),
  phone text,
  kind text not null default 'other',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.contact enable row level security;

create index ix_contact_account on public.contact (account_id);
create index ix_contact_firm on public.contact (firm_id);

revoke all on public.contact from authenticated, service_role;
grant select, insert, update, delete on public.contact to authenticated;
grant select, insert, update, delete on public.contact to service_role;

create trigger contact_timestamps
  before insert or update on public.contact
  for each row execute function public.set_timestamps();

create trigger contact_user_tracking
  before insert or update on public.contact
  for each row execute function public.set_user_tracking();

create policy contact_read on public.contact
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy contact_insert on public.contact
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contact_update on public.contact
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contact_delete on public.contact
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
