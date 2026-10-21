-- An offer on a deal: the head of the offer lifecycle saga. Status is folded
-- from the offer.* events in the deal_event log; current_version_id points at
-- the latest offer_version. Many offers per deal, at most one live: once an
-- offer is rejected, withdrawn, or expired a new one may be drafted, while an
-- open or accepted offer holds ux_offer_live_per_deal. Deal-scoped; managed with
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
create unique index ux_offer_live_per_deal on public.offer (deal_id)
  where status not in ('rejected', 'withdrawn', 'expired');
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

-- One-time cleanup the live-offer migration runs before creating
-- ux_offer_live_per_deal: per deal, every live offer but one is expired through
-- the event log, so the projection and the log stay in step. The one kept is
-- the accepted offer when there is one, otherwise the most recently drafted.
create or replace function public.expire_superseded_live_offers()
  returns void
  language plpgsql set search_path = '' as $$
declare
  superseded record;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  for superseded in
    select ranked.deal_id, ranked.id
    from (
      select o.deal_id, o.id,
        row_number() over (
          partition by o.deal_id
          order by o.status = 'accepted' desc, drafted.deal_seq desc
        ) as kept_rank
      from public.offer o
      join public.deal_event drafted
        on drafted.aggregate_type = 'offer'
        and drafted.aggregate_id = o.id
        and drafted.event_type = 'offer.drafted'
      where o.status not in ('rejected', 'withdrawn', 'expired')
    ) ranked
    where ranked.kept_rank > 1
  loop
    perform public.append_deal_event(superseded.deal_id, 'offer', superseded.id,
      'offer.expired', '{}'::jsonb, null, 'system', 'migration');
  end loop;
end;
$$;

revoke all on function public.expire_superseded_live_offers() from public, anon, authenticated, service_role;
