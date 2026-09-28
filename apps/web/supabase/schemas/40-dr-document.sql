-- A file in a data room folder. Re-uploading a file with the same name is a new
-- row with a higher version; the database allows it and the app decides how to
-- present versions. checklist_item_id links a document to the diligence item it
-- satisfies. Deal-scoped.

create table if not exists public.dr_document (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  storage_path text not null,
  version int not null default 1,
  uploaded_by uuid references auth.users default auth.uid(),
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  removed_at timestamptz
);

alter table public.dr_document enable row level security;

create index ix_dr_document_deal on public.dr_document (deal_id);
create index ix_dr_document_folder on public.dr_document (folder_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.dr_document from authenticated, service_role;
grant select on public.dr_document to authenticated;
grant select on public.dr_document to service_role;

create trigger dr_document_timestamps
  before insert or update on public.dr_document
  for each row execute function public.set_timestamps();

create policy dr_document_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'deals.manage')
    )
  );

create policy dr_document_insert on public.dr_document
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_document_update on public.dr_document
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy dr_document_delete on public.dr_document
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
