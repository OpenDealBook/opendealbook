-- The adopted earnings figures for a deal: the single set of revenue/SDE/EBITDA
-- the account has committed to for this deal, sourced from a calc version. One
-- row per deal (1:1), written only by deal.financials_adopted through
-- project_deal_financials (65-deal-event-projectors.sql); authenticated and
-- service_role keep read only. source_calc_version_id references the calc version
-- these figures were adopted from. Its foreign key to calc_version is declared at
-- the end of 89-calc-version.sql, since schema files apply in filename order and
-- calc_version does not yet exist at this file.

create table if not exists public.deal_financials (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  adopted_revenue numeric,
  adopted_sde numeric,
  adopted_ebitda numeric,
  source_calc_version_id uuid,
  adopted_at timestamptz,
  adopted_by uuid references auth.users
);

alter table public.deal_financials enable row level security;

create index ix_deal_financials_account on public.deal_financials (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_financials from authenticated, service_role;
grant select on public.deal_financials to authenticated;
grant select on public.deal_financials to service_role;

create policy deal_financials_read on public.deal_financials
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy deal_financials_insert on public.deal_financials
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_financials_update on public.deal_financials
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_financials_delete on public.deal_financials
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
