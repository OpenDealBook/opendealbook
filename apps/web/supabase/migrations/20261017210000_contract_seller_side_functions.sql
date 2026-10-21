-- The seller side stops reading the contract tables and reads numbered
-- versions through definer functions instead.

drop policy if exists contract_outsider_read on public.contract;
drop policy if exists contract_version_outsider_read on public.contract_version;
drop function if exists public.outsider_reads_contract(uuid);
drop function if exists public.outsider_reads_contract_version(uuid, text, timestamptz);

create policy contract_buyer_counsel_read on public.contract
  for select to authenticated
  using (public.is_deal_counsel(deal_id, 'buyer'));

create policy contract_version_buyer_counsel_read on public.contract_version
  for select to authenticated
  using (
    public.is_deal_counsel((select c.deal_id from public.contract c where c.id = contract_id), 'buyer')
  );

create or replace function public.reads_contracts_as_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_counsel(reads_contracts_as_seller_side.deal_id, 'seller')
    or reads_contracts_as_seller_side.deal_id = any (public.seller_open_room_deal_ids());
$$;

revoke all on function public.reads_contracts_as_seller_side(uuid) from public, anon;
grant execute on function public.reads_contracts_as_seller_side(uuid) to authenticated, service_role;

create or replace function public.seller_side_contract_versions(deal_id uuid)
  returns table (
    id uuid,
    contract_id uuid,
    version int,
    party text,
    change_summary text,
    is_signed boolean,
    created_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select v.id, v.contract_id,
    (row_number() over (partition by v.contract_id order by v.version))::int,
    v.party, v.change_summary, v.is_signed, v.created_at
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where c.deal_id = seller_side_contract_versions.deal_id
    and (v.shared_at is not null or v.party = 'seller')
    and public.reads_contracts_as_seller_side(c.deal_id)
  order by c.created_at, c.id, v.version;
$$;

revoke all on function public.seller_side_contract_versions(uuid) from public, anon;
grant execute on function public.seller_side_contract_versions(uuid) to authenticated, service_role;

create or replace function public.seller_side_contracts(deal_id uuid)
  returns table (id uuid, type text, current_version int)
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.type, count(*)::int
  from public.contract c
  join public.seller_side_contract_versions(seller_side_contracts.deal_id) v on v.contract_id = c.id
  group by c.id, c.type, c.created_at
  order by c.created_at, c.id;
$$;

revoke all on function public.seller_side_contracts(uuid) from public, anon;
grant execute on function public.seller_side_contracts(uuid) to authenticated, service_role;

-- One version the seller side can see, with what a comment on it needs.
create or replace function public.seller_side_contract_version(contract_version_id uuid)
  returns table (account_id uuid, deal_id uuid)
  language sql stable security definer
  set search_path = '' as $$
  select c.account_id, c.deal_id
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where v.id = seller_side_contract_version.contract_version_id
    and exists (
      select 1 from public.seller_side_contract_versions(c.deal_id) s
      where s.id = v.id
    );
$$;

revoke all on function public.seller_side_contract_version(uuid) from public, anon;
grant execute on function public.seller_side_contract_version(uuid) to authenticated, service_role;

drop policy if exists contract_comment_read on public.contract_comment;

create policy contract_comment_read on public.contract_comment
  for select to authenticated
  using (
    (
      exists (select 1 from public.contract_version v where v.id = contract_version_id)
      or exists (select 1 from public.seller_side_contract_version(contract_version_id))
    )
    and (
      not internal
      or public.has_role_on_account(account_id)
      or public.is_deal_counsel(
        (select c.deal_id
         from public.contract_version v
         join public.contract c on c.id = v.contract_id
         where v.id = contract_version_id),
        'buyer'
      )
    )
  );
