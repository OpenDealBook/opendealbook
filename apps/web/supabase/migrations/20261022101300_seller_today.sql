drop function public.seller_deal_header(uuid);

-- plpgsql so the body is not checked here: the seller room loads later, in 99e.
create or replace function public.seller_deal_header(deal_id uuid)
  returns table (
    id uuid,
    deal_name text,
    stage text,
    public_stage text,
    contact_name text,
    contact_phone text,
    today date
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select d.id, f.name::text, d.stage,
    case when d.resolution = 'won' then 'Closed' else public.seller_stage(d.stage) end,
    o.name::text, coalesce(nullif(o.phone, ''), nullif(t.team_phone, '')),
    (now() at time zone coalesce(me.timezone, tow.timezone, 'UTC'))::date
  from public.deal d
  join public.accounts t on t.id = d.account_id
  left join public.firm f on f.id = d.firm_id
  left join public.accounts o on o.primary_owner_user_id = d.owner_user_id and o.is_personal_account
  left join public.accounts tow on tow.primary_owner_user_id = t.primary_owner_user_id and tow.is_personal_account
  left join public.accounts me on me.primary_owner_user_id = (select auth.uid()) and me.is_personal_account
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
