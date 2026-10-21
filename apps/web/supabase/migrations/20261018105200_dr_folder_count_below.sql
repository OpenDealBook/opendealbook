-- For server code holding an uploads folder to its folder limit: how many
-- folders sit below it, at any depth. Counted here because a read through the
-- API stops at one page of rows. Service role only.
create or replace function public.dr_folder_count_below(folder_id uuid)
  returns integer
  language sql stable security definer
  set search_path = '' as $$
  with recursive below as (
    select f.id from public.dr_folder f where f.parent_id = dr_folder_count_below.folder_id
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select count(*)::integer from below;
$$;

revoke all on function public.dr_folder_count_below(uuid) from public, anon, authenticated;
grant execute on function public.dr_folder_count_below(uuid) to service_role;
