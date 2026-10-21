-- Team workflows. A workflow is edited as a draft version and runs only from a
-- published one; publishing freezes the version, so a run started on it
-- finishes on it. Triggers are derived from the published graph. Runs, steps
-- and logs are written by the runner through the service role; the team reads
-- them, and a deal manager decides the approvals a run waits on. A workflow
-- with runs is archived, never deleted.

insert into public.role_permissions (role, permission) values
  ('owner', 'workflows.manage'),
  ('admin', 'workflows.manage')
on conflict do nothing;

alter table public.outreach_setting
  add column lookup_monthly_cap int not null default 0,
  add column ai_monthly_cap int not null default 0;

create type public.workflow_trigger_kind as enum ('schedule', 'event', 'manual');

create type public.workflow_run_status as enum (
  'running',
  'waiting',
  'awaiting_approval',
  'paused_locked',
  'paused_cap',
  'succeeded',
  'failed',
  'cancelled'
);

create type public.workflow_step_status as enum ('running', 'waiting', 'succeeded', 'failed', 'cancelled');

create type public.workflow_log_level as enum ('info', 'warn', 'error');

create table if not exists public.workflow (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  system_key text,
  enabled boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workflow_archived_disabled_check check (not (enabled and archived_at is not null)),
  unique (account_id, system_key),
  unique (id, account_id)
);

alter table public.workflow enable row level security;

revoke all on public.workflow from anon, authenticated, service_role;
grant select, delete on public.workflow to authenticated;
grant insert (id, account_id, name) on public.workflow to authenticated;
grant update (name, enabled, archived_at) on public.workflow to authenticated;
grant select, insert, update, delete on public.workflow to service_role;

create policy workflow_read on public.workflow
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workflow_insert on public.workflow
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create policy workflow_update on public.workflow
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'workflows.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create policy workflow_delete on public.workflow
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create table if not exists public.workflow_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  workflow_id uuid not null,
  schema_version int not null check (schema_version > 0),
  graph jsonb not null,
  published_at timestamptz,
  published_by uuid references auth.users,
  created_at timestamptz not null default now(),
  foreign key (workflow_id, account_id) references public.workflow (id, account_id) on delete cascade,
  check ((published_at is null) = (published_by is null)),
  unique (id, workflow_id)
);

alter table public.workflow_version enable row level security;

create unique index ux_workflow_version_draft on public.workflow_version (workflow_id) where published_at is null;

revoke all on public.workflow_version from anon, authenticated, service_role;
grant select, delete on public.workflow_version to authenticated;
grant insert (id, account_id, workflow_id, schema_version, graph) on public.workflow_version to authenticated;
grant update (schema_version, graph, published_at, published_by) on public.workflow_version to authenticated;
grant select, insert, update, delete on public.workflow_version to service_role;

create policy workflow_version_read on public.workflow_version
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workflow_version_insert on public.workflow_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create policy workflow_version_update on public.workflow_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'workflows.manage'))
  with check (
    (published_by is null or published_by = (select auth.uid()))
    and public.has_permission((select auth.uid()), account_id, 'workflows.manage')
  );

create policy workflow_version_delete on public.workflow_version
  for delete to authenticated
  using (
    published_at is null
    and public.has_permission((select auth.uid()), account_id, 'workflows.manage')
  );

create or replace function tuckin.refuse_published_version_change()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a published workflow version cannot change' using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_published_version_change
  before update on public.workflow_version
  for each row when (old.published_at is not null)
  execute function tuckin.refuse_published_version_change();

create or replace function tuckin.refuse_enabling_unpublished_workflow()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workflow_version
    where workflow_id = new.id and published_at is not null
  ) then
    raise exception 'a workflow needs a published version to be enabled' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_enabling_unpublished_workflow
  before insert or update of enabled on public.workflow
  for each row when (new.enabled)
  execute function tuckin.refuse_enabling_unpublished_workflow();

create or replace function tuckin.require_published_version()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workflow_version
    where id = new.version_id and published_at is not null
  ) then
    raise exception 'workflow version % is not published', new.version_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create table if not exists public.workflow_trigger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  workflow_id uuid not null,
  version_id uuid not null,
  node_id text not null,
  kind public.workflow_trigger_kind not null,
  event_type text,
  filter jsonb not null default '{}'::jsonb,
  temporal_schedule_id text unique,
  foreign key (workflow_id, account_id) references public.workflow (id, account_id) on delete cascade,
  foreign key (version_id, workflow_id) references public.workflow_version (id, workflow_id) on delete cascade,
  unique (version_id, node_id),
  check ((kind = 'event') = (event_type is not null)),
  check (kind = 'schedule' or temporal_schedule_id is null)
);

alter table public.workflow_trigger enable row level security;

revoke all on public.workflow_trigger from anon, authenticated, service_role;
grant select, insert, update, delete on public.workflow_trigger to authenticated;
grant select, insert, update, delete on public.workflow_trigger to service_role;

create policy workflow_trigger_read on public.workflow_trigger
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workflow_trigger_insert on public.workflow_trigger
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create policy workflow_trigger_update on public.workflow_trigger
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'workflows.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create policy workflow_trigger_delete on public.workflow_trigger
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'workflows.manage'));

create trigger require_published_version
  before insert or update of version_id on public.workflow_trigger
  for each row execute function tuckin.require_published_version();

-- trigger_ref names what started the run (an event id, a schedule fire time,
-- a manual request id), so a redelivered start finds the run it already made.
create table if not exists public.workflow_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  workflow_id uuid not null,
  version_id uuid not null,
  trigger_kind public.workflow_trigger_kind not null,
  trigger_ref text not null,
  trigger_node_id text not null,
  status public.workflow_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (workflow_id, account_id) references public.workflow (id, account_id),
  foreign key (version_id, workflow_id) references public.workflow_version (id, workflow_id),
  unique (workflow_id, trigger_ref),
  unique (id, account_id),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null))
);

alter table public.workflow_run enable row level security;

create index ix_workflow_run_workflow_started on public.workflow_run (workflow_id, started_at desc);

revoke all on public.workflow_run from anon, authenticated, service_role;
grant select on public.workflow_run to authenticated;
grant select, insert, update, delete on public.workflow_run to service_role;

create policy workflow_run_read on public.workflow_run
  for select to authenticated
  using (public.has_role_on_account(account_id));

create trigger require_published_version
  before insert on public.workflow_run
  for each row execute function tuckin.require_published_version();

create or replace function tuckin.refuse_run_version_change()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a run finishes on the version it started on' using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_run_version_change
  before update of version_id on public.workflow_run
  for each row when (old.version_id is distinct from new.version_id)
  execute function tuckin.refuse_run_version_change();

-- A failed run may be retried; a succeeded or cancelled one is final.
create or replace function tuckin.refuse_reopening_finished_run()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a % run is final', old.status using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_reopening_finished_run
  before update of status on public.workflow_run
  for each row when (old.status in ('succeeded', 'cancelled') and new.status <> old.status)
  execute function tuckin.refuse_reopening_finished_run();

-- One row per step execution, keyed by idempotency_key; every retry reuses it and counts attempt on.
create table if not exists public.workflow_step_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  run_id uuid not null,
  node_id text not null,
  attempt int not null default 1 check (attempt > 0),
  status public.workflow_step_status not null default 'running',
  input jsonb,
  output jsonb,
  error text,
  idempotency_key text not null unique,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (run_id, account_id) references public.workflow_run (id, account_id) on delete cascade,
  unique (id, account_id),
  check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null))
);

alter table public.workflow_step_run enable row level security;

create or replace function tuckin.cancel_unfinished_steps()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.workflow_step_run
  set status = 'cancelled', finished_at = new.finished_at
  where run_id = new.id and status in ('running', 'waiting');
  return null;
end;
$$;

create trigger cancel_unfinished_steps
  after update of status on public.workflow_run
  for each row when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function tuckin.cancel_unfinished_steps();

-- Starting a step locks its run, so a cancelled run never gets a step back to
-- running, and each start counts one more attempt on the step's single row.
create or replace function public.start_workflow_step_run(
  p_account_id uuid,
  p_run_id uuid,
  p_node_id text,
  p_idempotency_key text,
  p_input jsonb
) returns table (id uuid, attempt int, status public.workflow_step_status, output jsonb)
  language sql
  set search_path = '' as $$
  with started as (
    insert into public.workflow_step_run as s (account_id, run_id, node_id, idempotency_key, input)
    select p_account_id, p_run_id, p_node_id, p_idempotency_key, p_input
    from public.workflow_run r
    where r.id = p_run_id and r.status <> 'cancelled'
    for share of r
    on conflict (idempotency_key) do update
      set attempt = s.attempt + 1, status = 'running', error = null, finished_at = null, input = excluded.input
      where s.status not in ('succeeded', 'cancelled')
    returning s.id, s.attempt, s.status, s.output
  )
  select * from started
  union all
  select s.id, s.attempt, s.status, s.output
  from public.workflow_step_run s
  where s.idempotency_key = p_idempotency_key and not exists (select 1 from started);
$$;

revoke all on function public.start_workflow_step_run(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_workflow_step_run(uuid, uuid, text, text, jsonb) to service_role;

revoke all on public.workflow_step_run from anon, authenticated, service_role;
grant select on public.workflow_step_run to authenticated;
grant select, insert, update, delete on public.workflow_step_run to service_role;

create policy workflow_step_run_read on public.workflow_step_run
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- Append-only: nobody is granted update or delete; retention pruning runs as
-- the table owner.
create table if not exists public.workflow_step_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  step_run_id uuid not null,
  level public.workflow_log_level not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (step_run_id, account_id) references public.workflow_step_run (id, account_id) on delete cascade
);

alter table public.workflow_step_log enable row level security;

create index ix_workflow_step_log_step on public.workflow_step_log (step_run_id, created_at);

revoke all on public.workflow_step_log from anon, authenticated, service_role;
grant select on public.workflow_step_log to authenticated;
grant select, insert on public.workflow_step_log to service_role;

create policy workflow_step_log_read on public.workflow_step_log
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- The decision on a step a run waits on. One row per step, never changed, and
-- decided_by is always the person who inserted it.
create table if not exists public.workflow_approval (
  step_run_id uuid primary key,
  account_id uuid not null,
  approved boolean not null,
  decided_by uuid not null references auth.users default auth.uid(),
  decided_at timestamptz not null default now(),
  foreign key (step_run_id, account_id) references public.workflow_step_run (id, account_id) on delete cascade
);

alter table public.workflow_approval enable row level security;

revoke all on public.workflow_approval from anon, authenticated, service_role;
grant select on public.workflow_approval to authenticated;
grant insert (step_run_id, account_id, approved) on public.workflow_approval to authenticated;
grant select on public.workflow_approval to service_role;

create policy workflow_approval_read on public.workflow_approval
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy workflow_approval_insert on public.workflow_approval
  for insert to authenticated
  with check (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    and exists (
      select 1
      from public.workflow_step_run s
      join public.workflow_run r on r.id = s.run_id
      where s.id = step_run_id and s.status = 'waiting' and r.status = 'awaiting_approval'
    )
  );

-- Step input, output and logs are kept 90 days; run summaries are kept.
create or replace function public.prune_workflow_step_data()
  returns void
  language sql security definer
  set search_path = '' as $$
  update public.workflow_step_run
  set input = null, output = null
  where finished_at < now() - interval '90 days'
    and (input is not null or output is not null);

  delete from public.workflow_step_log
  where created_at < now() - interval '90 days';
$$;

revoke all on function public.prune_workflow_step_data() from public, anon, authenticated;
grant execute on function public.prune_workflow_step_data() to service_role;

-- Every paid lookup a team makes, counted against its monthly lookup cap.
create type public.paid_lookup_outcome as enum ('found', 'not_found', 'failed');

create table if not exists public.paid_lookup (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid,
  kind public.provider_kind not null check (kind <> 'letters'),
  provider text not null,
  cost_cents int not null check (cost_cents >= 0),
  outcome public.paid_lookup_outcome not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (firm_id, account_id) references public.firm (id, account_id) on delete set null (firm_id)
);

alter table public.paid_lookup enable row level security;

create index ix_paid_lookup_account_created on public.paid_lookup (account_id, created_at);

revoke all on public.paid_lookup from anon, authenticated, service_role;
grant select on public.paid_lookup to authenticated;
grant select, insert, update, delete on public.paid_lookup to service_role;

create policy paid_lookup_read on public.paid_lookup
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function public.lookup_cap_reached(p_account_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select count(*) >= coalesce((select lookup_monthly_cap from public.outreach_setting where account_id = p_account_id), 0)
  from public.paid_lookup
  where account_id = p_account_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

revoke all on function public.lookup_cap_reached(uuid) from public, anon, authenticated;
grant execute on function public.lookup_cap_reached(uuid) to service_role;

-- Team-wide events that belong to no deal, such as a firm approval. Like
-- deal_event, rows are appended by their source tables and read in global_seq
-- order by relays; nobody writes them directly.
create table if not exists public.account_event (
  id uuid primary key default gen_random_uuid(),
  global_seq bigint generated always as identity unique,
  account_id uuid not null references public.accounts (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.account_event enable row level security;

revoke all on public.account_event from anon, authenticated, service_role;
grant select on public.account_event to authenticated, service_role;

create policy account_event_read on public.account_event
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function tuckin.record_firm_approved()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.account_event (account_id, event_type, payload)
  values (new.account_id, 'firm.approved', jsonb_build_object(
    'firm_id', (select firm_id from public.firm_verdict where id = new.verdict_id),
    'verdict_id', new.verdict_id,
    'approved_by', new.approved_by
  ));
  return null;
end;
$$;

create trigger record_firm_approved
  after insert on public.firm_verdict_approval
  for each row execute function tuckin.record_firm_approved();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_version
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_trigger
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_run
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_step_run
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_step_log
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.workflow_approval
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.paid_lookup
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.account_event
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
