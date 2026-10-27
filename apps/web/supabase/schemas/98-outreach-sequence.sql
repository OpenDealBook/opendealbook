-- Account-owned cold-outreach sequence template. Every account owns its own set,
-- seeded from the default sequences in @odb/outreach at account creation. Steps
-- live in outreach_step; an enrollment points at one sequence by id. is_default
-- marks a seeded sequence so the enroll path can pick one without a name match.

create table if not exists public.outreach_sequence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.outreach_sequence enable row level security;

create index ix_outreach_sequence_account on public.outreach_sequence (account_id);

revoke all on public.outreach_sequence from authenticated, service_role;
grant select, insert, update, delete on public.outreach_sequence to authenticated;
grant select, insert, update, delete on public.outreach_sequence to service_role;

create trigger outreach_sequence_timestamps
  before insert or update on public.outreach_sequence
  for each row execute function public.set_timestamps();

create trigger outreach_sequence_user_tracking
  before insert or update on public.outreach_sequence
  for each row execute function public.set_user_tracking();

create policy outreach_sequence_read on public.outreach_sequence
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_sequence_insert on public.outreach_sequence
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_sequence_update on public.outreach_sequence
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_sequence_delete on public.outreach_sequence
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create type public.outreach_channel as enum ('email', 'letter');

-- Ordered steps of a sequence. ordinal is the 1-based position the dispatcher
-- matches against outreach_enrollment.current_step; delay_days spaces a step from
-- the one before it. account_id is denormalised from the parent sequence so reads
-- stay account-scoped without a join, mirroring verification_finding.
create table if not exists public.outreach_step (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  sequence_id uuid not null references public.outreach_sequence (id) on delete cascade,
  ordinal int not null,
  delay_days int not null default 0,
  channel public.outreach_channel not null default 'email',
  subject text,
  body text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (sequence_id, ordinal),
  check (channel = 'letter' or subject is not null)
);

alter table public.outreach_step enable row level security;

create index ix_outreach_step_sequence on public.outreach_step (sequence_id);

revoke all on public.outreach_step from authenticated, service_role;
grant select, insert, update, delete on public.outreach_step to authenticated;
grant select, insert, update, delete on public.outreach_step to service_role;

create trigger outreach_step_timestamps
  before insert or update on public.outreach_step
  for each row execute function public.set_timestamps();

create trigger outreach_step_user_tracking
  before insert or update on public.outreach_step
  for each row execute function public.set_user_tracking();

create policy outreach_step_read on public.outreach_step
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy outreach_step_insert on public.outreach_step
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_step_update on public.outreach_step
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy outreach_step_delete on public.outreach_step
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- Saving a sequence replaces all of its steps in one transaction, so the
-- dispatcher never reads a sequence with its steps half replaced. It runs as the
-- caller, so the step policies apply as they do to direct writes.
create or replace function public.replace_outreach_steps(p_account_id uuid, p_sequence_id uuid, p_steps jsonb)
  returns void
  language plpgsql security invoker
  set search_path = '' as $$
begin
  delete from public.outreach_step where sequence_id = p_sequence_id;

  insert into public.outreach_step (account_id, sequence_id, ordinal, delay_days, channel, subject, body)
  select p_account_id, p_sequence_id, step.ordinal, step.delay_days, step.channel, step.subject, step.body
  from jsonb_to_recordset(p_steps)
    as step(ordinal int, delay_days int, channel public.outreach_channel, subject text, body text);
end;
$$;

revoke all on function public.replace_outreach_steps(uuid, uuid, jsonb) from public, anon;
grant execute on function public.replace_outreach_steps(uuid, uuid, jsonb) to authenticated;
