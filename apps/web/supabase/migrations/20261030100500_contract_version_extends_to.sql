-- Each LOI extension version keeps the end of exclusivity it was drafted with,
-- so the seller side shows the date on the version it can see. Existing
-- versions take the date in force when they were created: the latest
-- contract.created or contract.extension_rescheduled up to then, else the
-- extension's current date.

alter table public.contract_version add column extends_to date;

create or replace function public.stamp_contract_version_extends_to()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  new.extends_to := (select c.extends_to from public.contract c where c.id = new.contract_id);
  return new;
end;
$$;

create trigger stamp_contract_version_extends_to
  before insert on public.contract_version
  for each row execute function public.stamp_contract_version_extends_to();

update public.contract_version v
set extends_to = coalesce(
  (
    select (e.payload ->> 'extends_to')::date
    from public.deal_event e
    where e.aggregate_type = 'contract'
      and e.aggregate_id = v.contract_id
      and e.event_type in ('contract.created', 'contract.extension_rescheduled')
      and e.payload ? 'extends_to'
      and e.created_at <= v.created_at
    order by e.aggregate_seq desc
    limit 1
  ),
  c.extends_to
)
from public.contract c
where c.id = v.contract_id and c.type = 'loi_extension';

drop function public.seller_side_contract_versions(uuid);

create or replace function public.seller_side_contract_versions(deal_id uuid)
  returns table (
    id uuid,
    contract_id uuid,
    version int,
    party text,
    change_summary text,
    is_signed boolean,
    shown_at timestamptz,
    extends_to date
  )
  language sql stable security definer
  set search_path = '' as $$
  select v.id, v.contract_id, v.seller_number,
    v.party, v.change_summary, v.is_signed,
    case when v.party = 'seller' then v.created_at else v.shared_at end,
    v.extends_to
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where c.deal_id = seller_side_contract_versions.deal_id
    and (v.shared_at is not null or v.party = 'seller')
    and public.reads_contracts_as_seller_side(c.deal_id)
  order by c.created_at, c.id, v.seller_number;
$$;

revoke all on function public.seller_side_contract_versions(uuid) from public, anon;
grant execute on function public.seller_side_contract_versions(uuid) to authenticated, service_role;
