-- The anonymized closed-deal pool: one platform-owned row per contributed close,
-- already pseudonymised and banded by the anonymize module before it lands here.
-- The base table is never read by tenants; comp_pool_public is the only tenant
-- surface, and it hides any bucket thinner than the admin-set minimum (default
-- from config.comp_pool_min_bucket) and exposes only the coarse dimensions
-- (region, NAICS 3-digit), so a single contributor can never be singled out.
-- comp_pool_key holds the pseudonym-to-deal link and cross-tenant fingerprint and
-- is platform-admin-only: it is never granted to tenants and never enters a view.

create table if not exists public.comp_pool (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  region text,
  naics3 text,
  industry_short text,
  close_quarter text,
  sale_price_banded numeric,
  revenue_banded numeric,
  sde_banded numeric,
  sde_multiple numeric,
  outcome text,
  created_at timestamptz not null default now()
);

alter table public.comp_pool enable row level security;

create index ix_comp_pool_bucket on public.comp_pool (region, naics3, industry_short, close_quarter);

revoke all on public.comp_pool from authenticated, service_role;
grant select, insert, update, delete on public.comp_pool to service_role;

create table if not exists public.comp_pool_key (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  deal_id uuid references public.deal (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (pseudonym)
);

alter table public.comp_pool_key enable row level security;

create index ix_comp_pool_key_fingerprint on public.comp_pool_key (fingerprint);

-- Never granted to tenants: the pseudonym-to-deal link is platform-admin-only
-- and reached through the service role, so authenticated has no privilege here.
revoke all on public.comp_pool_key from authenticated, service_role;
grant select, insert, update, delete on public.comp_pool_key to service_role;

create table if not exists public.comp_pool_optin (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id)
);

alter table public.comp_pool_optin enable row level security;

revoke all on public.comp_pool_optin from authenticated, service_role;
grant select on public.comp_pool_optin to authenticated;
grant select, insert, update, delete on public.comp_pool_optin to service_role;

create trigger comp_pool_optin_timestamps
  before insert or update on public.comp_pool_optin
  for each row execute function public.set_timestamps();

create policy comp_pool_optin_read on public.comp_pool_optin
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- The k-anonymity read surface. Runs with the owner's rights over the base pool,
-- groups to the coarse bucket, and drops any bucket below the admin-set minimum.
create view public.comp_pool_public as
  select
    region, naics3, industry_short, close_quarter,
    count(*) as n,
    percentile_cont(0.5) within group (order by sde_multiple) as median_sde_multiple,
    percentile_cont(0.5) within group (order by sale_price_banded) as median_sale_price
  from public.comp_pool
  group by region, naics3, industry_short, close_quarter
  having count(*) >= (select c.comp_pool_min_bucket from public.config c limit 1);

grant select on public.comp_pool_public to authenticated, service_role;
