-- A file attached to a deal, task, calc version, or offer version. The owner is
-- polymorphic across those four kinds, so it is modeled as an owner_kind tag plus
-- a generic owner_id rather than four nullable foreign keys. offer_version is a
-- Lane 3 owner kind and is already allowed here so Lane 3 adds no migration to
-- this table. storage_path holds the object-store key, matching the data-room
-- storage convention (dr_document, upload_item). An attachment is created and
-- deleted, never edited, so the table carries created_at/created_by only and has
-- no update path.

create table if not exists public.attachment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  owner_kind text check (owner_kind in ('deal', 'task', 'calc_version', 'offer_version')),
  owner_id uuid not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users default auth.uid()
);

alter table public.attachment enable row level security;

create index ix_attachment_owner on public.attachment (owner_kind, owner_id);

revoke all on public.attachment from authenticated, service_role;
grant select, insert, delete on public.attachment to authenticated;
grant select, insert, delete on public.attachment to service_role;

create policy attachment_read on public.attachment
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy attachment_insert on public.attachment
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy attachment_delete on public.attachment
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
