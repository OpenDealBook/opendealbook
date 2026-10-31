-- A new room with no link takes the saved lender on its domain.
create or replace function odb.link_new_room_to_saved_lender()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  new.lender_id := (
    select l.id from public.lender l
    where l.account_id = new.account_id
      and l.domain = regexp_replace(lower(new.brand_domain), '^www\.', '')
  );
  return new;
end;
$$;

create trigger link_new_room_to_saved_lender
  before insert on public.lender_room
  for each row when (new.lender_id is null)
  execute function odb.link_new_room_to_saved_lender();
