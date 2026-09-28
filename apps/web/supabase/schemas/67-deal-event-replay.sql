-- Authoritative whole-deal rebuild. replay_deal deletes the deal's child
-- projection rows and re-applies every event in deal_seq order through the same
-- projectors the live append uses, so projections equal fold(events). It runs
-- under the odb.replay GUC, which the deal-domain side-effect triggers honour by
-- early-returning, so a rebuild emits no notifications. The deal and deal_box
-- parents are upserted by their own events rather than deleted, so foreign keys
-- and account-shared rows are preserved. Rebuild is idempotent.

create or replace function public.replay_deal(p_deal_id uuid)
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_event public.deal_event;
begin
  perform set_config('odb.replay', 'on', true);

  delete from public.meeting_action_item where deal_id = p_deal_id;
  delete from public.dr_document where deal_id = p_deal_id;
  delete from public.meeting where deal_id = p_deal_id;
  delete from public.approval where deal_id = p_deal_id;
  delete from public.deal_participant where deal_id = p_deal_id;
  delete from public.checklist_item where deal_id = p_deal_id;

  for v_event in
    select * from public.deal_event de where de.deal_id = p_deal_id order by de.deal_seq
  loop
    perform public.project_deal_event(v_event);
  end loop;

  perform set_config('odb.replay', 'off', true);
end;
$$;

grant execute on function public.replay_deal(uuid) to service_role;
