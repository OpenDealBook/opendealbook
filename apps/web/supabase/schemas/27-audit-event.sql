-- Append-only audit trail. Rows are never updated or deleted: no update/delete
-- grant and no update/delete policy exist, so those operations are refused.

create table if not exists public.audit_event (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  actor_user_id uuid not null default auth.uid() references auth.users,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_event enable row level security;

create index ix_audit_event_account on public.audit_event (account_id, created_at);
create index ix_audit_event_deal on public.audit_event (deal_id, created_at);

revoke all on public.audit_event from authenticated, service_role;
grant select, insert on public.audit_event to authenticated;
grant select, insert on public.audit_event to service_role;

create policy audit_event_read on public.audit_event
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );

create policy audit_event_insert on public.audit_event
  for insert to authenticated
  with check (
    public.has_role_on_account(account_id)
    or (deal_id is not null and public.has_deal_permission(deal_id, 'deals.manage'))
  );
