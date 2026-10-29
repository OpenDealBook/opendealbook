-- A send that timed out leaves its message unknown and the enrollment stuck on
-- that step. A deal manager settles it: mark_sent lets the next tick advance the
-- step, retry deletes the message so the next tick sends again, and stop fails
-- the enrollment. Only a queued enrollment is still waiting on the send. Definer
-- rights because only the sender may write messages.
create or replace function public.resolve_unknown_outreach_send(p_enrollment_id uuid, p_resolution text)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_enrollment public.outreach_enrollment;
begin
  select * into v_enrollment from public.outreach_enrollment where id = p_enrollment_id for update;

  if not public.has_permission((select auth.uid()), v_enrollment.account_id, 'deals.manage') then
    raise exception 'resolving an unknown send needs deals.manage' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status <> 'queued' then
    raise exception 'this enrollment is no longer waiting' using errcode = 'no_data_found';
  end if;

  perform from public.outreach_message
  where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step and status = 'unknown'
  for update;

  if not found then
    raise exception 'the current step has no unknown send' using errcode = 'no_data_found';
  end if;

  case p_resolution
    when 'mark_sent' then
      update public.outreach_message set status = 'sent'
      where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step;
      update public.outreach_enrollment set error = null where id = v_enrollment.id;
    when 'retry' then
      delete from public.outreach_message
      where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step;
      update public.outreach_enrollment set error = null where id = v_enrollment.id;
    when 'stop' then
      update public.outreach_enrollment
      set status = 'failed',
        error = format('Stopped by %s after an unknown send', (select a.name from public.accounts a where a.id = (select auth.uid())))
      where id = v_enrollment.id;
  end case;
end;
$$;

revoke all on function public.resolve_unknown_outreach_send(uuid, text) from public, anon;
grant execute on function public.resolve_unknown_outreach_send(uuid, text) to authenticated;
