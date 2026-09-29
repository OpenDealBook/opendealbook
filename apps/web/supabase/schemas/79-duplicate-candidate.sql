-- A softer-signal duplicate suggestion raised by DetectDuplicates. An exact
-- listing-id or URL match auto-flags the deal itself (deal.duplicate_of, set
-- through the event store); anything below that bar lands here for a human to
-- confirm or dismiss. Scoped to the tenant and to the deals it references.

create table if not exists public.duplicate_candidate (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  candidate_deal_id uuid not null references public.deal (id) on delete cascade,
  signal text,
  score numeric,
  status text not null default 'open',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, candidate_deal_id)
);

alter table public.duplicate_candidate enable row level security;

create index ix_duplicate_candidate_account on public.duplicate_candidate (account_id);
create index ix_duplicate_candidate_deal on public.duplicate_candidate (deal_id);

revoke all on public.duplicate_candidate from authenticated, service_role;
grant select on public.duplicate_candidate to authenticated;
grant select, insert, update, delete on public.duplicate_candidate to service_role;

create trigger duplicate_candidate_timestamps
  before insert or update on public.duplicate_candidate
  for each row execute function public.set_timestamps();

create policy duplicate_candidate_read on public.duplicate_candidate
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );
