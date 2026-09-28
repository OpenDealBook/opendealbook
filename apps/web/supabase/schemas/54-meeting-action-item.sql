-- An action item captured on a meeting (Stage 4). It can be assigned to an
-- internal user or a seller, and optionally linked to the checklist item or
-- schedule week it advances. Deal-scoped; managed with deals.manage.

create table if not exists public.meeting_action_item (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meeting (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  description text not null,
  owner_user_id uuid references auth.users,
  owner_is_seller boolean not null default false,
  due_at timestamptz,
  status public.checklist_status not null default 'not_started',
  checklist_item_id uuid references public.checklist_item (id) on delete set null,
  schedule_week_id uuid references public.schedule_week (id) on delete set null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  removed_at timestamptz
);

alter table public.meeting_action_item enable row level security;

create index ix_meeting_action_item_meeting on public.meeting_action_item (meeting_id);
create index ix_meeting_action_item_deal on public.meeting_action_item (deal_id);
create index ix_meeting_action_item_account on public.meeting_action_item (account_id);

revoke all on public.meeting_action_item from authenticated, service_role;
grant select, insert, update, delete on public.meeting_action_item to authenticated;
grant select, insert, update, delete on public.meeting_action_item to service_role;

create trigger meeting_action_item_timestamps
  before insert or update on public.meeting_action_item
  for each row execute function public.set_timestamps();

create trigger meeting_action_item_user_tracking
  before insert or update on public.meeting_action_item
  for each row execute function public.set_user_tracking();

create policy meeting_action_item_read on public.meeting_action_item
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'deals.manage')
    )
  );

create policy meeting_action_item_insert on public.meeting_action_item
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_action_item_update on public.meeting_action_item
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_action_item_delete on public.meeting_action_item
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
