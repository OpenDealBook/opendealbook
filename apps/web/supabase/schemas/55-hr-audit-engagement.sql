-- HR/compensation audit engagement on a deal (Stage 5). Tracks the vendor (or
-- internal team) running the audit and links the resulting report document.
-- Deal-scoped; managed with deals.manage. References dr_document, so it is
-- ordered after that table.

create table if not exists public.hr_audit_engagement (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('third_party', 'internal')),
  vendor_name text,
  vendor_contact text,
  scope text,
  ordered_at timestamptz,
  due_at timestamptz,
  report_document_id uuid references public.dr_document (id) on delete set null,
  findings_json jsonb not null default '{}'::jsonb,
  status public.checklist_status not null default 'not_started',
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.hr_audit_engagement enable row level security;

create index ix_hr_audit_engagement_deal on public.hr_audit_engagement (deal_id);
create index ix_hr_audit_engagement_account on public.hr_audit_engagement (account_id);

revoke all on public.hr_audit_engagement from authenticated, service_role;
grant select, insert, update, delete on public.hr_audit_engagement to authenticated;
grant select, insert, update, delete on public.hr_audit_engagement to service_role;

create trigger hr_audit_engagement_timestamps
  before insert or update on public.hr_audit_engagement
  for each row execute function public.set_timestamps();

create trigger hr_audit_engagement_user_tracking
  before insert or update on public.hr_audit_engagement
  for each row execute function public.set_user_tracking();

create policy hr_audit_engagement_read on public.hr_audit_engagement
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy hr_audit_engagement_insert on public.hr_audit_engagement
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy hr_audit_engagement_update on public.hr_audit_engagement
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy hr_audit_engagement_delete on public.hr_audit_engagement
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
