alter table public.outreach_setting alter column max_touches set default 3;
update public.outreach_setting set max_touches = 3 where max_touches = 1;

alter table public.outreach_enrollment add column error text;

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
    and (status in ('queued', 'held') or (status = 'sent' and p_reason in ('replied', 'bounce')));
end;
$$;
