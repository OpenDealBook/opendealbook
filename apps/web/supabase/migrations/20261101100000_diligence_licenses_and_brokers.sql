alter type public.diligence_source add value if not exists 'licenses';
alter type public.diligence_source add value if not exists 'court_records';

alter table public.diligence_finding alter column source_url drop not null;

alter table public.workflow_step_run drop constraint workflow_step_run_waiting_on_kind;
alter table public.workflow_step_run
  add constraint workflow_step_run_waiting_on_kind check (waiting_on in ('timer', 'decision', 'cap', 'poll'));

create table if not exists public.diligence_broker_check (
  run_id uuid not null references public.diligence_run (id) on delete cascade,
  subject_key text not null,
  broker text not null check (broker in ('baselayer', 'middesk')),
  state jsonb not null default '{}',
  started_at timestamptz not null default now(),
  primary key (run_id, subject_key)
);

alter table public.diligence_broker_check enable row level security;

revoke all on public.diligence_broker_check from anon, authenticated, service_role;
grant select, insert, update (state) on public.diligence_broker_check to service_role;
