alter table public.courtlistener_pace add column held_until timestamptz not null default '-infinity';

drop function public.claim_courtlistener_slot(uuid, interval);

create function public.claim_courtlistener_slot(p_account_id uuid, p_spacing interval)
  returns table (wait_ms double precision, held boolean)
  language sql
  set search_path = '' as $$
  with claimed as (
    insert into public.courtlistener_pace as pace (account_id, next_free_at)
    values (p_account_id, clock_timestamp() + p_spacing)
    on conflict (account_id) do update
      set next_free_at = greatest(pace.next_free_at, clock_timestamp()) + p_spacing
    returning pace.next_free_at - p_spacing as slot, pace.held_until
  )
  select
    greatest(0, extract(epoch from slot - clock_timestamp()) * 1000)::double precision,
    held_until > clock_timestamp()
  from claimed;
$$;

create or replace function public.hold_courtlistener_slots(p_account_id uuid, p_for interval)
  returns void
  language sql
  set search_path = '' as $$
  insert into public.courtlistener_pace as pace (account_id, next_free_at, held_until)
  values (p_account_id, clock_timestamp() + p_for, clock_timestamp() + p_for)
  on conflict (account_id) do update
    set next_free_at = greatest(pace.next_free_at, clock_timestamp() + p_for),
        held_until = greatest(pace.held_until, clock_timestamp() + p_for);
$$;

revoke all on function public.claim_courtlistener_slot(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_courtlistener_slot(uuid, interval) to service_role;
