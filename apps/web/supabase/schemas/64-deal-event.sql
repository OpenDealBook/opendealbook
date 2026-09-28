-- The deal-wide event store. deal_event is the append-only source of truth for
-- everything that happens inside a deal's saga; the domain tables are synchronous
-- projections of this log. Rows are written only through append_deal_event
-- (66-deal-event-append.sql): there is no insert/update/delete grant to anyone.
-- deal_event_snapshot holds materialised checkpoints written on the every-64
-- boundary. Both are deal-scoped and read with the same visibility as the deal.

create type public.event_actor_kind as enum ('user', 'service', 'api_key', 'system');

create table if not exists public.deal_event (
  id uuid primary key default gen_random_uuid(),
  global_seq bigint generated always as identity,
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade deferrable initially deferred,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_kind public.event_actor_kind not null,
  actor_ref uuid,
  actor_via text,
  deal_seq bigint not null,
  aggregate_seq bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (deal_id, deal_seq),
  unique (aggregate_type, aggregate_id, aggregate_seq)
);

alter table public.deal_event enable row level security;

create index ix_deal_event_deal_seq on public.deal_event (deal_id, deal_seq);
create index ix_deal_event_aggregate on public.deal_event (aggregate_type, aggregate_id, aggregate_seq);
create index ix_deal_event_account on public.deal_event (account_id, created_at);

revoke all on public.deal_event from authenticated, service_role;
grant select on public.deal_event to authenticated, service_role;

create policy deal_event_read on public.deal_event
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create table if not exists public.deal_event_snapshot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade deferrable initially deferred,
  aggregate_type text not null,
  aggregate_id uuid not null,
  through_seq bigint not null,
  state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (aggregate_type, aggregate_id, through_seq)
);

alter table public.deal_event_snapshot enable row level security;

create index ix_deal_event_snapshot_latest on public.deal_event_snapshot (aggregate_type, aggregate_id, through_seq desc);

revoke all on public.deal_event_snapshot from authenticated, service_role;
grant select on public.deal_event_snapshot to authenticated, service_role;

create policy deal_event_snapshot_read on public.deal_event_snapshot
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );
