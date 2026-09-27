-- Account-scoped deal pipeline stages. Every account owns its own ordered set,
-- seeded from the default 8-stage pipeline (plus the two terminal closed
-- stages) at account creation. Renaming, reordering, and adding stages are
-- plain updates and inserts; deal.stage is validated against this table.

create table if not exists public.pipeline_stage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null,
  is_terminal boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, key),
  unique (account_id, sort_order)
);

alter table public.pipeline_stage enable row level security;

create index ix_pipeline_stage_account on public.pipeline_stage (account_id);

revoke all on public.pipeline_stage from authenticated, service_role;
grant select, insert, update, delete on public.pipeline_stage to authenticated;
grant select, insert, update, delete on public.pipeline_stage to service_role;

create trigger pipeline_stage_timestamps
  before insert or update on public.pipeline_stage
  for each row execute function public.set_timestamps();

create trigger pipeline_stage_user_tracking
  before insert or update on public.pipeline_stage
  for each row execute function public.set_user_tracking();

create policy pipeline_stage_read on public.pipeline_stage
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy pipeline_stage_insert on public.pipeline_stage
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy pipeline_stage_update on public.pipeline_stage
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy pipeline_stage_delete on public.pipeline_stage
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

-- Populate an account with the default ordered pipeline. Called from every
-- account-provisioning path so a deal can always reference a valid stage.
create or replace function public.seed_default_pipeline_stages(p_account_id uuid)
  returns void
  language sql
  security definer
  set search_path = '' as $$
  insert into public.pipeline_stage (account_id, key, label, sort_order, is_terminal)
  values
    (p_account_id, 'sourced', 'Sourced', 1, false),
    (p_account_id, 'qualifying', 'Qualifying', 2, false),
    (p_account_id, 'loi', 'LOI', 3, false),
    (p_account_id, 'diligence', 'Diligence', 4, false),
    (p_account_id, 'hr_audit', 'HR Audit', 5, false),
    (p_account_id, 'apa', 'APA', 6, false),
    (p_account_id, 'announcement', 'Announcement', 7, false),
    (p_account_id, 'integration', 'Integration', 8, false),
    (p_account_id, 'closed_won', 'Closed Won', 9, true),
    (p_account_id, 'closed_lost', 'Closed Lost', 10, true);
$$;

grant execute on function public.seed_default_pipeline_stages(uuid) to service_role;

-- A deal's stage must be one of its own account's stages. NO ACTION (the
-- default) defers the check to statement end, so an account cascade delete that
-- removes both the deal and its stages in one statement stays satisfiable.
alter table public.deal
  add constraint deal_stage_pipeline_stage_fk
  foreign key (account_id, stage) references public.pipeline_stage (account_id, key);
