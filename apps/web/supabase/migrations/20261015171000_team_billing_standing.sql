-- Compiled from supabase/schemas/99c-billing-lock.sql; edit that file, not this one.

create type public.billing_standing as enum ('good', 'past_due', 'locked');

create or replace function public.team_billing_standing(target_account_id uuid)
  returns public.billing_standing
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null and not public.has_role_on_account(target_account_id) then
    raise exception 'not a member of this account' using errcode = 'insufficient_privilege';
  end if;
  if tuckin.team_locked(target_account_id) then
    return 'locked';
  end if;
  if public.is_set('enable_team_account_billing')
    and exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status = 'past_due'
    )
    and not exists (
      select 1 from public.subscriptions
      where account_id = target_account_id and status in ('active', 'trialing')
    ) then
    return 'past_due';
  end if;
  return 'good';
end;
$$;

revoke all on function public.team_billing_standing(uuid) from public, anon;
grant execute on function public.team_billing_standing(uuid) to authenticated, service_role;
