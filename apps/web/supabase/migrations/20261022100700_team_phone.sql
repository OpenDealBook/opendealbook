-- A team's own phone, the seller's fallback when the deal owner has none. Set
-- through the same accounts_update policy as the team's name.

alter table public.accounts add column team_phone text;

alter table public.accounts add constraint accounts_team_phone check (
  team_phone is null or not is_personal_account
);

alter table public.accounts add constraint accounts_team_phone_length check (
  length(team_phone) <= 50
);

grant update (team_phone) on public.accounts to authenticated;

-- plpgsql so the body is not checked here: the seller room loads later, in 99e.
create or replace function public.seller_deal_header(deal_id uuid)
  returns table (
    id uuid,
    deal_name text,
    stage text,
    public_stage text,
    contact_name text,
    contact_phone text
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select d.id, f.name::text, d.stage,
    case when d.resolution = 'won' then 'Closed' else public.seller_stage(d.stage) end,
    o.name::text, coalesce(o.phone, t.team_phone)
  from public.deal d
  join public.accounts t on t.id = d.account_id
  left join public.firm f on f.id = d.firm_id
  left join public.accounts o on o.primary_owner_user_id = d.owner_user_id and o.is_personal_account
  where d.id = seller_deal_header.deal_id
    and (
      public.is_deal_seller(seller_deal_header.deal_id)
      or exists (
        select 1 from public.seller_room r
        where r.deal_id = seller_deal_header.deal_id and public.is_seller_room_member(r.id)
      )
    );
end;
$$;

revoke all on function public.seller_deal_header(uuid) from public, anon;
grant execute on function public.seller_deal_header(uuid) to authenticated, service_role;

-- plpgsql so the body is not checked here: checklist items and the seller room
-- load later.
create or replace function public.seller_waiting_items(deal_id uuid)
  returns table (title text, due_at timestamptz)
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select i.title::text, i.due_at
  from public.checklist_item i
  where i.deal_id = seller_waiting_items.deal_id
    and i.waiting_on = 'seller'
    and i.removed_at is null
    and exists (
      select 1 from public.seller_room r
      where r.deal_id = seller_waiting_items.deal_id and public.is_seller_room_member(r.id)
    )
  order by i.due_at nulls last, i.title;
end;
$$;

revoke all on function public.seller_waiting_items(uuid) from public, anon;
grant execute on function public.seller_waiting_items(uuid) to authenticated, service_role;
