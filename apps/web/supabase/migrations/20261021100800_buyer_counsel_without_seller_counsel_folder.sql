create or replace function public.buyer_counsel_folders(deal_id uuid)
  returns setof public.dr_folder
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  with recursive lender_room_own as (
    select r.private_folder_id as id
    from public.lender_room r
    where r.deal_id = buyer_counsel_folders.deal_id
    union all
    select f.id from public.dr_folder f join lender_room_own o on f.parent_id = o.id
  ),
  seller_counsel_own as (
    select s.folder_id as id
    from public.seller_counsel_folder s
    where s.deal_id = buyer_counsel_folders.deal_id
    union all
    select f.id from public.dr_folder f join seller_counsel_own o on f.parent_id = o.id
  )
  select f.*
  from public.dr_folder f
  where f.deal_id = buyer_counsel_folders.deal_id
    and public.is_deal_counsel(buyer_counsel_folders.deal_id, 'buyer')
    and f.id not in (select o.id from lender_room_own o)
    and f.id not in (select o.id from seller_counsel_own o);
end;
$$;

-- Only the seller side read the Seller's counsel folder, everything below it
-- and its files: the seller room's sellers and seller's counsel. The buyer
-- team and buyer's counsel never do; files reach the buyer only when counsel
-- upload them into the seller room.
create or replace function public.seller_counsel_folder_ids()
  returns uuid[]
  language sql stable security definer
  set search_path = '' as $$
  with recursive below as (
    select s.folder_id as id from public.seller_counsel_folder s
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select coalesce(array_agg(below.id), '{}') from below;
$$;

revoke all on function public.seller_counsel_folder_ids() from public, anon;
grant execute on function public.seller_counsel_folder_ids() to authenticated, service_role;

create or replace function public.is_deal_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_seller_room_member(is_deal_seller_side.deal_id)
    or public.is_deal_counsel(is_deal_seller_side.deal_id, 'seller');
$$;

revoke all on function public.is_deal_seller_side(uuid) from public, anon;
grant execute on function public.is_deal_seller_side(uuid) to authenticated, service_role;

create policy dr_folder_seller_counsel_kept on public.dr_folder
  as restrictive for select to authenticated
  using (
    id <> all ((select public.seller_counsel_folder_ids())::uuid[])
    or public.is_deal_seller_side(deal_id)
  );

create policy dr_folder_seller_counsel_read on public.dr_folder
  for select to authenticated
  using (
    id = any ((select public.seller_counsel_folder_ids())::uuid[])
    and public.is_deal_seller_side(deal_id)
  );

create policy dr_document_seller_counsel_kept on public.dr_document
  as restrictive for select to authenticated
  using (
    folder_id <> all ((select public.seller_counsel_folder_ids())::uuid[])
    or public.is_deal_seller_side(deal_id)
  );

create policy dr_document_seller_counsel_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and folder_id = any ((select public.seller_counsel_folder_ids())::uuid[])
    and public.is_deal_seller_side(deal_id)
  );
