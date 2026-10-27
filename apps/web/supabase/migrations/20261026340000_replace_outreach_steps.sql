create or replace function public.replace_outreach_steps(p_account_id uuid, p_sequence_id uuid, p_steps jsonb)
  returns void
  language plpgsql security invoker
  set search_path = '' as $$
begin
  delete from public.outreach_step where sequence_id = p_sequence_id;

  insert into public.outreach_step (account_id, sequence_id, ordinal, delay_days, channel, subject, body)
  select p_account_id, p_sequence_id, step.ordinal, step.delay_days, step.channel, step.subject, step.body
  from jsonb_to_recordset(p_steps)
    as step(ordinal int, delay_days int, channel public.outreach_channel, subject text, body text);
end;
$$;

revoke all on function public.replace_outreach_steps(uuid, uuid, jsonb) from public, anon;
grant execute on function public.replace_outreach_steps(uuid, uuid, jsonb) to authenticated;
