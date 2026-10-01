-- An offer on a deal: the head of the offer lifecycle saga. Status is folded
-- from the offer.* events in the deal_event log; current_version_id points at
-- the latest offer_version. Many offers per deal. Deal-scoped; managed with
-- deals.manage. Written only through append_deal_event; project_offer
-- (65-deal-event-projectors.sql) runs security definer as the table owner, so
-- authenticated and service_role keep read only. current_version_id is a plain
-- uuid pointer to offer_version (no FK), mirroring contract.current_version.

create table if not exists public.offer (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  status text not null check (status in ('draft', 'submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired')),
  current_version_id uuid,
  submitted_at timestamptz,
  responded_at timestamptz
);

alter table public.offer enable row level security;

create index ix_offer_deal on public.offer (deal_id);
create index ix_offer_account on public.offer (account_id);

-- Writes go through append_deal_event; the projector runs security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.offer from authenticated, service_role;
grant select on public.offer to authenticated;
grant select on public.offer to service_role;

create policy offer_read on public.offer
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy offer_insert on public.offer
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_update on public.offer
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy offer_delete on public.offer
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
