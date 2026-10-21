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
  delete from public.deal_milestone where deal_id = p_deal_id;

  for v_event in
    select * from public.deal_event de where de.deal_id = p_deal_id order by de.deal_seq
  loop
    perform public.project_deal_event(v_event);
  end loop;

  perform set_config('odb.replay', 'off', true);
end;
$$;
