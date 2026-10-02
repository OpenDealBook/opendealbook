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
  subject text not null,
  body text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (sequence_id, ordinal)
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
