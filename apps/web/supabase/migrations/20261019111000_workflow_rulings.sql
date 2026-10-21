-- Compiled from supabase/schemas/99s-workflows.sql.

alter table public.workflow
  add column archived_at timestamptz,
  add constraint workflow_archived_disabled_check check (not (enabled and archived_at is not null));

grant update (archived_at) on public.workflow to authenticated;

create or replace function tuckin.refuse_reopening_cancelled_run()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a cancelled run is final' using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_reopening_cancelled_run
  before update of status on public.workflow_run
  for each row when (old.status = 'cancelled' and new.status <> 'cancelled')
  execute function tuckin.refuse_reopening_cancelled_run();

create type public.workflow_log_level as enum ('info', 'warn', 'error');

alter table public.workflow_step_log
  add column level public.workflow_log_level not null,
  add column details jsonb not null default '{}'::jsonb;

drop policy workflow_approval_insert on public.workflow_approval;

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

create table if not exists public.paid_lookup (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid,
  kind public.provider_kind not null check (kind <> 'letters'),
  provider text not null,
  cost_cents int not null check (cost_cents >= 0),
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
  before insert or update or delete on public.paid_lookup
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.account_event
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
