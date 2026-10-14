-- Data room folders. Each deal owns a folder tree; parent_id nests them and is
-- null at the root. Deal-scoped so external parties on the deal can browse it.
-- The read policy lives in 99a-lender-rooms.sql because it depends on
-- lender_can_read_folder.

create table if not exists public.dr_folder (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  parent_id uuid,
  name text not null,
  sort_order int,
  created_at timestamptz,
  updated_at timestamptz,
  unique (id, deal_id),
  -- A folder hangs only under a folder of its own deal.
  foreign key (parent_id, deal_id) references public.dr_folder (id, deal_id) on delete cascade
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

-- has_permission on an account the caller names proves nothing: everyone holds
-- every permission on their own personal account. This asks about the account
-- that owns the deal.
create or replace function public.manages_deal_in_account(deal_id uuid, account_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal d
    where d.id = manages_deal_in_account.deal_id
      and d.account_id = manages_deal_in_account.account_id
      and public.has_permission((select auth.uid()), d.account_id, 'deals.manage')
  );
$$;

grant execute on function public.manages_deal_in_account(uuid, uuid) to authenticated, service_role;

create policy dr_folder_insert on public.dr_folder
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy dr_folder_update on public.dr_folder
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy dr_folder_delete on public.dr_folder
  for delete to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));
