-- Sellers and seller's counsel see the buyer and seller main contacts, never a
-- lender.
create or replace function public.seller_room_main_contacts(room_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.seller_room r
  cross join public.deal_main_contact_cards(r.deal_id) m
  where r.id = seller_room_main_contacts.room_id
    and public.is_seller_room_member(r.id)
    and m.side <> 'lender'
  order by m.side, m.company, m.name;
$$;

revoke all on function public.seller_room_main_contacts(uuid) from public, anon;
grant execute on function public.seller_room_main_contacts(uuid) to authenticated, service_role;

-- Buyer's counsel sees every side; seller's counsel sees what the seller does.
create or replace function public.counsel_main_contacts(deal_id uuid)
  returns table (side public.deal_side, name text, role text, company text, phone text, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.side, m.name, m.role, m.company, m.phone, m.email
  from public.deal_main_contact_cards(counsel_main_contacts.deal_id) m
  where public.is_deal_counsel(counsel_main_contacts.deal_id, 'buyer')
    or (m.side <> 'lender' and public.is_deal_counsel(counsel_main_contacts.deal_id, 'seller'))
  order by m.side, m.company, m.name;
$$;

revoke all on function public.counsel_main_contacts(uuid) from public, anon;
grant execute on function public.counsel_main_contacts(uuid) to authenticated, service_role;
