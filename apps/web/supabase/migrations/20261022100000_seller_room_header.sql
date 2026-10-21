-- The seller side never sees the team's own stage names, only these five.
create or replace function public.seller_stage(stage text)
  returns text
  language sql immutable
  set search_path = '' as $$
  select case seller_stage.stage
    when 'sourcing' then 'Talking'
    when 'pre_nda' then 'Talking'
    when 'nda_signed' then 'Talking'
    when 'loi_submitted' then 'LOI'
    when 'loi_accepted' then 'LOI'
    when 'due_diligence' then 'Diligence'
    when 'pa_submitted' then 'Closing'
    when 'pa_accepted' then 'Closing'
    when 'announcement' then 'Closed'
    when 'integration' then 'Closed'
  end;
$$;

grant execute on function public.seller_stage(text) to authenticated, service_role;

drop function public.seller_deal_header(uuid);

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
  select d.id, f.name::text, d.stage, public.seller_stage(d.stage), o.name::text, o.phone
  from public.deal d
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
