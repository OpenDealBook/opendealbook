-- The input set for a Deal calc version, one row per version. inputs holds the
-- acquisition, P&L, SDE, and growth fields the Deal calculator consumes.
-- deal_box_id links the acquisition criteria this calc was framed against.
-- imported_from_version_id records the SDE calc version a Deal calc pulled its
-- earnings from, so later drift between the two stays visible. The unique
-- constraint on calc_version_id is the index for lookups by version.

create table if not exists public.deal_calc_input (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null unique references public.calc_version (id) on delete cascade,
  inputs jsonb not null default '{}'::jsonb,
  deal_box_id uuid references public.deal_box (id),
  imported_from_version_id uuid references public.calc_version (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_calc_input enable row level security;

revoke all on public.deal_calc_input from authenticated, service_role;
grant select, insert, update, delete on public.deal_calc_input to authenticated;
grant select, insert, update, delete on public.deal_calc_input to service_role;

create trigger deal_calc_input_timestamps
  before insert or update on public.deal_calc_input
  for each row execute function public.set_timestamps();

create trigger deal_calc_input_user_tracking
  before insert or update on public.deal_calc_input
  for each row execute function public.set_user_tracking();

create policy deal_calc_input_read on public.deal_calc_input
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_calc_input_insert on public.deal_calc_input
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_calc_input_update on public.deal_calc_input
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_calc_input_delete on public.deal_calc_input
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
