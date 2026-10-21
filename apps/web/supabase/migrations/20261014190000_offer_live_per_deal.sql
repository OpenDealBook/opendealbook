-- At most one live offer per deal: a rejected, withdrawn, or expired offer
-- frees the deal for a new one; an open or accepted offer holds it. Duplicate
-- live offers are expired through the event log first so the index can apply.
-- The function and the index are compiled from supabase/schemas/96-offer.sql;
-- edit that file, not this one. The cleanup call exists only in this migration.

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

select public.expire_superseded_live_offers();

create unique index ux_offer_live_per_deal on public.offer (deal_id)
  where status not in ('rejected', 'withdrawn', 'expired');
