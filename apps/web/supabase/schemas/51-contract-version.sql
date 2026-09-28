-- An immutable revision of a contract. version is unique within a contract.
-- Deal-scoped through the parent contract's deal; managed with deals.manage.

create table if not exists public.contract_version (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  source text not null check (source in ('editor_save', 'upload', 'generated')),
  author_user_id uuid references auth.users,
  party text not null check (party in ('buyer', 'seller')),
  docx_path text,
  pdf_path text,
  change_summary text,
  is_signed boolean not null default false,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);

alter table public.contract_version enable row level security;

create index ix_contract_version_contract on public.contract_version (contract_id);
create index ix_contract_version_account on public.contract_version (account_id);

revoke all on public.contract_version from authenticated, service_role;
grant select, insert, update, delete on public.contract_version to authenticated;
grant select, insert, update, delete on public.contract_version to service_role;

create policy contract_version_read on public.contract_version
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select c.deal_id from public.contract c where c.id = contract_id),
      'deals.manage'
    )
  );

create policy contract_version_insert on public.contract_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_update on public.contract_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_delete on public.contract_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
