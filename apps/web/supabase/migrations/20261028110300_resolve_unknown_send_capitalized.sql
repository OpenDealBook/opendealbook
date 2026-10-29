-- The two refusals a manager can see when an unknown send is already settled
-- read as sentences.
create or replace function public.resolve_unknown_outreach_send(p_enrollment_id uuid, p_resolution text)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_enrollment public.outreach_enrollment;
begin
  select * into v_enrollment from public.outreach_enrollment where id = p_enrollment_id for update;

  if not found or not public.has_role_on_account(v_enrollment.account_id) then
    raise exception 'This enrollment was not found' using errcode = 'no_data_found';
  end if;

  if not public.has_permission((select auth.uid()), v_enrollment.account_id, 'deals.manage') then
    raise exception 'resolving an unknown send needs deals.manage' using errcode = 'insufficient_privilege';
  end if;

  if v_enrollment.status not in ('queued', 'held') then
    raise exception 'This enrollment is no longer waiting' using errcode = 'no_data_found';
  end if;

  perform from public.outreach_message
  where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step and status = 'unknown'
  for update;

  if not found then
    raise exception 'The current step has no unknown send' using errcode = 'no_data_found';
  end if;

  case p_resolution
    when 'mark_sent' then
      update public.outreach_message set status = 'sent', sent_at = now()
      where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step and status = 'unknown';
      update public.outreach_enrollment set error = null where id = v_enrollment.id;
    when 'retry' then
      update public.outreach_message set status = 'retried'
      where enrollment_id = v_enrollment.id and step_id = v_enrollment.current_step and status = 'unknown';
      update public.outreach_enrollment set error = null where id = v_enrollment.id;
    when 'stop' then
      update public.outreach_enrollment
      set status = 'failed',
        error = format(
          'Stopped by %s after an unknown send',
          coalesce(
            (select nullif(btrim(a.name), '') from public.accounts a where a.id = (select auth.uid())),
            'a teammate'
          )
        )
      where id = v_enrollment.id;
  end case;
end;
$$;

revoke all on function public.resolve_unknown_outreach_send(uuid, text) from public, anon;
grant execute on function public.resolve_unknown_outreach_send(uuid, text) to authenticated;
