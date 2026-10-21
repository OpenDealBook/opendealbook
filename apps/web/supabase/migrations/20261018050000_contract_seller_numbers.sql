-- The seller side knows each version by a number fixed when they first see
-- it, a signed version is shown to them, and they see only comments posted
-- since a version was shared.

alter table public.contract_version
  add column if not exists seller_number int,
  add constraint contract_version_contract_id_seller_number_key unique (contract_id, seller_number);

update public.contract_version set shared_at = now() where is_signed and shared_at is null;

update public.contract_version v
set seller_number = numbered.seller_number
from (
  select id, (row_number() over (partition by contract_id order by version))::int as seller_number
  from public.contract_version
  where shared_at is not null or party = 'seller'
) numbered
where numbered.id = v.id;

-- A signed version is shown to the seller side. A version the seller side
-- sees for the first time takes the next seller number on its contract; the
-- contract row lock keeps two versions from taking the same one.
create or replace function public.show_contract_version_to_seller_side()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if new.is_signed and new.shared_at is null then
    new.shared_at := now();
  end if;

  if new.seller_number is null and (new.shared_at is not null or new.party = 'seller') then
    perform 1 from public.contract c where c.id = new.contract_id for update;
    select coalesce(max(v.seller_number), 0) + 1 into new.seller_number
    from public.contract_version v
    where v.contract_id = new.contract_id;
  end if;

  return new;
end;
$$;

create trigger show_contract_version_to_seller_side
  before insert or update on public.contract_version
  for each row execute function public.show_contract_version_to_seller_side();

drop policy if exists contract_comment_read on public.contract_comment;
drop function if exists public.seller_side_contract_version(uuid);

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
  select v.id, v.contract_id, v.seller_number,
    v.party, v.change_summary, v.is_signed, v.created_at
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where c.deal_id = seller_side_contract_versions.deal_id
    and (v.shared_at is not null or v.party = 'seller')
    and public.reads_contracts_as_seller_side(c.deal_id)
  order by c.created_at, c.id, v.seller_number;
$$;

revoke all on function public.seller_side_contract_versions(uuid) from public, anon;
grant execute on function public.seller_side_contract_versions(uuid) to authenticated, service_role;

create or replace function public.seller_side_contracts(deal_id uuid)
  returns table (id uuid, type text, current_version int)
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.type, max(v.version)
  from public.contract c
  join public.seller_side_contract_versions(seller_side_contracts.deal_id) v on v.contract_id = c.id
  group by c.id, c.type, c.created_at
  order by c.created_at, c.id;
$$;

revoke all on function public.seller_side_contracts(uuid) from public, anon;
grant execute on function public.seller_side_contracts(uuid) to authenticated, service_role;

-- One version the seller side can see, with what a comment on it needs.
-- shown_since is when the team shared it; the seller side's own versions
-- have none, as they saw them from the start.
create or replace function public.seller_side_contract_version(contract_version_id uuid)
  returns table (account_id uuid, deal_id uuid, shown_since timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select c.account_id, c.deal_id, case when v.party = 'seller' then null else v.shared_at end
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

create policy contract_comment_read on public.contract_comment
  for select to authenticated
  using (
    (
      exists (select 1 from public.contract_version v where v.id = contract_version_id)
      or exists (
        select 1 from public.seller_side_contract_version(contract_version_id) s
        where s.shown_since is null or created_at >= s.shown_since
      )
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
