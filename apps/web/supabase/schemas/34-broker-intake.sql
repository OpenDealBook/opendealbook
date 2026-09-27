-- Broker-submitted deal intakes, typically arriving through a magic-link form.
-- Internal members read and manage them with deals.manage; the unauthenticated
-- magic-link submission path is served separately by the service role (an edge
-- function or signed request), which holds full grants here. That auth flow is
-- a separate lane and is not built in the database.

create type public.broker_intake_status as enum ('new', 'accepted', 'rejected');

create table if not exists public.broker_intake (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_name text not null,
  teaser text,
  asking_price numeric,
  nda_required boolean not null default false,
  submitted_by_contact_id uuid references public.contact (id) on delete set null,
  status public.broker_intake_status not null default 'new',
  firm_id uuid references public.firm (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.broker_intake enable row level security;

create index ix_broker_intake_account_status on public.broker_intake (account_id, status);

revoke all on public.broker_intake from authenticated, service_role;
grant select, insert, update, delete on public.broker_intake to authenticated;
grant select, insert, update, delete on public.broker_intake to service_role;

create policy broker_intake_read on public.broker_intake
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy broker_intake_insert on public.broker_intake
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy broker_intake_update on public.broker_intake
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy broker_intake_delete on public.broker_intake
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
