-- Brings deals whose LOI was signed before exclusivity had its own milestone up
-- to it: the end is the LOI signed date plus the exclusivity days of the
-- accepted offer's current version. Appended as the system actor so the log
-- holds the history. A deal that already has the milestone keeps it, and one
-- whose offer names no exclusivity days is left unset. The caller's role is put
-- back afterwards.
create or replace function public.backfill_exclusivity_end()
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_role text;
begin
  v_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  for r in
    select m.deal_id, m.actual_on + v.exclusivity_days as target_on
    from public.deal_milestone m
    join public.offer o on o.deal_id = m.deal_id and o.status = 'accepted'
    join public.offer_version v on v.id = o.current_version_id
    where m.kind = 'loi_signed'
      and m.actual_on is not null
      and v.exclusivity_days is not null
      and not exists (
        select 1 from public.deal_milestone e where e.deal_id = m.deal_id and e.kind = 'exclusivity_end'
      )
  loop
    perform public.append_deal_event(
      r.deal_id, 'deal_milestone', gen_random_uuid(), 'deal_milestone.set',
      jsonb_build_object('kind', 'exclusivity_end', 'target_on', r.target_on, 'actual_on', null),
      null, 'system', 'migration'
    );
  end loop;

  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
end;
$$;

revoke all on function public.backfill_exclusivity_end() from public, anon, authenticated, service_role;

select public.backfill_exclusivity_end();
