-- A deal. Account-scoped for internal members; per-deal access for external
-- parties is granted through deal_participant. owner_user_id is the deal owner.
-- Policies live in 24-deal-access.sql because they depend on has_deal_permission.

create table if not exists public.deal (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid references public.firm (id) on delete set null,
  owner_user_id uuid references auth.users,
  description text,
  asking_price numeric,
  revenue_ttm numeric,
  sde_ttm numeric,
  ebitda_ttm numeric,
  source public.deal_source not null default 'manual',
  stage text not null default 'sourced',
  notes text,
  deal_box_version int,
  close_date date,
  broker_contact_id uuid references public.contact (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal enable row level security;

create index ix_deal_account_stage on public.deal (account_id, stage);
create index ix_deal_firm on public.deal (firm_id);
create index ix_deal_owner on public.deal (owner_user_id);

revoke all on public.deal from authenticated, service_role;
grant select, insert, update, delete on public.deal to authenticated;
grant select, insert, update, delete on public.deal to service_role;

create trigger deal_timestamps
  before insert or update on public.deal
  for each row execute function public.set_timestamps();

create trigger deal_user_tracking
  before insert or update on public.deal
  for each row execute function public.set_user_tracking();
