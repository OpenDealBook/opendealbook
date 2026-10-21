-- Compiled from supabase/schemas/99s-workflows.sql.

-- Team workflows. A workflow is edited as a draft version and runs only from a
-- published one; publishing freezes the version, so a run started on it
-- finishes on it. Triggers are derived from the published graph. Runs, steps
-- and logs are written by the runner through the service role; the team reads
-- them, and a manager decides the approvals a run waits on.

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

create type public.workflow_step_status as enum ('running', 'waiting', 'succeeded', 'failed');

create table if not exists public.workflow (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  system_key text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, system_key),
  unique (id, account_id)
);

alter table public.workflow enable row level security;

revoke all on public.workflow from anon, authenticated, service_role;
grant select, delete on public.workflow to authenticated;
grant insert (id, account_id, name) on public.workflow to authenticated;
grant update (name, enabled) on public.workflow to authenticated;
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
  account_id uuid not null,
  workflow_id uuid not null,
  version_id uuid not null,
  trigger_kind public.workflow_trigger_kind not null,
  trigger_ref text not null,
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
  unique (run_id, node_id, attempt),
  unique (id, account_id),
  check ((status in ('succeeded', 'failed')) = (finished_at is not null))
);

alter table public.workflow_step_run enable row level security;

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
  message text not null,
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
    public.has_permission((select auth.uid()), account_id, 'workflows.manage')
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
