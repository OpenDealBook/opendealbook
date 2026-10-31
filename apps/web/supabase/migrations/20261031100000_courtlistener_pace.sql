-- When each team may next call CourtListener. Every worker claims from the
-- same row, so parallel runs share one team's rate. Service role only.

create table if not exists public.courtlistener_pace (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  next_free_at timestamptz not null
);

alter table public.courtlistener_pace enable row level security;

revoke all on public.courtlistener_pace from anon, authenticated, service_role;
grant select, insert, update, delete on public.courtlistener_pace to service_role;

-- Returns how many milliseconds the caller waits for its slot.
create or replace function public.claim_courtlistener_slot(p_account_id uuid, p_spacing interval)
  returns double precision
  language sql
  set search_path = '' as $$
  with claimed as (
    insert into public.courtlistener_pace as pace (account_id, next_free_at)
    values (p_account_id, clock_timestamp() + p_spacing)
    on conflict (account_id) do update
      set next_free_at = greatest(pace.next_free_at, clock_timestamp()) + p_spacing
    returning pace.next_free_at - p_spacing as slot
  )
  select greatest(0, extract(epoch from slot - clock_timestamp()) * 1000)::double precision from claimed;
$$;

create or replace function public.hold_courtlistener_slots(p_account_id uuid, p_for interval)
  returns void
  language sql
  set search_path = '' as $$
  insert into public.courtlistener_pace as pace (account_id, next_free_at)
  values (p_account_id, clock_timestamp() + p_for)
  on conflict (account_id) do update
    set next_free_at = greatest(pace.next_free_at, clock_timestamp() + p_for);
$$;

revoke all on function public.claim_courtlistener_slot(uuid, interval) from public, anon, authenticated;
grant execute on function public.claim_courtlistener_slot(uuid, interval) to service_role;
revoke all on function public.hold_courtlistener_slots(uuid, interval) from public, anon, authenticated;
grant execute on function public.hold_courtlistener_slots(uuid, interval) to service_role;
