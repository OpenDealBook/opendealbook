-- The buyer's initial discovery record for a deal, captured at the sourcing
-- stage from a first call with the owner or broker. One row per deal. Buyer-
-- account-internal only: read is gated on buyer-account membership alone, never
-- on has_deal_permission, so a seller deal_participant can never see it. Field
-- length limits live in the app-layer Zod schema, not here. Sorts after
-- 22-deal.sql, whose deal table it references.

create type public.discovery_counterparty_type as enum ('owner', 'broker');

create type public.discovery_reason_for_selling as enum (
  'retirement',
  'burnout',
  'new_venture',
  'health',
  'partnership_dissolution',
  'financial',
  'other'
);

create type public.discovery_priority as enum (
  'price',
  'speed',
  'legacy',
  'employees',
  'brand',
  'reputation'
);

create type public.discovery_owner_dependency as enum ('low', 'medium', 'high');

create type public.discovery_revenue_trend as enum ('up', 'down', 'flat');

create type public.discovery_financing_stance as enum ('yes', 'no', 'unsure');

create table if not exists public.deal_discovery (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null unique references public.deal (id) on delete cascade,
  counterparty_type public.discovery_counterparty_type,
  call_date date,
  years_in_operation integer,
  reason_for_selling public.discovery_reason_for_selling,
  what_matters_most public.discovery_priority[],
  most_sensitive_issue text,
  owner_hours_per_week integer,
  owner_dependency public.discovery_owner_dependency,
  documented_processes boolean,
  main_lead_source text,
  differentiation text,
  employee_count integer,
  has_management_team boolean,
  revenue_trend public.discovery_revenue_trend,
  recurring_revenue_pct numeric,
  clean_books boolean,
  largest_customer_pct numeric,
  estimated_margin numeric,
  expansion_notes text,
  willing_to_train boolean,
  transition_months integer,
  gaps_if_owner_leaves text,
  target_sale_date date,
  firm_timeline boolean,
  open_to_seller_financing public.discovery_financing_stance,
  financing_notes text,
  discovery_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_discovery enable row level security;

revoke all on public.deal_discovery from authenticated, service_role;
grant select, insert, update, delete on public.deal_discovery to authenticated;
grant select, insert, update, delete on public.deal_discovery to service_role;

create trigger deal_discovery_timestamps
  before insert or update on public.deal_discovery
  for each row execute function public.set_timestamps();

create trigger deal_discovery_user_tracking
  before insert or update on public.deal_discovery
  for each row execute function public.set_user_tracking();

create policy deal_discovery_read on public.deal_discovery
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_discovery_insert on public.deal_discovery
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_discovery_update on public.deal_discovery
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_discovery_delete on public.deal_discovery
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
