-- Data-room bulk upload staging. An upload_batch stages a single file, a group
-- of files, or a ZIP before the extraction worker expands it into dr_document
-- rows; each staged file is an upload_item pointing at its landing spot and,
-- once imported, at the dr_document it became. Deal-scoped; access mirrors
-- dr_document so external parties on the deal reach their own batches, while
-- the worker writes through service_role.

create type public.upload_batch_kind as enum ('single', 'group', 'zip');

create type public.upload_batch_status as enum ('pending', 'extracting', 'ready', 'imported', 'failed');

create type public.upload_item_status as enum ('pending', 'imported', 'failed');

create table if not exists public.upload_batch (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  kind public.upload_batch_kind not null,
  status public.upload_batch_status not null default 'pending',
  file_count int not null default 0,
  source_filename text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users default auth.uid()
);

alter table public.upload_batch enable row level security;

create index ix_upload_batch_deal on public.upload_batch (deal_id);

revoke all on public.upload_batch from authenticated, service_role;
grant select, insert, update, delete on public.upload_batch to authenticated;
grant select, insert, update, delete on public.upload_batch to service_role;

create trigger upload_batch_timestamps
  before insert or update on public.upload_batch
  for each row execute function public.set_timestamps();

create policy upload_batch_read on public.upload_batch
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy upload_batch_insert on public.upload_batch
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy upload_batch_update on public.upload_batch
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy upload_batch_delete on public.upload_batch
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create table if not exists public.upload_item (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.upload_batch (id) on delete cascade,
  storage_path text not null,
  original_path text not null,
  size_bytes bigint,
  content_type text,
  status public.upload_item_status not null default 'pending',
  target_folder_id uuid references public.dr_folder (id) on delete set null,
  dr_document_id uuid references public.dr_document (id) on delete set null,
  error text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.upload_item enable row level security;

create index ix_upload_item_batch on public.upload_item (batch_id);

revoke all on public.upload_item from authenticated, service_role;
grant select, insert, update, delete on public.upload_item to authenticated;
grant select, insert, update, delete on public.upload_item to service_role;

create trigger upload_item_timestamps
  before insert or update on public.upload_item
  for each row execute function public.set_timestamps();

create policy upload_item_read on public.upload_item
  for select to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and (
          public.has_role_on_account(b.account_id)
          or public.has_deal_permission(b.deal_id, 'deals.manage')
        )
    )
  );

create policy upload_item_insert on public.upload_item
  for insert to authenticated
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );

create policy upload_item_update on public.upload_item
  for update to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  )
  with check (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );

create policy upload_item_delete on public.upload_item
  for delete to authenticated
  using (
    exists (
      select 1 from public.upload_batch b
      where b.id = batch_id
        and public.has_permission((select auth.uid()), b.account_id, 'deals.manage')
    )
  );
