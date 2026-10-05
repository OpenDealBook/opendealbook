-- Post-close worksheets attached to the won deal: a buyer-authored table of
-- rows per worksheet_type (margin_analysis, retention_plan, process_sop,
-- marketing_effectiveness). A worksheet is just the set of rows sharing a
-- (deal_id, worksheet_type); there is no separate parent table. Field values
-- live in `data`, keyed per the per-type catalog in the app layer. Buyer-
-- account-internal only: read is gated on buyer-account membership alone,
-- never on has_deal_permission, so a seller deal_participant can never see
-- it. Sorts after 22-deal.sql, whose deal table it references.

create type public.deal_worksheet_type as enum (
  'margin_analysis',
  'retention_plan',
  'process_sop',
  'marketing_effectiveness'
);

create table if not exists public.deal_worksheet_row (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  worksheet_type public.deal_worksheet_type not null,
  data jsonb not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

create index if not exists deal_worksheet_row_deal_id_worksheet_type_idx
  on public.deal_worksheet_row (deal_id, worksheet_type);

alter table public.deal_worksheet_row enable row level security;

revoke all on public.deal_worksheet_row from authenticated, service_role;
grant select, insert, update, delete on public.deal_worksheet_row to authenticated;
grant select, insert, update, delete on public.deal_worksheet_row to service_role;

create trigger deal_worksheet_row_timestamps
  before insert or update on public.deal_worksheet_row
  for each row execute function public.set_timestamps();

create trigger deal_worksheet_row_user_tracking
  before insert or update on public.deal_worksheet_row
  for each row execute function public.set_user_tracking();

create policy deal_worksheet_row_read on public.deal_worksheet_row
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_worksheet_row_insert on public.deal_worksheet_row
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_worksheet_row_update on public.deal_worksheet_row
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_worksheet_row_delete on public.deal_worksheet_row
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
