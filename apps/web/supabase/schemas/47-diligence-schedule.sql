-- A diligence schedule for a deal: the plan from start to a target APA date,
-- broken into weeks (schedule_week). Deal-scoped; managed with checklists.manage.

create table if not exists public.diligence_schedule (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  start_date date,
  target_apa_date date,
  template_id uuid,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'active', 'done')),
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.diligence_schedule enable row level security;

create index ix_diligence_schedule_deal on public.diligence_schedule (deal_id);
create index ix_diligence_schedule_account on public.diligence_schedule (account_id);

revoke all on public.diligence_schedule from authenticated, service_role;
grant select, insert, update, delete on public.diligence_schedule to authenticated;
grant select, insert, update, delete on public.diligence_schedule to service_role;

create trigger diligence_schedule_timestamps
  before insert or update on public.diligence_schedule
  for each row execute function public.set_timestamps();

create policy diligence_schedule_read on public.diligence_schedule
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
  );

create policy diligence_schedule_insert on public.diligence_schedule
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy diligence_schedule_update on public.diligence_schedule
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));

create policy diligence_schedule_delete on public.diligence_schedule
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'checklists.manage'));
