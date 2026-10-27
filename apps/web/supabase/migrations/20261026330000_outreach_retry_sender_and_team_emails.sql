grant delete on public.outreach_message to service_role;

alter table public.outreach_message add column from_email text;

create or replace function public.stop_outreach_to(p_account_id uuid, p_email text, p_reason text)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.outreach_suppression (account_id, email, reason)
  select p_account_id, p_email, p_reason
  where not exists (
    select 1 from public.outreach_suppression
    where account_id = p_account_id and lower(email) = lower(p_email) and reason = p_reason
  );

  update public.outreach_enrollment
  set status = case p_reason
    when 'opt_out' then 'suppressed'
    when 'replied' then 'replied'
    when 'bounce' then 'bounced'
  end
  where account_id = p_account_id
    and lower(target_email) = lower(p_email)
    and status in ('queued', 'held', 'sent');
end;
$$;

create or replace function public.outreach_team_emails(p_account_id uuid)
  returns setof text
  language sql stable security definer
  set search_path = '' as $$
  select lower(u.email)
  from public.accounts_memberships m
  join auth.users u on u.id = m.user_id
  where m.account_id = p_account_id;
$$;

revoke all on function public.outreach_team_emails(uuid) from public, anon, authenticated;
grant execute on function public.outreach_team_emails(uuid) to service_role;
