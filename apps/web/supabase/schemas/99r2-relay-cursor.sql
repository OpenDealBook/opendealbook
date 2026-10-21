-- How far each long-running event relay has read deal_event, by global_seq, so
-- a restarted relay resumes where it stopped. Service role only.

create table if not exists public.relay_cursor (
  name text primary key,
  last_global_seq bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.relay_cursor enable row level security;

revoke all on public.relay_cursor from anon, authenticated, service_role;
grant select, insert, update, delete on public.relay_cursor to service_role;

create or replace function tuckin.touch_relay_cursor()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_relay_cursor
  before update on public.relay_cursor
  for each row execute function tuckin.touch_relay_cursor();

-- An event a relay failed five times, set aside so the relay moves on. The
-- service role writes it and retries it on an admin's request; only verified
-- super admins read it.
create table if not exists public.relay_failed_event (
  relay_name text not null,
  global_seq bigint not null,
  error text not null,
  attempts int not null check (attempts > 0),
  created_at timestamptz not null default now(),
  retried_at timestamptz,
  resolved_at timestamptz,
  primary key (relay_name, global_seq)
);

alter table public.relay_failed_event enable row level security;

revoke all on public.relay_failed_event from anon, authenticated, service_role;
grant select on public.relay_failed_event to authenticated;
grant select, insert, update on public.relay_failed_event to service_role;

create policy relay_failed_event_read on public.relay_failed_event
  for select to authenticated
  using (public.is_super_admin());
