-- Account-scoped firms sourced into the pipeline. website is the dedupe key
-- within an account. status drives the sourcing state machine.

create table if not exists public.firm (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name varchar(255) not null,
  industry text,
  city text,
  state text,
  website text,
  employee_band text,
  established_year int,
  owner_name text,
  owner_age_estimate int,
  service_mix_json jsonb not null default '{}'::jsonb,
  icp_score numeric,
  source text,
  source_url text,
  imported_at timestamptz not null default now(),
  status text not null default 'imported' check (
    status in ('imported', 'enriched', 'scored', 'contacted', 'responded', 'deal_created', 'disqualified')
  ),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, website)
);

alter table public.firm enable row level security;

create index ix_firm_account_status on public.firm (account_id, status);

revoke all on public.firm from authenticated, service_role;
grant select, insert, update, delete on public.firm to authenticated;
grant select, insert, update, delete on public.firm to service_role;

create trigger firm_timestamps
  before insert or update on public.firm
  for each row execute function public.set_timestamps();

create trigger firm_user_tracking
  before insert or update on public.firm
  for each row execute function public.set_user_tracking();

create policy firm_read on public.firm
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy firm_insert on public.firm
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy firm_update on public.firm
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy firm_delete on public.firm
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
