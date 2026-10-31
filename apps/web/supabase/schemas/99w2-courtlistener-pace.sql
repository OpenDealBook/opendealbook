-- When each team may next call CourtListener. Every worker claims from the
-- same row, so parallel runs share one team's rate. held_until remembers a
-- 429, so a worker can tell a team on hold from a long queue. Service role
-- only.

create table if not exists public.courtlistener_pace (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  next_free_at timestamptz not null,
  held_until timestamptz not null default '-infinity'
);

alter table public.courtlistener_pace enable row level security;

revoke all on public.courtlistener_pace from anon, authenticated, service_role;
grant select, insert, update, delete on public.courtlistener_pace to service_role;

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('courtlistener_pace', 'service-role only bookkeeping for CourtListener pacing')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.courtlistener_pace
  for each row execute function odb.refuse_team_move();

create or replace function public.claim_courtlistener_slot(p_account_id uuid, p_spacing interval)
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
revoke all on function public.hold_courtlistener_slots(uuid, interval) from public, anon, authenticated;
grant execute on function public.hold_courtlistener_slots(uuid, interval) to service_role;
