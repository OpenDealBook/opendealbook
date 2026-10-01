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
  stage text not null default 'sourcing',
  notes text,
  deal_box_version int,
  close_date date,
  broker_contact_id uuid references public.contact (id) on delete set null,
  outcome_reason text,
  -- resolution is the structured lifecycle outcome, set by deal.resolved; a
  -- resolved deal keeps its stage. resolution_reason is the structured reason,
  -- validated by the feature layer. The legacy free-text outcome_reason stays
  -- for the comps/activity_pool path and is not superseded here.
  resolution text,
  resolution_reason text,
  listing_status text not null default 'active' check (listing_status in ('active', 'pulled', 'sold')),
  archived_at timestamptz,
  stage_changed_at timestamptz,
  discovered_at timestamptz,
  earnings_basis text not null default 'sde' check (earnings_basis in ('sde', 'ebitda')),
  open_to_partnership boolean not null default false,
  duplicate_of uuid references public.deal (id) on delete set null,
  capture_method text,
  source_url text,
  search_tsv tsvector,
  created_by_kind text,
  created_by_ref text,
  created_by_via text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal enable row level security;

create index ix_deal_account_stage on public.deal (account_id, stage);
create index ix_deal_firm on public.deal (firm_id);
create index ix_deal_owner on public.deal (owner_user_id);

-- List and search indexes for the deals list. The list query is always
-- account-scoped, so the range indexes lead with account_id to stay useful
-- under the account filter. pg_trgm backs the title (description) prefix and
-- fuzzy match; it is enabled here because the index below needs gin_trgm_ops,
-- but it belongs with the other extensions in 00-privileges.sql (see report).
create extension if not exists pg_trgm with schema extensions;

create index ix_deal_search_tsv on public.deal using gin (search_tsv);
create index ix_deal_description_trgm on public.deal using gin (description extensions.gin_trgm_ops);
create index ix_deal_account_archived_stage_updated on public.deal (account_id, archived_at, stage, updated_at desc);
create index ix_deal_account_asking_price on public.deal (account_id, asking_price);
create index ix_deal_account_revenue_ttm on public.deal (account_id, revenue_ttm);
create index ix_deal_account_sde_ttm on public.deal (account_id, sde_ttm);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal from authenticated, service_role;
grant select on public.deal to authenticated;
grant select on public.deal to service_role;

create trigger deal_timestamps
  before insert or update on public.deal
  for each row execute function public.set_timestamps();

-- search_tsv is kept in a BEFORE trigger rather than a stored generated column:
-- to_tsvector is only stable, not immutable, so a generated column rejects it.
-- The trigger fires on the projector's writes even though deal is DML-revoked,
-- the same way deal_timestamps does. Only deal-local text is indexed here;
-- industry, location and broker text live on deal_profile and contact (report).
create or replace function public.deal_search_tsv()
  returns trigger
  set search_path = '' as $$
begin
  new.search_tsv := to_tsvector('english', coalesce(new.description, ''));
  return new;
end;
$$ language plpgsql;

create trigger deal_search_tsv
  before insert or update on public.deal
  for each row execute function public.deal_search_tsv();
