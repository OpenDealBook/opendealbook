-- Full-text search projection. One row per searchable source row, holding a
-- prebuilt tsvector so global search and the diligence chat rank matches
-- without scanning every domain table. The projection is maintained by the
-- backend (service_role); readers select through the same account and deal
-- access as the source rows. entity_type and entity_id name the source row;
-- deal_id is null for account-scoped entities and set for deal-scoped ones.

create table if not exists public.search_document (
  entity_type text not null,
  entity_id uuid not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  tsv tsvector not null,
  primary key (entity_type, entity_id)
);

alter table public.search_document enable row level security;

create index ix_search_document_tsv on public.search_document using gin (tsv);
create index ix_search_document_account on public.search_document (account_id);

revoke all on public.search_document from authenticated, service_role;
grant select on public.search_document to authenticated;
grant select, insert, update, delete on public.search_document to service_role;

create policy search_document_read on public.search_document
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );

-- Ranked full-text search within one account. security definer so it can read
-- the projection; the account gate mirrors the analytics functions, and the
-- deal branch keeps a participant's results to the deals they were granted.
create or replace function public.search_documents(p_account_id uuid, p_query text)
  returns table (entity_type text, entity_id uuid, deal_id uuid, rank real)
  language sql security definer
  set search_path = '' as $$
  select sd.entity_type, sd.entity_id, sd.deal_id,
    ts_rank(sd.tsv, websearch_to_tsquery('english', p_query))
  from public.search_document sd
  where sd.account_id = p_account_id
    and sd.tsv @@ websearch_to_tsquery('english', p_query)
    and (
      public.has_role_on_account(p_account_id)
      or (sd.deal_id is not null and public.has_deal_permission(sd.deal_id, 'deals.manage'))
    )
  order by 4 desc;
$$;

grant execute on function public.search_documents(uuid, text) to authenticated, service_role;
