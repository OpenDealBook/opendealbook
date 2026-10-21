-- Deleting the deal still takes the folder with it.
create or replace function public.refuse_deleting_counsel_uploads_folder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (select 1 from public.counsel_uploads_folder u where u.folder_id = old.id)
    and exists (select 1 from public.deal d where d.id = old.deal_id) then
    raise exception 'This folder holds buyer''s counsel uploads and cannot be deleted'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger counsel_uploads_folder_kept
  before delete on public.dr_folder
  for each row execute function public.refuse_deleting_counsel_uploads_folder();
