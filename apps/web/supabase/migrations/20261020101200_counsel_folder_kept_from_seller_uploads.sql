create or replace function public.refuse_moving_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive shared_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join shared_above a on p.id = a.parent_id
    )
    select 1 from shared_above a
    where a.id in (select sf.dr_folder_id from public.seller_room_folder sf)
      or a.id in (select r.uploads_folder_id from public.seller_room r)
  ) and exists (
    with recursive counsel_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = old.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join counsel_above a on p.id = a.parent_id
    ),
    counsel_below as (
      select new.id as id
      union all
      select c.id from public.dr_folder c join counsel_below b on c.parent_id = b.id
    )
    select 1 from (select id from counsel_above union all select id from counsel_below) t
    join public.counsel_uploads_folder u on u.folder_id = t.id
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
