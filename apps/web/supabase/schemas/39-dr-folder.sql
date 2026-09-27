-- Data room folders. Each deal owns a folder tree; parent_id nests them and is
-- null at the root. Deal-scoped so external parties on the deal can browse it.

create table if not exists public.dr_folder (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  parent_id uuid references public.dr_folder (id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.dr_folder enable row level security;

create index ix_dr_folder_deal on public.dr_folder (deal_id);
create index ix_dr_folder_parent on public.dr_folder (parent_id);

revoke all on public.dr_folder from authenticated, service_role;
grant select, insert, update, delete on public.dr_folder to authenticated;
grant select, insert, update, delete on public.dr_folder to service_role;

create trigger dr_folder_timestamps
  before insert or update on public.dr_folder
  for each row execute function public.set_timestamps();

create policy dr_folder_read on public.dr_folder
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy dr_folder_insert on public.dr_folder
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_folder_update on public.dr_folder
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_folder_delete on public.dr_folder
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
