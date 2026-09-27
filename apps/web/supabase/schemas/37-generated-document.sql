-- A document produced from a template for a specific deal. template_version
-- records the template revision used so the output stays reproducible even if
-- the template later changes. Deal-scoped: reachable by internal members and by
-- external parties holding a participant grant on the deal.

create table if not exists public.generated_document (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  template_id uuid references public.document_template (id) on delete set null,
  template_version int,
  deal_id uuid not null references public.deal (id) on delete cascade,
  values_json jsonb not null default '{}'::jsonb,
  docx_path text,
  pdf_path text,
  contract_id uuid,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.generated_document enable row level security;

create index ix_generated_document_deal on public.generated_document (deal_id);
create index ix_generated_document_account on public.generated_document (account_id);

revoke all on public.generated_document from authenticated, service_role;
grant select, insert, update, delete on public.generated_document to authenticated;
grant select, insert, update, delete on public.generated_document to service_role;

create policy generated_document_read on public.generated_document
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy generated_document_insert on public.generated_document
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy generated_document_update on public.generated_document
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy generated_document_delete on public.generated_document
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
