-- Analytics that read the deal_event log. They live after the event-store
-- files because their bodies reference public.deal_event, which is created in
-- 64-deal-event.sql; a security definer SQL function is validated against the
-- catalogue at creation time, so it must be declared after that table exists.
-- Stage moves are recorded as deal.stage_changed events; the entered stage is
-- payload->>'stage'.

create or replace function public.analytics_deals_added_lost_by_month(p_account_id uuid)
  returns table (month date, added bigint, lost bigint)
  language sql security definer
  set search_path = '' as $$
  with added as (
    select date_trunc('month', d.created_at)::date as m, count(*) as c
    from public.deal d
    where d.account_id = p_account_id
      and public.has_role_on_account(p_account_id)
    group by 1
  ),
  lost as (
    select date_trunc('month', de.created_at)::date as m, count(*) as c
    from public.deal_event de
    where de.account_id = p_account_id
      and de.event_type = 'deal.stage_changed'
      and de.payload ->> 'stage' = 'closed_lost'
      and public.has_role_on_account(p_account_id)
    group by 1
  )
  select coalesce(added.m, lost.m), coalesce(added.c, 0), coalesce(lost.c, 0)
  from added
  full outer join lost on added.m = lost.m
  order by 1;
$$;

-- Median days a deal spent in each stage, measured between consecutive
-- deal.stage_changed events. The stage entered is payload->>'stage'; its dwell
-- time ends at the next move, so a deal still in its current stage is not yet
-- counted.
create or replace function public.analytics_median_days_in_stage(p_account_id uuid)
  returns table (stage text, median_days numeric)
  language sql security definer
  set search_path = '' as $$
  with moves as (
    select de.deal_id,
      de.payload ->> 'stage' as stage,
      de.created_at,
      lead(de.created_at) over (partition by de.deal_id order by de.created_at) as next_at
    from public.deal_event de
    where de.account_id = p_account_id
      and de.event_type = 'deal.stage_changed'
      and public.has_role_on_account(p_account_id)
  )
  select stage,
    percentile_cont(0.5) within group (order by extract(epoch from (next_at - created_at)) / 86400)
  from moves
  where next_at is not null
  group by stage;
$$;

grant execute on function public.analytics_deals_added_lost_by_month(uuid) to authenticated, service_role;
grant execute on function public.analytics_median_days_in_stage(uuid) to authenticated, service_role;
