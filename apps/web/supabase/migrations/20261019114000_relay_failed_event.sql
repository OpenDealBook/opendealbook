-- Compiled from supabase/schemas/99r2-relay-cursor.sql.

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
