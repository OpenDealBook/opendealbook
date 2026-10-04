-- The buyer's business risk-marker assessment for a deal, captured around due
-- diligence. One row per (deal_id, question_key); an absent row means that
-- question is unassessed. question_key references a static catalog defined in
-- the app layer, so this table stays thin. Buyer-account-internal only: read is
-- gated on buyer-account membership alone, never on has_deal_permission, so a
-- seller deal_participant can never see it. Sorts after 22-deal.sql and
-- 27-deal-discovery.sql, whose patterns it mirrors.

create type public.value_marker_rating as enum (
  'looks_good',
  'somewhat_risky',
  'not_good'
);

create type public.value_marker_category as enum (
  'financial_viability',
  'diversification',
  'employee_risk',
  'cashflow_quality',
  'competitive_advantage',
  'customer_satisfaction',
  'recurring_revenue',
  'owner_dependency',
  'upside_potential',
  'process_maturity'
);

create table if not exists public.deal_value_marker (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  category public.value_marker_category not null,
  question_key text not null,
  rating public.value_marker_rating,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, question_key)
);

alter table public.deal_value_marker enable row level security;

revoke all on public.deal_value_marker from authenticated, service_role;
grant select, insert, update, delete on public.deal_value_marker to authenticated;
grant select, insert, update, delete on public.deal_value_marker to service_role;

create trigger deal_value_marker_timestamps
  before insert or update on public.deal_value_marker
  for each row execute function public.set_timestamps();

create trigger deal_value_marker_user_tracking
  before insert or update on public.deal_value_marker
  for each row execute function public.set_user_tracking();

create policy deal_value_marker_read on public.deal_value_marker
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_value_marker_insert on public.deal_value_marker
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_value_marker_update on public.deal_value_marker
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_value_marker_delete on public.deal_value_marker
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
