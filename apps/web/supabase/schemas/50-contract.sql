-- LOI/APA workspace for a deal. A contract holds its versions (contract_version)
-- and points at the current one. Deal-scoped; managed with deals.manage. This
-- file also wires generated_document.contract_id to reference a contract now
-- that the table exists.

create table if not exists public.contract (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  type text not null check (type in ('loi', 'apa')),
  status text,
  current_version int,
  -- The offer_version this contract was generated from, pinned at contract.created
  -- so the LOI/APA keeps its link back to the accepted offer. A plain uuid, like
  -- deal_financials.source_calc_version_id: the offer_version is written in the same
  -- event batch, so no foreign key is enforced here.
  source_offer_version_id uuid,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.contract enable row level security;

create index ix_contract_deal on public.contract (deal_id);
create index ix_contract_account on public.contract (account_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.contract from authenticated, service_role;
grant select on public.contract to authenticated;
grant select on public.contract to service_role;

create trigger contract_timestamps
  before insert or update on public.contract
  for each row execute function public.set_timestamps();

create policy contract_read on public.contract
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy contract_insert on public.contract
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_update on public.contract
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_delete on public.contract
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

alter table public.generated_document
  add constraint generated_document_contract_id_fk
  foreign key (contract_id) references public.contract (id) on delete set null;
