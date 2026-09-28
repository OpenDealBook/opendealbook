-- Approval requests raised against a deal and their decision.

create table if not exists public.approval (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  subject public.approval_subject not null,
  requested_by uuid not null default auth.uid() references auth.users,
  decided_by uuid references auth.users,
  decision public.approval_decision,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.approval enable row level security;

create index ix_approval_deal on public.approval (deal_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.approval from authenticated, service_role;
grant select on public.approval to authenticated;
grant select on public.approval to service_role;

create policy approval_read on public.approval
  for select to authenticated
  using (
    public.has_role_on_account((select account_id from public.deal where id = deal_id))
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy approval_insert on public.approval
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));

create policy approval_update on public.approval
  for update to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'))
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));

create policy approval_delete on public.approval
  for delete to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'deals.manage'));
