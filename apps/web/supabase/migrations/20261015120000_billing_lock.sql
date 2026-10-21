-- Compiled from supabase/schemas/99c-billing-lock.sql; edit that file, not this one.

create or replace function public.is_account_locked(target_account_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select case
    when exists (select 1 from public.subscriptions where account_id = target_account_id)
      then not exists (
        select 1 from public.subscriptions
        where account_id = target_account_id and status <> 'canceled'
      )
    else not public.is_trial_active(target_account_id)
  end;
$$;

grant execute on function public.is_account_locked(uuid) to authenticated, service_role;
