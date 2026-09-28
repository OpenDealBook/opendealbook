-- Diligence checklist items on a deal. status is the shared checklist_status.

create table if not exists public.checklist_item (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  category text,
  title varchar(500) not null,
  owner_user_id uuid references auth.users,
  due_at timestamptz,
  status public.checklist_status not null default 'not_started',
  requested_at timestamptz,
  received_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users,
  outcome public.checklist_outcome,
  due_offset_days int,
  artifact_type text,
  artifact_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  removed_at timestamptz
);

alter table public.checklist_item enable row level security;

create index ix_checklist_item_deal_status on public.checklist_item (deal_id, status);
create index ix_checklist_item_account on public.checklist_item (account_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.checklist_item from authenticated, service_role;
grant select on public.checklist_item to authenticated;
grant select on public.checklist_item to service_role;

create trigger checklist_item_timestamps
  before insert or update on public.checklist_item
  for each row execute function public.set_timestamps();

create policy checklist_item_read on public.checklist_item
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'checklists.manage')
    )
  );

create policy checklist_item_insert on public.checklist_item
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_item_update on public.checklist_item
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy checklist_item_delete on public.checklist_item
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));
