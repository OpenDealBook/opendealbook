-- Seller send limit: a team is on trial when trial_ends_at is set and in the
-- future and it has no active subscription.
-- Compiled from supabase/schemas/38a-seller-send-limit.sql; edit that file, not this one.

create or replace function public.seller_send_allowance(p_account_id uuid)
  returns table (daily_limit int, sent int, retry_after timestamptz)
  language plpgsql stable security definer
  set search_path = '' as $$
declare
  team_limit int;
  recent_count int;
begin
  if not public.has_permission(auth.uid(), p_account_id, 'deals.manage') then
    raise exception 'not allowed to send to sellers for this account'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(
    (select l.daily_limit from public.seller_send_limit l where l.account_id = p_account_id),
    case
      when exists (
        select 1 from public.accounts a
        where a.id = p_account_id
          and a.trial_ends_at > now()
          and not exists (
            select 1 from public.subscriptions sub
            where sub.account_id = a.id and sub.active
          )
      ) then 10
      else 50
    end
  ) into team_limit;

  select count(*)::int into recent_count
  from public.document_share s
  where s.account_id = p_account_id
    and s.created_at > now() - interval '24 hours';

  return query
  select team_limit,
         recent_count,
         case
           when team_limit = 0 or recent_count < team_limit then null
           else (
             select s.created_at + interval '24 hours'
             from public.document_share s
             where s.account_id = p_account_id
               and s.created_at > now() - interval '24 hours'
             order by s.created_at
             offset recent_count - team_limit
             limit 1
           )
         end;
end;
$$;
