-- Background searches on a deal. Each search is a run of a workflow: it checks
-- courts, sanctions and news for the deal's business and people, records what
-- it found, and writes one report. Running again adds a new run beside the old
-- ones, so history is kept. A run's status is its workflow run's status. The
-- runner writes through the service role and the team reads. Findings arrive
-- unrated; the report step rates each one once, with its reason, and nothing
-- else ever changes. A run with no findings gets a report written without AI.

create type public.diligence_subject_kind as enum ('business', 'person');

create type public.diligence_source as enum ('courts', 'sanctions', 'news', 'reviews');

create type public.diligence_severity as enum ('red', 'amber', 'green');

create table if not exists public.diligence_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  workflow_run_id uuid not null,
  foreign key (workflow_run_id, account_id) references public.workflow_run (id, account_id) on delete cascade,
  unique (id, deal_id, account_id),
  unique (workflow_run_id, deal_id)
);

create table if not exists public.diligence_finding (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  deal_id uuid not null,
  account_id uuid not null,
  subject_kind public.diligence_subject_kind not null,
  subject_name text not null,
  subject_key text not null,
  source public.diligence_source not null,
  severity public.diligence_severity,
  title text not null,
  summary text not null,
  source_url text not null,
  occurred_on date,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  severity_reason text,
  foreign key (run_id, deal_id, account_id) references public.diligence_run (id, deal_id, account_id) on delete cascade
);

create table if not exists public.diligence_report (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  deal_id uuid not null,
  account_id uuid not null,
  summary text not null,
  model text,
  created_at timestamptz not null default now(),
  foreign key (run_id, deal_id, account_id) references public.diligence_run (id, deal_id, account_id) on delete cascade
);

-- One row per source and subject a run has finished searching, written after
-- that search's findings, so a retried run skips what it already paid for.
create table if not exists public.diligence_search_check (
  run_id uuid not null references public.diligence_run (id) on delete cascade,
  source public.diligence_source not null,
  subject_key text not null,
  primary key (run_id, source, subject_key)
);

create index ix_diligence_run_deal on public.diligence_run (deal_id);
create index ix_diligence_finding_run on public.diligence_finding (run_id);

alter table public.diligence_run enable row level security;
alter table public.diligence_finding enable row level security;
alter table public.diligence_report enable row level security;
alter table public.diligence_search_check enable row level security;

revoke all on public.diligence_run from anon, authenticated, service_role;
grant select on public.diligence_run to authenticated;
grant select, insert on public.diligence_run to service_role;

revoke all on public.diligence_finding from anon, authenticated, service_role;
grant select on public.diligence_finding to authenticated;
grant select, insert on public.diligence_finding to service_role;
grant update (severity, severity_reason) on public.diligence_finding to service_role;

revoke all on public.diligence_report from anon, authenticated, service_role;
grant select on public.diligence_report to authenticated;
grant select, insert on public.diligence_report to service_role;

revoke all on public.diligence_search_check from anon, authenticated, service_role;
grant select, insert on public.diligence_search_check to service_role;

create policy diligence_run_read on public.diligence_run
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy diligence_finding_read on public.diligence_finding
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy diligence_report_read on public.diligence_report
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function odb.refuse_rerating_finding()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a rated finding keeps its severity' using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_rerating_finding
  before update of severity, severity_reason on public.diligence_finding
  for each row when (old.severity is not null or old.severity_reason is not null)
  execute function odb.refuse_rerating_finding();

create trigger same_team_deal_id
  before insert or update on public.diligence_run
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_run
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_finding
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_report
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_run
  for each row execute function odb.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_finding
  for each row execute function odb.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_report
  for each row execute function odb.refuse_personal_account_row();
