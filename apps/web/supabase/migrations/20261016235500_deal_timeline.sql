-- The deal timeline. A milestone is a deal-event aggregate, so its history is
-- the deal_event log and this table holds only current values. Dates are plain
-- calendar days with no time zone. Closing, effective and APA signing start
-- shared with outside parties; every other milestone starts team-only.

create type public.milestone_kind as enum (
  'loi_deadline',
  'diligence_end',
  'financing_contingency',
  'apa_signing',
  'closing',
  'effective',
  'custom'
);

create table if not exists public.deal_milestone (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  kind public.milestone_kind not null,
  label text,
  target_on date,
  actual_on date,
  shared boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  check ((kind = 'custom') = (label is not null))
);

create unique index if not exists ux_deal_milestone_fixed_kind
  on public.deal_milestone (deal_id, kind) where kind <> 'custom';

alter table public.deal_milestone enable row level security;

revoke all on public.deal_milestone from anon, authenticated, service_role;
grant select on public.deal_milestone to authenticated, service_role;

create policy deal_milestone_read on public.deal_milestone
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- deal_milestone.set carries the whole milestone except sharing, which keeps
-- its value when the event leaves it out. The deal_id guards keep an event on
-- one deal from touching a milestone of another.
create or replace function public.project_deal_milestone(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal_milestone.set' then
    insert into public.deal_milestone (id, account_id, deal_id, kind, label, target_on, actual_on, shared, created_at, updated_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'kind')::public.milestone_kind,
      ev.payload ->> 'label',
      (ev.payload ->> 'target_on')::date,
      (ev.payload ->> 'actual_on')::date,
      coalesce(
        (ev.payload ->> 'shared')::boolean,
        (ev.payload ->> 'kind') in ('apa_signing', 'closing', 'effective')
      ),
      ev.created_at, ev.created_at,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      label = excluded.label,
      target_on = excluded.target_on,
      actual_on = excluded.actual_on,
      shared = coalesce((ev.payload ->> 'shared')::boolean, deal_milestone.shared),
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where deal_milestone.deal_id = excluded.deal_id;
  elsif ev.event_type = 'deal_milestone.removed' then
    delete from public.deal_milestone
    where id = ev.aggregate_id and deal_id = ev.deal_id;
  else
    raise exception 'unknown deal_milestone event %', ev.event_type;
  end if;
end;
$$;

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_milestone
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_milestone
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

-- Explicit dispatch. Unknown aggregate_type raises rather than silently
-- dropping the event.
create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' then
    perform public.project_deal(ev);
  elsif ev.aggregate_type = 'deal_box' then
    perform public.project_deal_box(ev);
  elsif ev.aggregate_type = 'checklist_item' then
    perform public.project_checklist_item(ev);
  elsif ev.aggregate_type = 'approval' then
    perform public.project_approval(ev);
  elsif ev.aggregate_type = 'deal_participant' then
    perform public.project_deal_participant(ev);
  elsif ev.aggregate_type = 'dr_document' then
    perform public.project_dr_document(ev);
  elsif ev.aggregate_type = 'meeting' then
    perform public.project_meeting(ev);
  elsif ev.aggregate_type = 'meeting_action_item' then
    perform public.project_meeting_action_item(ev);
  elsif ev.aggregate_type = 'contract' then
    perform public.project_contract(ev);
  elsif ev.aggregate_type = 'offer' then
    perform public.project_offer(ev);
  elsif ev.aggregate_type = 'deal_milestone' then
    perform public.project_deal_milestone(ev);
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;
