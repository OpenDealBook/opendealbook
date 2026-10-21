-- The team shares a contract version with the seller side; counsel and seller
-- room members read contracts by side.

alter table public.contract_version add column if not exists shared_at timestamptz;

grant update (shared_at) on public.contract_version to authenticated;

-- Buyer's counsel read every version. The seller side, seller's counsel and
-- the members of an open seller room, read only what the team shared and
-- what the seller side wrote. The checks run as definer because the contract
-- and contract_version policies would otherwise recurse into each other.

create or replace function public.reads_contracts_as_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_counsel(reads_contracts_as_seller_side.deal_id, 'seller')
    or reads_contracts_as_seller_side.deal_id = any (public.seller_open_room_deal_ids());
$$;

revoke all on function public.reads_contracts_as_seller_side(uuid) from public, anon;
grant execute on function public.reads_contracts_as_seller_side(uuid) to authenticated, service_role;

create or replace function public.outsider_reads_contract(contract_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.contract c
    where c.id = outsider_reads_contract.contract_id
      and (
        public.is_deal_counsel(c.deal_id, 'buyer')
        or (
          public.reads_contracts_as_seller_side(c.deal_id)
          and exists (
            select 1 from public.contract_version v
            where v.contract_id = c.id and (v.shared_at is not null or v.party = 'seller')
          )
        )
      )
  );
$$;

revoke all on function public.outsider_reads_contract(uuid) from public, anon;
grant execute on function public.outsider_reads_contract(uuid) to authenticated, service_role;

create or replace function public.outsider_reads_contract_version(contract_id uuid, party text, shared_at timestamptz)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.contract c
    where c.id = outsider_reads_contract_version.contract_id
      and (
        public.is_deal_counsel(c.deal_id, 'buyer')
        or (
          (outsider_reads_contract_version.shared_at is not null or outsider_reads_contract_version.party = 'seller')
          and public.reads_contracts_as_seller_side(c.deal_id)
        )
      )
  );
$$;

revoke all on function public.outsider_reads_contract_version(uuid, text, timestamptz) from public, anon;
grant execute on function public.outsider_reads_contract_version(uuid, text, timestamptz) to authenticated, service_role;

create policy contract_outsider_read on public.contract
  for select to authenticated
  using (public.outsider_reads_contract(id));

create policy contract_version_outsider_read on public.contract_version
  for select to authenticated
  using (public.outsider_reads_contract_version(contract_id, party, shared_at));

