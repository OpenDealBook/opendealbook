-- Background searches on a deal. Each search is a run of a workflow: it checks
-- courts, sanctions and news for the deal's business and people, records what
-- it found, and writes one report. Running again adds a new run beside the old
-- ones, so history is kept. A run's status is its workflow run's status. The
-- runner writes through the service role and the team reads. Findings arrive
-- unrated; the report step rates each one once, and nothing else ever changes.

create type public.diligence_subject_kind as enum ('business', 'person');

create type public.diligence_source as enum ('courts', 'sanctions', 'news');

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
  foreign key (run_id, deal_id, account_id) references public.diligence_run (id, deal_id, account_id) on delete cascade
);

create table if not exists public.diligence_report (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  deal_id uuid not null,
  account_id uuid not null,
  summary text not null,
  model text not null,
  created_at timestamptz not null default now(),
  foreign key (run_id, deal_id, account_id) references public.diligence_run (id, deal_id, account_id) on delete cascade
);

create index ix_diligence_run_deal on public.diligence_run (deal_id);
create index ix_diligence_finding_run on public.diligence_finding (run_id);

alter table public.diligence_run enable row level security;
alter table public.diligence_finding enable row level security;
alter table public.diligence_report enable row level security;

revoke all on public.diligence_run from anon, authenticated, service_role;
grant select on public.diligence_run to authenticated;
grant select, insert on public.diligence_run to service_role;

revoke all on public.diligence_finding from anon, authenticated, service_role;
grant select on public.diligence_finding to authenticated;
grant select, insert on public.diligence_finding to service_role;
grant update (severity) on public.diligence_finding to service_role;

revoke all on public.diligence_report from anon, authenticated, service_role;
grant select on public.diligence_report to authenticated;
grant select, insert on public.diligence_report to service_role;

create policy diligence_run_read on public.diligence_run
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy diligence_finding_read on public.diligence_finding
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy diligence_report_read on public.diligence_report
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function tuckin.refuse_rerating_finding()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  raise exception 'a rated finding keeps its severity' using errcode = 'object_not_in_prerequisite_state';
end;
$$;

create trigger refuse_rerating_finding
  before update of severity on public.diligence_finding
  for each row when (old.severity is not null)
  execute function tuckin.refuse_rerating_finding();

create trigger same_team_deal_id
  before insert or update on public.diligence_run
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_run
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_finding
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.diligence_report
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_run
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_finding
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.diligence_report
  for each row execute function tuckin.refuse_personal_account_row();

create or replace function public.project_checklist_item(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'checklist_item.added' then
    insert into public.checklist_item (id, account_id, deal_id, category, title, owner_user_id, due_at, status, priority, deal_killer, schedule_week_id, due_offset_days, review_offset_days, review_due_at, source_template_id, artifact_type, artifact_id, kind, owner_role, importance, answer, offer_term_key, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      ev.payload ->> 'category',
      ev.payload ->> 'title',
      (ev.payload ->> 'owner_user_id')::uuid,
      (ev.payload ->> 'due_at')::timestamptz,
      coalesce((ev.payload ->> 'status')::public.checklist_status, 'not_started'),
      coalesce((ev.payload ->> 'priority')::int, 0),
      coalesce((ev.payload ->> 'deal_killer')::boolean, false),
      (ev.payload ->> 'schedule_week_id')::uuid,
      (ev.payload ->> 'due_offset_days')::int,
      coalesce((ev.payload ->> 'review_offset_days')::int, 3),
      (ev.payload ->> 'review_due_at')::timestamptz,
      (ev.payload ->> 'source_template_id')::uuid,
      ev.payload ->> 'artifact_type',
      (ev.payload ->> 'artifact_id')::uuid,
      ev.payload ->> 'kind',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'importance',
      ev.payload ->> 'answer',
      ev.payload ->> 'offer_term_key',
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      category = excluded.category,
      title = excluded.title,
      owner_user_id = excluded.owner_user_id,
      due_at = excluded.due_at,
      status = excluded.status,
      priority = excluded.priority,
      deal_killer = excluded.deal_killer,
      schedule_week_id = excluded.schedule_week_id,
      due_offset_days = excluded.due_offset_days,
      review_offset_days = excluded.review_offset_days,
      review_due_at = excluded.review_due_at,
      source_template_id = excluded.source_template_id,
      artifact_type = excluded.artifact_type,
      artifact_id = excluded.artifact_id,
      kind = excluded.kind,
      owner_role = excluded.owner_role,
      importance = excluded.importance,
      answer = excluded.answer,
      offer_term_key = excluded.offer_term_key,
      updated_by = excluded.updated_by;
  elsif ev.event_type = 'checklist_item.status_changed' then
    update public.checklist_item set
      status = (ev.payload ->> 'status')::public.checklist_status,
      requested_at = coalesce((ev.payload ->> 'requested_at')::timestamptz, requested_at),
      received_at = coalesce((ev.payload ->> 'received_at')::timestamptz, received_at),
      reviewed_at = coalesce((ev.payload ->> 'reviewed_at')::timestamptz, reviewed_at),
      reviewed_by = coalesce((ev.payload ->> 'reviewed_by')::uuid, reviewed_by),
      outcome = coalesce((ev.payload ->> 'outcome')::public.checklist_outcome, outcome),
      answer = coalesce(ev.payload ->> 'answer', answer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.due_recomputed' then
    update public.checklist_item set
      due_at = (ev.payload ->> 'due_at')::timestamptz,
      review_due_at = (ev.payload ->> 'review_due_at')::timestamptz,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.rescheduled' then
    update public.checklist_item set
      schedule_week_id = (ev.payload ->> 'schedule_week_id')::uuid,
      priority = coalesce((ev.payload ->> 'priority')::int, priority),
      deal_killer = coalesce((ev.payload ->> 'deal_killer')::boolean, deal_killer),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.details_set' then
    update public.checklist_item set
      owner_user_id = case when ev.payload ? 'owner_user_id' then (ev.payload ->> 'owner_user_id')::uuid else owner_user_id end,
      importance = case when ev.payload ? 'importance' then ev.payload ->> 'importance' else importance end,
      due_at = case when ev.payload ? 'due_at' then (ev.payload ->> 'due_at')::timestamptz else due_at end,
      review_due_at = case when ev.payload ? 'due_at'
        then (ev.payload ->> 'due_at')::timestamptz + make_interval(days => review_offset_days)
        else review_due_at end,
      due_set_manually = case when ev.payload ? 'use_scheduled_date' then false
        else due_set_manually or ev.payload ? 'due_at' end,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.waiting_on_set' then
    update public.checklist_item set waiting_on = ev.payload ->> 'waiting_on', updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.document_linked' then
    update public.checklist_item set linked_document_id = (ev.payload ->> 'document_id')::uuid, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'checklist_item.note_posted' then
    insert into public.checklist_item_note (id, checklist_item_id, body, author_user_id, created_at)
    values (ev.id, ev.aggregate_id, ev.payload ->> 'body', ev.actor_ref, ev.created_at);
  elsif ev.event_type = 'checklist_item.removed' then
    update public.checklist_item set removed_at = ev.created_at, updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  else
    raise exception 'unknown checklist_item event %', ev.event_type;
  end if;
end;
$$;
