-- A share of a generated_document with a recipient, tracking send/view/expiry
-- and the external signing workflow. Deal-scoped through the shared document's
-- deal; the recipient may also read their own share row.

create table if not exists public.document_share (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  generated_document_id uuid not null references public.generated_document (id) on delete cascade,
  recipient_user_id uuid references auth.users on delete cascade,
  permission text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  expires_at timestamptz,
  workflow_id text,
  created_at timestamptz not null default now()
);

alter table public.document_share enable row level security;

create index ix_document_share_document on public.document_share (generated_document_id);
create index ix_document_share_account on public.document_share (account_id);

revoke all on public.document_share from authenticated, service_role;
grant select, insert, update, delete on public.document_share to authenticated;
grant select, insert, update, delete on public.document_share to service_role;

create policy document_share_read on public.document_share
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or recipient_user_id = (select auth.uid())
    or exists (
      select 1 from public.generated_document g
      where g.id = generated_document_id
        and public.has_deal_permission(g.deal_id, 'deals.manage')
    )
  );

create policy document_share_insert on public.document_share
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_share_update on public.document_share
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy document_share_delete on public.document_share
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
