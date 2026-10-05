-- A buyer-recorded month of post-close operating actuals for a deal. A
-- won/closed deal is the operating business, so this attaches directly to the
-- deal rather than a separate business entity. One row per (deal_id,
-- period_month); a month records only what is known, so every figure is
-- nullable. Buyer-account-internal only: read is gated on buyer-account
-- membership alone, never on has_deal_permission, so a seller deal_participant
-- can never see it. Sorts after 22-deal.sql and 86-deal-financials.sql, whose
-- patterns it mirrors.

create table if not exists public.deal_operating_period (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  period_month date not null,
  revenue numeric,
  cogs numeric,
  opex numeric,
  cash_balance numeric,
  headcount integer,
  debt_service numeric,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, period_month)
);

alter table public.deal_operating_period enable row level security;

revoke all on public.deal_operating_period from authenticated, service_role;
grant select, insert, update, delete on public.deal_operating_period to authenticated;
grant select, insert, update, delete on public.deal_operating_period to service_role;

create trigger deal_operating_period_timestamps
  before insert or update on public.deal_operating_period
  for each row execute function public.set_timestamps();

create trigger deal_operating_period_user_tracking
  before insert or update on public.deal_operating_period
  for each row execute function public.set_user_tracking();

create policy deal_operating_period_read on public.deal_operating_period
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_operating_period_insert on public.deal_operating_period
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_operating_period_update on public.deal_operating_period
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_operating_period_delete on public.deal_operating_period
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
