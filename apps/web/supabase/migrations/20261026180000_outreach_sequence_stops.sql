alter table public.outreach_enrollment drop constraint outreach_enrollment_status_check;
alter table public.outreach_enrollment add constraint outreach_enrollment_status_check
  check (status in ('queued', 'held', 'sent', 'replied', 'bounced', 'stopped', 'suppressed', 'failed'));

alter table public.outreach_enrollment
  add column unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex');

alter table public.outreach_message add column provider_thread_id text;
grant update (provider_thread_id) on public.outreach_message to service_role;

create or replace function public.stop_outreach_to(p_account_id uuid, p_email text, p_reason text)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.outreach_suppression (account_id, email, reason)
  select p_account_id, p_email, p_reason
  where not exists (
    select 1 from public.outreach_suppression
    where account_id = p_account_id and email = p_email and reason = p_reason
  );

  update public.outreach_enrollment
  set status = case p_reason
    when 'opt_out' then 'suppressed'
    when 'replied' then 'replied'
    when 'bounce' then 'bounced'
  end
  where account_id = p_account_id
    and lower(target_email) = lower(p_email)
    and status in ('queued', 'held');
end;
$$;

revoke all on function public.stop_outreach_to(uuid, text, text) from public, anon, authenticated;
grant execute on function public.stop_outreach_to(uuid, text, text) to service_role;

create or replace function public.unsubscribe_outreach(p_token text)
  returns boolean
  language plpgsql security definer
  set search_path = '' as $$
declare
  target public.outreach_enrollment;
begin
  select * into target from public.outreach_enrollment where unsubscribe_token = p_token;
  if not found then
    return false;
  end if;
  perform public.stop_outreach_to(target.account_id, target.target_email, 'opt_out');
  return true;
end;
$$;

revoke all on function public.unsubscribe_outreach(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_outreach(text) to service_role;
