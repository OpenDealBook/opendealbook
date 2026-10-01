-- The buyer's internal thesis for a deal, one row per deal. Broker- and
-- internal-facing narrative only; it never appears in the LOI. Field length
-- limits live in the app-layer Zod schema, not here. The unique constraint on
-- deal_id is the index for lookups by deal.

create table if not exists public.deal_thesis (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null unique references public.deal (id) on delete cascade,
  why_this_business text,
  main_concerns text,
  post_acquisition_plan text,
  owner_involvement text,
  additional_info text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_thesis enable row level security;

revoke all on public.deal_thesis from authenticated, service_role;
grant select, insert, update, delete on public.deal_thesis to authenticated;
grant select, insert, update, delete on public.deal_thesis to service_role;

create trigger deal_thesis_timestamps
  before insert or update on public.deal_thesis
  for each row execute function public.set_timestamps();

create trigger deal_thesis_user_tracking
  before insert or update on public.deal_thesis
  for each row execute function public.set_user_tracking();

create policy deal_thesis_read on public.deal_thesis
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_thesis_insert on public.deal_thesis
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_thesis_update on public.deal_thesis
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_thesis_delete on public.deal_thesis
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
