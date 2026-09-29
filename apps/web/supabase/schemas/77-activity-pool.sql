-- The anonymized activity pool: one platform-owned row per deal from creation,
-- capturing how far it went and how it ended, pseudonymised and banded upstream.
-- Like comp_pool, tenants read only activity_pool_public, which coarsens to the
-- bucket and hides any bucket below the admin-set minimum. activity_pool_key is
-- platform-admin-only and never enters a view or export.

create table if not exists public.activity_pool (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  region text,
  naics3 text,
  industry_short text,
  created_quarter text,
  confidence public.activity_confidence,
  asking_price_banded numeric,
  loi_price_banded numeric,
  furthest_stage text,
  outcome text,
  outcome_reason text,
  loss_reason text,
  created_at timestamptz not null default now()
);

alter table public.activity_pool enable row level security;

create index ix_activity_pool_bucket on public.activity_pool (region, naics3, industry_short, created_quarter);

revoke all on public.activity_pool from authenticated, service_role;
grant select, insert, update, delete on public.activity_pool to service_role;

create table if not exists public.activity_pool_key (
  id uuid primary key default gen_random_uuid(),
  pseudonym text not null,
  deal_id uuid references public.deal (id) on delete set null,
  account_id uuid references public.accounts (id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (pseudonym)
);

alter table public.activity_pool_key enable row level security;

create index ix_activity_pool_key_fingerprint on public.activity_pool_key (fingerprint);

-- Platform-admin-only, reached through the service role; no tenant privilege.
revoke all on public.activity_pool_key from authenticated, service_role;
grant select, insert, update, delete on public.activity_pool_key to service_role;

-- The k-anonymity read surface over the activity pool.
create view public.activity_pool_public as
  select
    region, naics3, industry_short, created_quarter, outcome,
    count(*) as n,
    percentile_cont(0.5) within group (order by asking_price_banded) as median_asking_price,
    percentile_cont(0.5) within group (order by loi_price_banded) as median_loi_price
  from public.activity_pool
  group by region, naics3, industry_short, created_quarter, outcome
  having count(*) >= (select c.comp_pool_min_bucket from public.config c limit 1);

grant select on public.activity_pool_public to authenticated, service_role;
