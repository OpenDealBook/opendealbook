-- The rooms a saved lender has had: those linked to it. Rooms are readable by
-- the deal's managers alone, so history is too.
create or replace function public.lender_history(lender_id uuid)
  returns table (
    room_id uuid,
    deal_id uuid,
    deal_name text,
    room_created_at timestamptz,
    status public.lender_room_status,
    asks_count bigint
  )
  language sql stable security definer
  set search_path = '' as $$
  select r.id, r.deal_id, f.name::text, r.created_at, r.status,
    (select count(*) from public.lender_ask a where a.room_id = r.id and a.kind = 'ask')
  from public.lender l
  join public.lender_room r on r.lender_id = l.id
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  where l.id = lender_history.lender_id
    and public.has_permission((select auth.uid()), l.account_id, 'deals.manage')
  order by r.created_at desc, r.id;
$$;

revoke all on function public.lender_history(uuid) from public, anon;
grant execute on function public.lender_history(uuid) to authenticated, service_role;

-- Saving a lender links the team's unlinked rooms on its domain, compared the
-- way brand domains are keyed. Security definer so a teammate who may save
-- lenders links rooms of deals they do not manage.
create or replace function odb.link_rooms_to_saved_lender()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.lender_room r set lender_id = new.id
  where r.account_id = new.account_id
    and r.lender_id is null
    and regexp_replace(lower(r.brand_domain), '^www\.', '') = new.domain;
  return null;
end;
$$;

create trigger link_rooms_to_saved_lender
  after insert or update of domain on public.lender
  for each row execute function odb.link_rooms_to_saved_lender();

-- Rooms saved before this change, unlinked but on a saved lender's domain.
update public.lender_room r set lender_id = l.id
from public.lender l
where l.account_id = r.account_id
  and r.lender_id is null
  and regexp_replace(lower(r.brand_domain), '^www\.', '') = l.domain;
