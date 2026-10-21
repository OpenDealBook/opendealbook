-- The deal timeline. A milestone is a deal-event aggregate, so its history is
-- the deal_event log and this table holds only current values. Dates are plain
-- calendar days with no time zone. Closing, effective, LOI signed and APA
-- signing start shared with outside parties; every other milestone starts
-- team-only.

create type public.milestone_kind as enum (
  'loi_deadline',
  'loi_signed',
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
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
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
    -- One day of slack past UTC today, because it is already tomorrow in time
    -- zones ahead of UTC.
    if (ev.payload ->> 'actual_on')::date > current_date + 1 then
      raise exception 'a milestone''s actual date cannot be in the future' using errcode = 'check_violation';
    end if;
    insert into public.deal_milestone (id, account_id, deal_id, kind, label, target_on, actual_on, shared, created_at, updated_at, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id, ev.deal_id,
      (ev.payload ->> 'kind')::public.milestone_kind,
      ev.payload ->> 'label',
      (ev.payload ->> 'target_on')::date,
      (ev.payload ->> 'actual_on')::date,
      coalesce(
        (ev.payload ->> 'shared')::boolean,
        (ev.payload ->> 'kind') in ('loi_signed', 'apa_signing', 'closing', 'effective')
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

-- The first time a deal's LOI signed date is filled in, however it was set,
-- the deal log records deal.loi_signed once, so workflows can start on it.
-- The signing is appended under the deal's lock with the same sequence and
-- snapshot rules as append_deal_event, which cannot be called here because
-- the person saving the date is not the service.
create or replace function tuckin.record_loi_signed()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal_seq bigint;
  v_agg_seq bigint;
begin
  if current_setting('odb.replay', true) = 'on' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.deal_id::text));

  if exists (
    select 1 from public.deal_event
    where deal_id = new.deal_id and event_type = 'deal.loi_signed'
  ) then
    return null;
  end if;

  select coalesce(max(deal_seq), 0) + 1 into v_deal_seq
  from public.deal_event where deal_id = new.deal_id;
  select coalesce(max(aggregate_seq), 0) + 1 into v_agg_seq
  from public.deal_event where aggregate_type = 'deal' and aggregate_id = new.deal_id;

  insert into public.deal_event (
    account_id, deal_id, aggregate_type, aggregate_id, event_type, payload,
    actor_kind, actor_via, deal_seq, aggregate_seq
  )
  values (
    new.account_id, new.deal_id, 'deal', new.deal_id, 'deal.loi_signed',
    jsonb_build_object('milestone_id', new.id, 'signed_on', new.actual_on),
    'system', 'deal_milestone', v_deal_seq, v_agg_seq
  );

  if v_agg_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (new.account_id, new.deal_id, 'deal', new.deal_id, v_agg_seq,
            public.deal_aggregate_state('deal', new.deal_id));
  end if;

  if v_deal_seq % 64 = 0 then
    insert into public.deal_event_snapshot (account_id, deal_id, aggregate_type, aggregate_id, through_seq, state)
    values (new.account_id, new.deal_id, 'deal-wide', new.deal_id, v_deal_seq,
            public.deal_wide_manifest(new.deal_id));
  end if;

  return null;
end;
$$;

create trigger record_loi_signed_on_insert
  after insert on public.deal_milestone
  for each row when (new.kind = 'loi_signed' and new.actual_on is not null)
  execute function tuckin.record_loi_signed();

create trigger record_loi_signed_on_update
  after update of actual_on on public.deal_milestone
  for each row when (new.kind = 'loi_signed' and old.actual_on is null and new.actual_on is not null)
  execute function tuckin.record_loi_signed();

-- ---- What outside parties see ----

-- Lenders, sellers and counsel see the shared milestones' current values,
-- never history or who changed them. An effective date the team never set
-- follows closing, so it stands in as an empty row whenever closing is shared.
create or replace function public.shared_deal_timeline(deal_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date, created_at timestamptz)
  language sql stable
  set search_path = '' as $$
  select m.kind, m.label, m.target_on, m.actual_on, m.created_at
  from public.deal_milestone m
  where m.deal_id = shared_deal_timeline.deal_id
    and m.shared
  union all
  select 'effective', null, null, null, null
  where exists (
      select 1 from public.deal_milestone m
      where m.deal_id = shared_deal_timeline.deal_id and m.kind = 'closing' and m.shared
    )
    and not exists (
      select 1 from public.deal_milestone m
      where m.deal_id = shared_deal_timeline.deal_id and m.kind = 'effective'
    );
$$;

revoke all on function public.shared_deal_timeline(uuid) from public, anon, authenticated;

create or replace function public.lender_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.lender_room r
  cross join public.shared_deal_timeline(r.deal_id) t
  where r.id = lender_room_timeline.room_id
    and public.is_lender_room_member(r.id)
  order by t.kind, t.created_at;
$$;

revoke all on function public.lender_room_timeline(uuid) from public, anon;
grant execute on function public.lender_room_timeline(uuid) to authenticated, service_role;

create or replace function public.seller_room_timeline(room_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.seller_room r
  cross join public.shared_deal_timeline(r.deal_id) t
  where r.id = seller_room_timeline.room_id
    and public.is_seller_room_member(r.id)
  order by t.kind, t.created_at;
$$;

revoke all on function public.seller_room_timeline(uuid) from public, anon;
grant execute on function public.seller_room_timeline(uuid) to authenticated, service_role;

create or replace function public.counsel_timeline(deal_id uuid)
  returns table (kind public.milestone_kind, label text, target_on date, actual_on date)
  language sql stable security definer
  set search_path = '' as $$
  select t.kind, t.label, t.target_on, t.actual_on
  from public.shared_deal_timeline(counsel_timeline.deal_id) t
  where public.is_deal_counsel(counsel_timeline.deal_id, 'buyer')
    or public.is_deal_counsel(counsel_timeline.deal_id, 'seller')
  order by t.kind, t.created_at;
$$;

revoke all on function public.counsel_timeline(uuid) from public, anon;
grant execute on function public.counsel_timeline(uuid) to authenticated, service_role;

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_milestone
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_milestone
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');
