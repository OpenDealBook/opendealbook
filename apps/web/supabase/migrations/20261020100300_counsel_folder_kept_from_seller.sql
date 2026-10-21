create or replace function public.refuse_sharing_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive ancestry as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.dr_folder_id
      union all
      select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
    )
    select 1 from ancestry a join public.counsel_uploads_folder u on u.folder_id = a.id
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger counsel_folder_kept_from_seller
  before insert or update on public.seller_room_folder
  for each row execute function public.refuse_sharing_counsel_folder_to_seller();
