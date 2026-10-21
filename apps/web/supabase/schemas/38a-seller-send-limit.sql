-- How many documents a team may send to sellers in a rolling 24 hours. A team
-- on trial (trial_ends_at set and in the future, and no active subscription)
-- gets 10, others 50; a super-admin may set a per-team
-- value here that replaces both, and 0 blocks sending. Written only through
-- the service role by the admin console.

create table if not exists public.seller_send_limit (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  daily_limit int not null check (daily_limit >= 0),
  updated_at timestamptz not null default now()
);

alter table public.seller_send_limit enable row level security;

revoke all on public.seller_send_limit from authenticated, service_role;
grant select, insert, update, delete on public.seller_send_limit to service_role;

-- The team's limit, the shares it created in the last 24 hours, and when the
-- next send frees up (null while under the limit, or when the limit is 0).
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

revoke all on function public.seller_send_allowance(uuid) from public, anon;
grant execute on function public.seller_send_allowance(uuid) to authenticated;
