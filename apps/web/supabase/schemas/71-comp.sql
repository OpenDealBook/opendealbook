-- A comparable transaction. Every row carries a data_class that fixes its
-- visibility for the life of the row: external rows are platform-owned open data
-- served cross-tenant through comp_external; internal and proprietary rows are
-- tenant-owned and never cross a tenant boundary. proprietary rows are readable
-- only while the owning tenant holds an active comp_license. data_class is set at
-- insert and made immutable by comp_data_class_immutable so a row can never be
-- reclassified into a more permissive class. Money multiples are generated so no
-- writer can desynchronise them. account_id is null for external rows.

create table if not exists public.comp (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete set null,
  data_class public.comp_data_class not null,
  source text not null,
  source_ref text,
  naics_code text,
  industry text,
  region text,
  state text,
  close_date date,
  asking_price numeric,
  sale_price numeric,
  revenue numeric,
  sde numeric,
  ebitda numeric,
  multiple_sde numeric generated always as (sale_price / nullif(sde, 0)) stored,
  multiple_revenue numeric generated always as (sale_price / nullif(revenue, 0)) stored,
  multiple_ebitda numeric generated always as (sale_price / nullif(ebitda, 0)) stored,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp enable row level security;

create index ix_comp_data_class on public.comp (data_class);
create index ix_comp_account on public.comp (account_id, data_class);
create index ix_comp_deal on public.comp (deal_id);
create index ix_comp_naics on public.comp (naics_code);
create unique index ux_comp_source_ref on public.comp (source, source_ref) where source_ref is not null;

revoke all on public.comp from authenticated, service_role;
grant select on public.comp to authenticated;
grant select, insert, update, delete on public.comp to service_role;

create trigger comp_timestamps
  before insert or update on public.comp
  for each row execute function public.set_timestamps();

-- data_class is frozen after insert. Reclassifying a row would move it between
-- visibility rules, so the change is rejected outright.
create or replace function public.comp_data_class_immutable()
  returns trigger
  set search_path = '' as $$
begin
  if new.data_class <> old.data_class then
    raise exception 'comp.data_class is immutable' using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger comp_data_class_immutable
  before update on public.comp
  for each row execute function public.comp_data_class_immutable();

-- internal rows are visible within the owning tenant or to a granted deal
-- participant; proprietary rows only while the tenant holds an active license.
-- external rows are not exposed here: they are served by comp_external.
create policy comp_read on public.comp
  for select to authenticated
  using (
    (
      data_class = 'internal'
      and (
        public.has_role_on_account(account_id)
        or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
      )
    )
    or (
      data_class = 'proprietary'
      and public.has_role_on_account(account_id)
      and exists (
        select 1 from public.comp_license l
        where l.account_id = comp.account_id
          and l.status = 'active'
          and (l.expires_at is null or l.expires_at > now())
      )
    )
  );

-- The cross-tenant open-data surface. Runs with the view owner's rights so
-- external rows are public, and filters to external so the proprietary and
-- internal rows behind the same table never leak. The comps data-class guard
-- asserts no view over comp omits this exclusion.
create view public.comp_external as
  select
    id, source, source_ref, naics_code, industry, region, state, close_date,
    asking_price, sale_price, revenue, sde, ebitda,
    multiple_sde, multiple_revenue, multiple_ebitda, created_at
  from public.comp
  where data_class = 'external';

grant select on public.comp_external to authenticated, service_role;

-- Keep internal and proprietary comps searchable inside their tenant. External
-- rows have no account and are cross-tenant, so they are not indexed here.
create or replace function public.comp_search_index()
  returns trigger
  security definer set search_path = '' as $$
begin
  if new.account_id is not null then
    insert into public.search_document (entity_type, entity_id, account_id, deal_id, tsv)
    values (
      'comp', new.id, new.account_id, new.deal_id,
      to_tsvector('english', coalesce(new.industry, '') || ' ' || coalesce(new.naics_code, '') || ' ' || coalesce(new.region, '') || ' ' || coalesce(new.source, ''))
    )
    on conflict (entity_type, entity_id) do update set
      account_id = excluded.account_id,
      deal_id = excluded.deal_id,
      tsv = excluded.tsv;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger comp_search_index
  after insert or update on public.comp
  for each row execute function public.comp_search_index();
