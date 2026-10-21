-- Compiled from supabase/schemas/64-deal-event.sql, 99k-deal-timeline.sql,
-- 99r2-relay-cursor.sql and 99s-workflows.sql.

-- The transaction that appended each event. global_seq is handed out before
-- commit, so a lower one can become visible after a higher one; a relay reads
-- in (xid, global_seq) order and only events of finished transactions, so it
-- never steps past one that is still to come.
alter table public.deal_event add column xid xid8 not null default pg_current_xact_id();
alter table public.account_event add column xid xid8 not null default pg_current_xact_id();

create index ix_deal_event_xid on public.deal_event (xid, global_seq);
create index ix_account_event_xid on public.account_event (xid, global_seq);

alter table public.relay_cursor add column last_xid xid8;

create or replace function public.trigger_event_horizon()
  returns text
  language sql stable
  set search_path = '' as $$
  select pg_snapshot_xmin(pg_current_snapshot())::text;
$$;

revoke all on function public.trigger_event_horizon() from public, anon, authenticated;
grant execute on function public.trigger_event_horizon() to service_role;

create or replace function public.settled_trigger_events(
  p_log text,
  p_after_xid xid8,
  p_after_seq bigint,
  p_event_types text[],
  p_limit int
) returns table (xid text, global_seq bigint, account_id uuid, deal_id uuid, event_type text, payload jsonb)
  language sql stable security definer
  set search_path = '' as $$
  select e.xid::text, e.global_seq, e.account_id, e.deal_id, e.event_type, e.payload
  from (
    select d.xid, d.global_seq, d.account_id, d.deal_id, d.event_type, d.payload
    from public.deal_event d
    where p_log = 'deal'
    union all
    select a.xid, a.global_seq, a.account_id, null, a.event_type, a.payload
    from public.account_event a
    where p_log = 'account'
  ) e
  where (e.xid, e.global_seq) > (p_after_xid, p_after_seq)
    and e.xid < pg_snapshot_xmin(pg_current_snapshot())
    and e.event_type = any (p_event_types)
  order by e.xid, e.global_seq
  limit p_limit;
$$;

revoke all on function public.settled_trigger_events(text, xid8, bigint, text[], int) from public, anon, authenticated;
grant execute on function public.settled_trigger_events(text, xid8, bigint, text[], int) to service_role;

-- The signing is appended under the deal's lock with the same sequence and
-- snapshot rules as append_deal_event, which cannot be called here because
-- the person saving the date is not the service.
create or replace function tuckin.record_loi_signed()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal_seq bigint;
  v_agg_seq bigint;
begin
  if current_setting('odb.replay', true) = 'on' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.deal_id::text));

  if exists (
    select 1 from public.deal_event
    where deal_id = new.deal_id and event_type = 'deal.loi_signed'
  ) then
    return null;
  end if;

  select coalesce(max(deal_seq), 0) + 1 into v_deal_seq
  from public.deal_event where deal_id = new.deal_id;
  select coalesce(max(aggregate_seq), 0) + 1 into v_agg_seq
  from public.deal_event where aggregate_type = 'deal' and aggregate_id = new.deal_id;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_via, deal_seq, aggregate_seq
  )
  values (
    new.account_id, new.deal_id, 'deal', new.deal_id, 'deal.loi_signed',
    jsonb_build_object('milestone_id', new.id, 'signed_on', new.actual_on),
    'system', 'deal_milestone', v_deal_seq, v_agg_seq
  );

  if v_agg_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (new.account_id, new.deal_id, 'deal', new.deal_id, v_agg_seq,
            public.deal_aggregate_state('deal', new.deal_id));
  end if;

  if v_deal_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (new.account_id, new.deal_id, 'deal-wide', new.deal_id, v_deal_seq,
            public.deal_wide_manifest(new.deal_id));
  end if;

  return null;
end;
$$;

-- The event marks replaced the enable time.
drop trigger stamp_workflow_enabled_at on public.workflow;
drop function tuckin.stamp_workflow_enabled_at();
alter table public.workflow drop column enabled_at;

-- How far each event log had reached when a workflow was last switched on, so
-- it starts only on events after that.
create or replace function tuckin.mark_workflow_enabled()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' or not old.enabled then
    new.enabled_after_deal_seq := coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.deal_event', 'global_seq')), 0);
    new.enabled_after_account_seq := coalesce(pg_sequence_last_value(pg_get_serial_sequence('public.account_event', 'global_seq')), 0);
  end if;
  return new;
end;
$$;

create trigger mark_workflow_enabled
  before insert or update of enabled on public.workflow
  for each row when (new.enabled)
  execute function tuckin.mark_workflow_enabled();
