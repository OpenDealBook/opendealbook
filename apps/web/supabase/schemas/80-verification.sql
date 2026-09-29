-- Diligence verification framework. A verification_run is one execution of the
-- reconciliation-check suite against a deal; each run yields verification_finding
-- rows tying a discrepancy to the checklist item or data-room document it
-- concerns. These are standalone conventional tables, not event-sourced deal
-- projections: the verification runner writes them through the service role
-- after its own permission check, so authenticated keeps SELECT gated on deal
-- access, mirroring dr_document, and never writes directly.

create type public.verification_severity as enum ('info', 'warning', 'error');
create type public.verification_run_status as enum ('queued', 'running', 'done', 'failed');
create type public.verification_finding_status as enum ('open', 'resolved', 'dismissed');

create table if not exists public.verification_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  status public.verification_run_status not null default 'queued',
  trigger text not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.verification_run enable row level security;

create index ix_verification_run_deal_status on public.verification_run (deal_id, status);

revoke all on public.verification_run from authenticated, service_role;
grant select on public.verification_run to authenticated;
grant select, insert, update, delete on public.verification_run to service_role;

create trigger verification_run_timestamps
  before insert or update on public.verification_run
  for each row execute function public.set_timestamps();

create policy verification_run_read on public.verification_run
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create table if not exists public.verification_finding (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  run_id uuid not null references public.verification_run (id) on delete cascade,
  check_key text not null,
  severity public.verification_severity not null,
  status public.verification_finding_status not null default 'open',
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  dr_document_id uuid references public.dr_document (id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.verification_finding enable row level security;

create index ix_verification_finding_deal_status on public.verification_finding (deal_id, status);
create index ix_verification_finding_run on public.verification_finding (run_id);

revoke all on public.verification_finding from authenticated, service_role;
grant select on public.verification_finding to authenticated;
grant select, insert, update, delete on public.verification_finding to service_role;

create trigger verification_finding_timestamps
  before insert or update on public.verification_finding
  for each row execute function public.set_timestamps();

create policy verification_finding_read on public.verification_finding
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

-- Per-severity totals for a deal's findings; the comps activity_pool consumes
-- this to populate its finding_counts. security invoker so the deal-scoped RLS
-- on verification_finding governs which rows a caller counts.
create or replace function public.verification_finding_counts(p_deal_id uuid)
  returns table (error int, warning int, info int)
  language sql stable security invoker
  set search_path = '' as $$
  select
    count(*) filter (where f.severity = 'error')::int,
    count(*) filter (where f.severity = 'warning')::int,
    count(*) filter (where f.severity = 'info')::int
  from public.verification_finding f
  where f.deal_id = verification_finding_counts.p_deal_id;
$$;

grant execute on function public.verification_finding_counts(uuid) to authenticated, service_role;
