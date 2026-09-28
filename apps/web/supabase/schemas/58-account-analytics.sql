-- Account-scoped analytics for the dashboard charts. Each function is the
-- access path (there are no materialized views with their own RLS); every one
-- runs security definer and gates on has_role_on_account(p_account_id), so a
-- caller who is not a member of the account gets an empty result. Revenue is
-- sensitive: functions that expose it take p_include_revenue, and the caller
-- passes true only for roles allowed to see revenue (owner/admin); when false
-- the revenue column is zeroed. asking_price is the pipeline revenue figure.

create or replace function public.analytics_pipeline_by_stage(p_account_id uuid, p_include_revenue boolean default false)
  returns table (stage text, label text, deal_count bigint, total_revenue numeric)
  language sql security definer
  set search_path = '' as $$
  select ps.key, ps.label, count(d.id),
    case when p_include_revenue then coalesce(sum(d.asking_price), 0) else 0 end
  from public.pipeline_stage ps
  left join public.deal d on d.account_id = ps.account_id and d.stage = ps.key
  where ps.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by ps.key, ps.label, ps.sort_order
  order by ps.sort_order;
$$;

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
    select date_trunc('month', ae.created_at)::date as m, count(*) as c
    from public.audit_event ae
    where ae.account_id = p_account_id
      and ae.event_type = 'stage_move'
      and ae.payload ->> 'to' = 'closed_lost'
      and public.has_role_on_account(p_account_id)
    group by 1
  )
  select coalesce(added.m, lost.m), coalesce(added.c, 0), coalesce(lost.c, 0)
  from added
  full outer join lost on added.m = lost.m
  order by 1;
$$;

-- Median days a deal spent in each stage, measured between consecutive
-- stage_move events. The stage entered is payload->>'to'; its dwell time ends
-- at the next move, so a deal still in its current stage is not yet counted.
create or replace function public.analytics_median_days_in_stage(p_account_id uuid)
  returns table (stage text, median_days numeric)
  language sql security definer
  set search_path = '' as $$
  with moves as (
    select ae.deal_id,
      ae.payload ->> 'to' as stage,
      ae.created_at,
      lead(ae.created_at) over (partition by ae.deal_id order by ae.created_at) as next_at
    from public.audit_event ae
    where ae.account_id = p_account_id
      and ae.event_type = 'stage_move'
      and public.has_role_on_account(p_account_id)
  )
  select stage,
    percentile_cont(0.5) within group (order by extract(epoch from (next_at - created_at)) / 86400)
  from moves
  where next_at is not null
  group by stage;
$$;

create or replace function public.analytics_checklist_status_by_deal(p_account_id uuid)
  returns table (deal_id uuid, status public.checklist_status, item_count bigint)
  language sql security definer
  set search_path = '' as $$
  select ci.deal_id, ci.status, count(*)
  from public.checklist_item ci
  where ci.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by ci.deal_id, ci.status;
$$;

-- Median days from a checklist item being requested to being received.
create or replace function public.analytics_requested_to_received_median(p_account_id uuid)
  returns numeric
  language sql security definer
  set search_path = '' as $$
  select percentile_cont(0.5) within group (
    order by extract(epoch from (ci.received_at - ci.requested_at)) / 86400
  )
  from public.checklist_item ci
  where ci.account_id = p_account_id
    and ci.requested_at is not null
    and ci.received_at is not null
    and public.has_role_on_account(p_account_id);
$$;

create or replace function public.analytics_contract_turns_per_deal(p_account_id uuid)
  returns table (deal_id uuid, turns bigint)
  language sql security definer
  set search_path = '' as $$
  select c.deal_id, count(cv.id)
  from public.contract c
  join public.contract_version cv on cv.contract_id = c.id
  where c.account_id = p_account_id
    and public.has_role_on_account(p_account_id)
  group by c.deal_id;
$$;

create or replace function public.analytics_meetings_held_vs_skipped(p_account_id uuid)
  returns table (held bigint, skipped bigint)
  language sql security definer
  set search_path = '' as $$
  select
    count(*) filter (where m.status = 'held'),
    count(*) filter (where m.status = 'skipped')
  from public.meeting m
  where m.account_id = p_account_id
  having public.has_role_on_account(p_account_id);
$$;

create or replace function public.analytics_open_action_items_by_owner(p_account_id uuid)
  returns table (owner_user_id uuid, owner_is_seller boolean, open_count bigint)
  language sql security definer
  set search_path = '' as $$
  select ai.owner_user_id, ai.owner_is_seller, count(*)
  from public.meeting_action_item ai
  where ai.account_id = p_account_id
    and ai.status <> 'reviewed'
    and public.has_role_on_account(p_account_id)
  group by ai.owner_user_id, ai.owner_is_seller;
$$;

create or replace function public.analytics_broker_deal_flow_by_quarter(p_account_id uuid, p_include_revenue boolean default false)
  returns table (quarter date, broker_contact_id uuid, deal_count bigint, total_revenue numeric)
  language sql security definer
  set search_path = '' as $$
  select date_trunc('quarter', d.created_at)::date, d.broker_contact_id, count(*),
    case when p_include_revenue then coalesce(sum(d.asking_price), 0) else 0 end
  from public.deal d
  where d.account_id = p_account_id
    and d.broker_contact_id is not null
    and public.has_role_on_account(p_account_id)
  group by 1, d.broker_contact_id
  order by 1;
$$;

grant execute on function public.analytics_pipeline_by_stage(uuid, boolean) to authenticated, service_role;
grant execute on function public.analytics_deals_added_lost_by_month(uuid) to authenticated, service_role;
grant execute on function public.analytics_median_days_in_stage(uuid) to authenticated, service_role;
grant execute on function public.analytics_checklist_status_by_deal(uuid) to authenticated, service_role;
grant execute on function public.analytics_requested_to_received_median(uuid) to authenticated, service_role;
grant execute on function public.analytics_contract_turns_per_deal(uuid) to authenticated, service_role;
grant execute on function public.analytics_meetings_held_vs_skipped(uuid) to authenticated, service_role;
grant execute on function public.analytics_open_action_items_by_owner(uuid) to authenticated, service_role;
grant execute on function public.analytics_broker_deal_flow_by_quarter(uuid, boolean) to authenticated, service_role;
