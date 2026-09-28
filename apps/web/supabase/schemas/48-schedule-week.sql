-- One week of a diligence_schedule. Deal-scoped through the parent schedule's
-- deal; managed with checklists.manage. This file also extends checklist_item
-- with prioritization and a link back to the week an item belongs to, kept here
-- so the schedule_week table exists before the foreign key references it.

create table if not exists public.schedule_week (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.diligence_schedule (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  week_no int,
  starts_on date,
  theme text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.schedule_week enable row level security;

create index ix_schedule_week_schedule on public.schedule_week (schedule_id);
create index ix_schedule_week_account on public.schedule_week (account_id);

revoke all on public.schedule_week from authenticated, service_role;
grant select, insert, update, delete on public.schedule_week to authenticated;
grant select, insert, update, delete on public.schedule_week to service_role;

create trigger schedule_week_timestamps
  before insert or update on public.schedule_week
  for each row execute function public.set_timestamps();

create policy schedule_week_read on public.schedule_week
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select s.deal_id from public.diligence_schedule s where s.id = schedule_id),
      'checklists.manage'
    )
  );

create policy schedule_week_insert on public.schedule_week
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy schedule_week_update on public.schedule_week
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy schedule_week_delete on public.schedule_week
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

alter table public.checklist_item
  add column priority int not null default 0,
  add column deal_killer boolean not null default false,
  add column schedule_week_id uuid references public.schedule_week (id) on delete set null;
